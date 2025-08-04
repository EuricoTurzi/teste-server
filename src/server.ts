import * as net from "net";
import * as dotenv from "dotenv";
import { ProtocolParser } from "./utils/protocolParser";
import {
  ConnectedClient,
  ServerConfig,
  BaseMessage,
  FrameType,
} from "./types/protocol";
import { logger, LogType } from "./services/logger";
import { dataManager } from "./services/dataManager";

// Carregar variáveis de ambiente
dotenv.config();

class GL33CGTcpServer {
  private server: net.Server;
  private clients: Map<string, ConnectedClient> = new Map();
  private config: ServerConfig;

  constructor() {
    this.config = this.loadConfig();
    this.server = net.createServer();
    this.setupServerEvents();
  }

  /**
   * Carrega configuração do servidor
   */
  private loadConfig(): ServerConfig {
    return {
      // Render usa PORT, mas mantém SERVER_PORT como fallback
      port: parseInt(process.env.PORT || process.env.SERVER_PORT || "8080"),
      host: process.env.SERVER_HOST || "0.0.0.0",
      enableSack: process.env.ENABLE_SACK === "true",
      sackMode: parseInt(process.env.SACK_MODE || "1"),
      heartbeatInterval: parseInt(process.env.HEARTBEAT_INTERVAL || "60"),
      connectionLife: parseInt(process.env.CONNECTION_LIFE || "30"),
      enableLogging: process.env.ENABLE_LOGGING === "true",
      maxConnections: parseInt(process.env.MAX_CONNECTIONS || "1000"),
    };
  }

  /**
   * Configura eventos do servidor
   */
  private setupServerEvents(): void {
    this.server.on("connection", this.handleConnection.bind(this));
    this.server.on("error", this.handleServerError.bind(this));
    this.server.on("listening", this.handleServerListening.bind(this));
  }

  /**
   * Verifica se a mensagem é um health check HTTP
   */
  private isHttpHealthCheck(data: string): boolean {
    return (
      data.includes("HTTP/") ||
      data.includes("GET ") ||
      data.includes("HEAD ") ||
      data.includes("POST ") ||
      data.includes("User-Agent:")
    );
  }

  /**
   * Manipula nova conexão de cliente
   */
  private handleConnection(socket: net.Socket): void {
    const clientId = `${socket.remoteAddress}:${socket.remotePort}`;
    let isHttpConnection = false;

    // Verificar limite de conexões
    if (this.clients.size >= this.config.maxConnections) {
      logger.warn(
        LogType.CONNECTION,
        "Connection limit reached",
        {
          maxConnections: this.config.maxConnections,
        },
        clientId
      );
      console.log(
        `❌ Limite de conexões atingido (${this.config.maxConnections})`
      );
      socket.end();
      return;
    }

    // Handler para detectar tipo de conexão no primeiro data
    const initialDataHandler = (data: Buffer) => {
      const dataStr = data.toString("ascii");

      // Verificar se é health check HTTP
      if (this.isHttpHealthCheck(dataStr)) {
        isHttpConnection = true;

        // Responder ao health check HTTP
        const stats = this.getStats();
        const httpResponse =
          `HTTP/1.1 200 OK\r\n` +
          `Content-Type: application/json\r\n` +
          `Access-Control-Allow-Origin: *\r\n` +
          `Content-Length: ${
            JSON.stringify({
              status: "healthy",
              uptime: Math.round(process.uptime()),
              connections: stats.totalConnections,
              devices: stats.identifiedDevices,
              timestamp: new Date().toISOString(),
            }).length
          }\r\n\r\n` +
          JSON.stringify({
            status: "healthy",
            uptime: Math.round(process.uptime()),
            connections: stats.totalConnections,
            devices: stats.identifiedDevices,
            timestamp: new Date().toISOString(),
          });

        socket.write(httpResponse);
        socket.end();

        // Log mais limpo para health checks
        if (process.env.NODE_ENV === "development") {
          console.log(`🌐 [${clientId}] Health check HTTP - respondido`);
        }
        return;
      }

      // Se chegou aqui, é uma conexão TCP válida
      socket.removeListener("data", initialDataHandler);
      this.setupTcpClient(clientId, socket);

      // Processar os dados iniciais como mensagem TCP
      this.handleClientData(clientId, data);
    };

    // Escutar primeiro pacote de dados
    socket.once("data", initialDataHandler);

    // Configurar timeout para conexões não identificadas
    socket.setTimeout(5000, () => {
      if (!isHttpConnection && !this.clients.has(clientId)) {
        socket.destroy();
      }
    });

    // Handlers de erro e close para conexões não TCP
    socket.on("error", (error) => {
      if (!isHttpConnection) {
        this.handleClientError(clientId, error);
      }
    });

    socket.on("close", () => {
      if (!isHttpConnection && this.clients.has(clientId)) {
        this.handleClientDisconnect(clientId);
      }
    });
  }

