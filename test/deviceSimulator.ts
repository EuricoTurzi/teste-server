/**
 * Simulador de dispositivo GL33CG para testes
 * Simula mensagens reais do protocolo @Track
 */

import * as net from "net";
import * as readline from "readline";

interface SimulatorConfig {
  serverHost: string;
  serverPort: number;
  deviceImei: string;
  deviceName: string;
  heartbeatInterval: number; // em segundos
}

class GL33CGSimulator {
  private socket: net.Socket | null = null;
  private config: SimulatorConfig;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private messageCount: number = 0;
  private isConnected: boolean = false;
  private rl: readline.Interface;

  constructor(config: SimulatorConfig) {
    this.config = config;
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  /**
   * Conecta ao servidor TCP
   */
  public async connect(): Promise<boolean> {
    return new Promise((resolve) => {
      console.log(
        `🔗 Conectando ao servidor ${this.config.serverHost}:${this.config.serverPort}...`
      );

      this.socket = new net.Socket();

      this.socket.on("connect", () => {
        console.log("✅ Conectado ao servidor!");
        this.isConnected = true;
        this.setupSocketEvents();
        this.startHeartbeat();
        resolve(true);
      });

      this.socket.on("error", (error) => {
        console.error("❌ Erro de conexão:", error.message);
        this.isConnected = false;
        resolve(false);
      });

      this.socket.connect(this.config.serverPort, this.config.serverHost);
    });
  }

  /**
   * Configura eventos do socket
   */
  private setupSocketEvents(): void {
    if (!this.socket) return;

    this.socket.on("data", (data) => {
      const message = data.toString().trim();
      console.log(`📨 Resposta do servidor: ${message}`);

      // Verificar se é um SACK
      if (message.startsWith("+SACK:")) {
        console.log("✅ SACK recebido com sucesso!");
      }
    });

    this.socket.on("close", () => {
      console.log("🔌 Conexão fechada pelo servidor");
      this.isConnected = false;
      this.stopHeartbeat();
    });

    this.socket.on("error", (error) => {
      console.error("❌ Erro no socket:", error.message);
      this.isConnected = false;
    });
  }

  /**
   * Inicia envio automático de heartbeat
   */
  private startHeartbeat(): void {
    this.sendHeartbeat(); // Enviar primeiro heartbeat imediatamente

    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected) {
        this.sendHeartbeat();
      }
    }, this.config.heartbeatInterval * 1000);
  }

  /**
   * Para o envio de heartbeat
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Envia mensagem de heartbeat
   */
  private sendHeartbeat(): void {
    const currentTime = this.getCurrentTimeString();
    const countHex = this.messageCount
      .toString(16)
      .toUpperCase()
      .padStart(4, "0");

    const heartbeatMessage = `+ACK:GTHBD,80200A0303,${this.config.deviceImei},${this.config.deviceName},${currentTime},${countHex}$`;

    this.sendMessage(heartbeatMessage, "💓 Heartbeat");
  }

  /**
   * Envia relatório de posição (GTFRI)
   */
  sendLocationReport(): void {
    const currentTime = this.getCurrentTimeString();
    const countHex = this.messageCount
      .toString(16)
      .toUpperCase()
      .padStart(4, "0");

    // Dados simulados de localização (São Paulo)
    const latitude = -23.5505 + (Math.random() - 0.5) * 0.01;
    const longitude = -46.6333 + (Math.random() - 0.5) * 0.01;
    const speed = Math.floor(Math.random() * 60); // 0-60 km/h
    const heading = Math.floor(Math.random() * 360); // 0-359 graus

    const locationMessage = `+RESP:GTFRI,80200A0303,${this.config.deviceImei},${this.config.deviceName},,10,1,1,${speed}.0,${heading},0.5,${longitude},${latitude},${currentTime},0724,0000,1877,03A3,00,95.2,,,,100,210100,,,,${currentTime},${countHex}$`;

    this.sendMessage(locationMessage, "📍 Relatório de posição");
  }

  /**
   * Envia alerta de bateria baixa
   */
  private sendBatteryAlert(): void {
    const currentTime = this.getCurrentTimeString();
    const countHex = this.messageCount
      .toString(16)
      .toUpperCase()
      .padStart(4, "0");

    const batteryMessage = `+RESP:GTBPL,80200A0303,${this.config.deviceImei},${this.config.deviceName},,15,1,1,0.0,0,0.0,-46.6333,-23.5505,${currentTime},0724,0000,1877,03A3,00,15.2,,,,100,210100,,,,${currentTime},${countHex}$`;

    this.sendMessage(batteryMessage, "🪫 Alerta de bateria baixa");
  }

  /**
   * Envia alerta de falha de energia
   */
  private sendPowerAlert(): void {
    const currentTime = this.getCurrentTimeString();
    const countHex = this.messageCount
      .toString(16)
      .toUpperCase()
      .padStart(4, "0");

    const powerMessage = `+RESP:GTPFA,80200A0303,${this.config.deviceImei},${this.config.deviceName},,20,1,1,0.0,0,0.0,-46.6333,-23.5505,${currentTime},0724,0000,1877,03A3,00,85.5,,,,100,210100,,,,${currentTime},${countHex}$`;

    this.sendMessage(powerMessage, "🔋 Alerta de falha de energia");
  }

  /**
   * Envia mensagem para o servidor
   */
  private sendMessage(message: string, description: string): void {
    if (!this.socket || !this.isConnected) {
      console.log("❌ Não conectado ao servidor");
      return;
    }

    try {
      this.socket.write(message);
      this.messageCount++;
      console.log(`📤 ${description} enviado (${this.messageCount})`);
      console.log(`   Mensagem: ${message}`);
    } catch (error) {
      console.error("❌ Erro ao enviar mensagem:", error);
    }
  }

  /**
   * Obtém timestamp atual no formato YYYYMMDDHHMMSS
   */
  private getCurrentTimeString(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, "0");
    const day = now.getDate().toString().padStart(2, "0");
    const hours = now.getHours().toString().padStart(2, "0");
    const minutes = now.getMinutes().toString().padStart(2, "0");
    const seconds = now.getSeconds().toString().padStart(2, "0");

    return `${year}${month}${day}${hours}${minutes}${seconds}`;
  }

  /**
   * Inicia o menu interativo
   */
  public startInteractiveMenu(): void {
    console.log("\n🎮 MENU INTERATIVO DO SIMULADOR");
    console.log("═══════════════════════════════════");
    console.log("h - Enviar heartbeat manual");
    console.log("l - Enviar relatório de localização");
    console.log("b - Enviar alerta de bateria baixa");
    console.log("p - Enviar alerta de falha de energia");
    console.log("s - Mostrar estatísticas");
    console.log("q - Sair");
    console.log("═══════════════════════════════════");

    this.rl.on("line", (input) => {
      const command = input.trim().toLowerCase();

      switch (command) {
        case "h":
          this.sendHeartbeat();
          break;
        case "l":
          this.sendLocationReport();
          break;
        case "b":
          this.sendBatteryAlert();
          break;
        case "p":
          this.sendPowerAlert();
          break;
        case "s":
          this.showStats();
          break;
        case "q":
          this.disconnect();
          process.exit(0);
          break;
        default:
          console.log("❓ Comando inválido. Digite h, l, b, p, s ou q");
      }

      console.log("\nComando: ");
    });

    console.log("\nComando: ");
  }

  /**
   * Mostra estatísticas do simulador
   */
  private showStats(): void {
    console.log("\n📊 ESTATÍSTICAS DO SIMULADOR");
    console.log("═══════════════════════════════");
    console.log(
      `📱 Dispositivo: ${this.config.deviceName} (${this.config.deviceImei})`
    );
    console.log(
      `🔗 Servidor: ${this.config.serverHost}:${this.config.serverPort}`
    );
    console.log(`📨 Mensagens enviadas: ${this.messageCount}`);
    console.log(`💓 Heartbeat a cada: ${this.config.heartbeatInterval}s`);
    console.log(
      `🟢 Status: ${this.isConnected ? "Conectado" : "Desconectado"}`
    );
    console.log("═══════════════════════════════");
  }

  /**
   * Desconecta do servidor
   */
  public disconnect(): void {
    console.log("🔌 Desconectando...");
    this.stopHeartbeat();

    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }

    this.isConnected = false;
    this.rl.close();
  }
}