  /**
   * Configura cliente TCP após identificação
   */
  private setupTcpClient(clientId: string, socket: net.Socket): void {
    logger.logConnection(clientId, socket.remoteAddress || "unknown");
    console.log(`🔗 Nova conexão TCP: ${clientId}`);

    // Criar objeto do cliente
    const client: ConnectedClient = {
      socket,
      lastHeartbeat: new Date(),
      connected: new Date(),
      messageCount: 0,
      isAlive: true,
    };

    this.clients.set(clientId, client);

    // Configurar eventos do socket TCP
    socket.on("data", (data) => this.handleClientData(clientId, data));
    socket.on("close", () => this.handleClientDisconnect(clientId));
    socket.on("error", (error) => this.handleClientError(clientId, error));

    // Configurar timeout de conexão TCP
    socket.setTimeout(this.config.connectionLife * 1000, () => {
      logger.warn(
        LogType.CONNECTION,
        "Connection timeout",
        {
          timeout: `${this.config.connectionLife}s`,
        },
        clientId,
        client.imei
      );
      console.log(`⏰ Timeout de conexão: ${clientId}`);
      socket.destroy();
    });
  }

  /**
   * Manipula dados recebidos do cliente TCP
   */
  private async handleClientData(
    clientId: string,
    data: Buffer
  ): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) return;

    try {
      const message = data.toString("ascii").trim();
      logger.debug(
        LogType.PROTOCOL,
        "Raw data received",
        { rawData: message },
        clientId,
        client.imei
      );
      console.log(`📨 [${clientId}] Recebido: ${message}`);

      // Verificar se a mensagem está completa
      if (!ProtocolParser.isMessageComplete(message)) {
        logger.warn(
          LogType.PROTOCOL,
          "Incomplete message received",
          { message },
          clientId,
          client.imei
        );
        console.log(`⚠️ [${clientId}] Mensagem incompleta`);
        return;
      }

      // Extrair múltiplas mensagens se existirem
      const messages = ProtocolParser.extractMessages(message);

      for (const singleMessage of messages) {
        this.processMessage(clientId, singleMessage);
      }
    } catch (error) {
      logger.error(
        LogType.PROTOCOL,
        "Error processing client data",
        error as Error,
        {
          dataLength: data.length,
        },
        clientId,
        client.imei
      );
      console.error(`❌ [${clientId}] Erro ao processar dados:`, error);
    }
  }

  /**
   * Processa uma mensagem individual
   */
  private async processMessage(
    clientId: string,
    message: string
  ): Promise<void> {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Parse da mensagem
    const parseResult = ProtocolParser.parseMessage(message);

    if (!parseResult.success) {
      logger.logProtocolError(
        clientId,
        parseResult.error || "Unknown parsing error",
        message,
        client.imei
      );
      console.error(`❌ [${clientId}] Erro no parsing: ${parseResult.error}`);
      return;
    }

    const parsedMessage = parseResult.message!;
    client.messageCount++;

    // Log da mensagem recebida
    logger.logMessageReceived(clientId, parsedMessage);

    // Atualizar informações do cliente
    if (parsedMessage.uniqueId && !client.imei) {
      client.imei = parsedMessage.uniqueId;
      client.deviceName = parsedMessage.deviceName;
      logger.logDeviceIdentification(
        clientId,
        parsedMessage.uniqueId,
        parsedMessage.deviceName
      );
      console.log(
        `📱 [${clientId}] Dispositivo identificado: ${parsedMessage.deviceName} (${parsedMessage.uniqueId})`
      );

      // Notificar gerenciador de dados sobre nova identificação
      await dataManager.handleClientConnection(
        clientId,
        client.socket.remoteAddress || "unknown",
        parsedMessage.uniqueId
      );
    }

    // Salvar mensagem no banco de dados
    await dataManager.handleMessage(clientId, parsedMessage, client);

    // Atualizar último heartbeat
    if (
      parsedMessage.frameType === FrameType.ACK &&
      parsedMessage.commandWord === "GTHBD"
    ) {
      client.lastHeartbeat = new Date();
      logger.logHeartbeat(clientId, parsedMessage.uniqueId);
      console.log(`💓 [${clientId}] Heartbeat recebido`);
    }

    // Log da mensagem processada
    logger.info(
      LogType.PROTOCOL,
      `Message processed: ${parsedMessage.frameType}:${parsedMessage.commandWord}`,
      {
        messageCount: client.messageCount,
      },
      clientId,
      parsedMessage.uniqueId
    );
    console.log(
      `✅ [${clientId}] ${parsedMessage.frameType}:${parsedMessage.commandWord} processado`
    );

    // Enviar resposta SACK se necessário
    if (
      this.config.enableSack &&
      parseResult.needsAck &&
      parseResult.ackMessage
    ) {
      this.sendAckMessage(clientId, parseResult.ackMessage);
    }

    // Processar comando específico
    this.handleSpecificCommand(clientId, parsedMessage);
  }

  /**
   * Manipula comandos específicos
   */
  private handleSpecificCommand(clientId: string, message: BaseMessage): void {
    const logData = {
      commandWord: message.commandWord,
      sendTime: message.sendTime,
      countNumber: message.countNumber,
    };

    switch (message.commandWord) {
      case "GTHBD":
        // Heartbeat já foi processado acima
        break;

      case "GTFRI":
        logger.info(
          LogType.DEVICE,
          "Location report received",
          logData,
          clientId,
          message.uniqueId
        );
        console.log(`📍 [${clientId}] Relatório de posição recebido`);
        break;

      case "GTPFA":
        logger.warn(
          LogType.DEVICE,
          "Power failure alert",
          logData,
          clientId,
          message.uniqueId
        );
        console.log(`🔋 [${clientId}] Alerta: Falha de energia`);
        break;

      case "GTBPL":
        logger.warn(
          LogType.DEVICE,
          "Battery low alert",
          logData,
          clientId,
          message.uniqueId
        );
        console.log(`🪫 [${clientId}] Alerta: Bateria baixa`);
        break;

      case "GTTEM":
        logger.info(
          LogType.DEVICE,
          "Temperature report",
          logData,
          clientId,
          message.uniqueId
        );
        console.log(`🌡️ [${clientId}] Relatório de temperatura`);
        break;

      case "GTJDS":
        logger.warn(
          LogType.DEVICE,
          "Jamming detection alert",
          logData,
          clientId,
          message.uniqueId
        );
        console.log(`📡 [${clientId}] Alerta: Interferência detectada`);
        break;

      case "GTGEO":
        logger.info(
          LogType.DEVICE,
          "Geofence alert",
          logData,
          clientId,
          message.uniqueId
        );
        console.log(`🗺️ [${clientId}] Alerta: Geocerca`);
        break;

      default:
        logger.debug(
          LogType.PROTOCOL,
          "Unmapped command received",
          logData,
          clientId,
          message.uniqueId
        );
        console.log(
          `📄 [${clientId}] Comando não mapeado: ${message.commandWord}`
        );
    }
  }

  /**
   * Envia mensagem de acknowledgment para o cliente
   */
  private sendAckMessage(clientId: string, ackMessage: string): void {
    const client = this.clients.get(clientId);
    if (!client || !client.socket.writable) return;

    try {
      client.socket.write(ackMessage);
      logger.logSackSent(clientId, ackMessage, client.imei);
      console.log(`📤 [${clientId}] SACK enviado: ${ackMessage}`);
    } catch (error) {
      logger.error(
        LogType.PROTOCOL,
        "Error sending SACK",
        error as Error,
        {
          ackMessage,
        },
        clientId,
        client.imei
      );
      console.error(`❌ [${clientId}] Erro ao enviar SACK:`, error);
    }
  }

  /**
   * Manipula desconexão do cliente
   */
  private async handleClientDisconnect(clientId: string): Promise<void> {
    const client = this.clients.get(clientId);
    if (client) {
      const duration = Math.round(
        (new Date().getTime() - client.connected.getTime()) / 1000
      );

      // Notificar gerenciador de dados sobre desconexão
      await dataManager.handleClientDisconnection(
        clientId,
        duration,
        client.messageCount
      );

      logger.logDisconnection(
        clientId,
        duration,
        client.messageCount,
        client.imei
      );
      console.log(
        `👋 [${clientId}] Desconectado após ${duration}s (${client.messageCount} mensagens)`
      );

      if (client.imei) {
        console.log(
          `📱 Dispositivo ${client.deviceName} (${client.imei}) desconectado`
        );
      }
    }

    this.clients.delete(clientId);
  }

  /**
   * Manipula erro do cliente
   */
  private handleClientError(clientId: string, error: Error): void {
    const client = this.clients.get(clientId);
    logger.error(
      LogType.CONNECTION,
      "Client socket error",
      error,
      undefined,
      clientId,
      client?.imei
    );
    console.error(`❌ [${clientId}] Erro no cliente:`, error.message);
    this.clients.delete(clientId);
  }

  /**
   * Manipula erro do servidor
   */
  private handleServerError(error: Error): void {
    logger.error(LogType.APPLICATION, "Server error", error);
    console.error("❌ Erro no servidor:", error);
  }

  /**
   * Manipula evento de servidor ouvindo
   */
  private handleServerListening(): void {
    const address = this.server.address() as net.AddressInfo;
    logger.info(LogType.APPLICATION, "GL33CG TCP Server started", {
      host: address.address,
      port: address.port,
      config: this.config,
    });

    console.log("🚀 Servidor GL33CG TCP iniciado!");
    console.log(`🔗 Ouvindo em: ${address.address}:${address.port}`);
    console.log(`⚙️  Configurações:`);
    console.log(`   - SACK habilitado: ${this.config.enableSack}`);
    console.log(`   - Modo SACK: ${this.config.sackMode}`);
    console.log(`   - Máx conexões: ${this.config.maxConnections}`);
    console.log(`   - Timeout conexão: ${this.config.connectionLife}s`);
    console.log("📡 Aguardando dispositivos GL33CG...");

    if (process.env.NODE_ENV === "production") {
      console.log("🌐 Health check HTTP endpoint ativo");
    }
  }

  /**
   * Inicia o servidor
   */
  public async start(): Promise<void> {
    // Testar conexão com banco antes de iniciar
    console.log("🔍 Testando conexão com banco de dados...");
    const dbConnected = await dataManager.testDatabaseConnection();

    if (!dbConnected) {
      console.log(
        "⚠️  Banco de dados não conectado - servidor continuará apenas com logs"
      );
      logger.warn(
        LogType.APPLICATION,
        "Database not connected, running in log-only mode"
      );
    } else {
      console.log("✅ Banco de dados conectado com sucesso!");
    }

    this.server.listen(this.config.port, this.config.host);
  }

  /**
   * Para o servidor
   */
  public stop(): void {
    logger.info(LogType.APPLICATION, "Stopping server", {
      totalConnections: this.clients.size,
      totalClients: Array.from(this.clients.values()).length,
    });
    console.log("🛑 Parando servidor...");

    // Fechar todas as conexões
    for (const [clientId, client] of this.clients) {
      client.socket.destroy();
    }
    this.clients.clear();

    // Fechar servidor
    this.server.close((err) => {
      if (err) {
        logger.error(LogType.APPLICATION, "Error stopping server", err);
        console.error("❌ Erro ao parar servidor:", err);
      } else {
        logger.info(LogType.APPLICATION, "Server stopped successfully");
        console.log("✅ Servidor parado com sucesso");
      }
    });

    // Fechar logs
    logger.flush();
  }

  /**
   * Obtém estatísticas do servidor
   */
  public getStats() {
    const connectedClients = Array.from(this.clients.values());
    const devicesWithImei = connectedClients.filter((c) => c.imei).length;

    return {
      totalConnections: this.clients.size,
      identifiedDevices: devicesWithImei,
      totalMessages: connectedClients.reduce(
        (sum, client) => sum + client.messageCount,
        0
      ),
      uptime: process.uptime(),
      config: this.config,
    };
  }

  /**
   * Exibe estatísticas do servidor
   */
  public async showStats(): Promise<void> {
    const stats = this.getStats();
    const logStats = logger.getLogStats();
    const dbStats = await dataManager.getStats();

    logger.info(LogType.APPLICATION, "Server statistics", {
      ...stats,
      logStats,
      dbStats,
    });

    console.log("\n📊 ESTATÍSTICAS DO SERVIDOR");
    console.log("═══════════════════════════");
    console.log(`🔗 Conexões ativas: ${stats.totalConnections}`);
    console.log(`📱 Dispositivos identificados: ${stats.identifiedDevices}`);
    console.log(`📨 Total de mensagens: ${stats.totalMessages}`);
    console.log(`⏱️  Tempo ativo: ${Math.round(stats.uptime)}s`);

    // Estatísticas do banco de dados
    if (Object.keys(dbStats).length > 0) {
      console.log("\n🗄️  ESTATÍSTICAS DO BANCO:");
      console.log(`   Dispositivos totais: ${dbStats.total_devices || 0}`);
      console.log(`   Dispositivos ativos: ${dbStats.active_devices || 0}`);
      console.log(`   Mensagens hoje: ${dbStats.total_messages_today || 0}`);
      console.log(`   Alertas ativos: ${dbStats.active_alerts || 0}`);
    }

    console.log("\n📁 ESTATÍSTICAS DOS LOGS:");
    Object.entries(logStats).forEach(([logType, stats]: [string, any]) => {
      console.log(`   ${logType}: ${stats.size} (${stats.lines} linhas)`);
    });

    console.log("═══════════════════════════\n");
  }
}

// Inicializar servidor
const server = new GL33CGTcpServer();

// Manipular sinais do sistema
process.on("SIGINT", () => {
  console.log("\n🛑 Recebido SIGINT (Ctrl+C)");
  server.showStats();
  server.stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("🛑 Recebido SIGTERM");
  server.stop();
  process.exit(0);
});

// Exibir estatísticas periodicamente (a cada 5 minutos)
setInterval(() => {
  server.showStats();
}, 5 * 60 * 1000);

// Iniciar servidor
server.start();