// Configuração do simulador
const simulatorConfig: SimulatorConfig = {
  serverHost: process.env.SERVER_HOST || "localhost",
  serverPort: parseInt(process.env.SERVER_PORT || "8080"),
  deviceImei: "865585040014007",
  deviceName: "GL33CG_SIM",
  heartbeatInterval: 30, // 30 segundos
};

// Função principal
async function main() {
  console.log("🔧 SIMULADOR DE DISPOSITIVO GL33CG");
  console.log("═══════════════════════════════════════");
  console.log(`📱 Dispositivo: ${simulatorConfig.deviceName}`);
  console.log(`📟 IMEI: ${simulatorConfig.deviceImei}`);
  console.log(
    `🎯 Servidor: ${simulatorConfig.serverHost}:${simulatorConfig.serverPort}`
  );
  console.log(`💓 Heartbeat: ${simulatorConfig.heartbeatInterval}s`);
  console.log("═══════════════════════════════════════\n");

  const simulator = new GL33CGSimulator(simulatorConfig);

  // Tentar conectar
  const connected = await simulator.connect();

  if (connected) {
    console.log("🎉 Simulador conectado com sucesso!");
    console.log("💓 Heartbeats automáticos iniciados");

    // Aguardar um pouco e enviar primeira localização
    setTimeout(() => {
      simulator.sendLocationReport();
    }, 3000);

    // Iniciar menu interativo
    simulator.startInteractiveMenu();
  } else {
    console.log(
      "❌ Falha na conexão. Certifique-se que o servidor está rodando."
    );
    process.exit(1);
  }

  // Graceful shutdown
  process.on("SIGINT", () => {
    console.log("\n🛑 Parando simulador...");
    simulator.disconnect();
    process.exit(0);
  });
}

// Executar se for chamado diretamente
if (require.main === module) {
  main().catch(console.error);
}

export { GL33CGSimulator };
