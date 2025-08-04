/**
 * Sistema de logging avançado para o servidor GL33CG
 * Múltiplos arquivos, rotação automática e níveis de log
 */

import * as fs from "fs";
import * as path from "path";
import { BaseMessage, ConnectedClient } from "../types/protocol";

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export enum LogType {
  APPLICATION = "application",
  PROTOCOL = "protocol",
  CONNECTION = "connection",
  ERROR = "error",
  DEVICE = "device",
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  type: LogType;
  clientId?: string;
  imei?: string;
  message: string;
  data?: any;
}

interface LoggerConfig {
  logLevel: LogLevel;
  logDirectory: string;
  maxFileSize: number; // em MB
  maxFiles: number;
  enableConsole: boolean;
  enableRotation: boolean;
}

class Logger {
  private static instance: Logger;
  private config: LoggerConfig;
  private logStreams: Map<LogType, fs.WriteStream> = new Map();

  private constructor() {
    this.config = this.loadConfig();
    this.initializeLogDirectory();
    this.initializeLogStreams();
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * Carrega configuração do logger
   */
  private loadConfig(): LoggerConfig {
    const logLevelMap: { [key: string]: LogLevel } = {
      debug: LogLevel.DEBUG,
      info: LogLevel.INFO,
      warn: LogLevel.WARN,
      error: LogLevel.ERROR,
    };

    return {
      logLevel:
        logLevelMap[process.env.LOG_LEVEL?.toLowerCase() || "info"] ||
        LogLevel.INFO,
      logDirectory: process.env.LOG_DIRECTORY || "./logs",
      maxFileSize: parseInt(process.env.MAX_LOG_FILE_SIZE || "10"), // 10MB
      maxFiles: parseInt(process.env.MAX_LOG_FILES || "5"),
      enableConsole: process.env.NODE_ENV === "development",
      enableRotation: process.env.ENABLE_LOG_ROTATION !== "false",
    };
  }

  /**
   * Inicializa o diretório de logs
   */
  private initializeLogDirectory(): void {
    if (!fs.existsSync(this.config.logDirectory)) {
      fs.mkdirSync(this.config.logDirectory, { recursive: true });
    }
  }

  /**
   * Inicializa streams de log para cada tipo
   */
  private initializeLogStreams(): void {
    const logTypes = Object.values(LogType);

    for (const logType of logTypes) {
      const logFile = path.join(this.config.logDirectory, `${logType}.log`);
      const stream = fs.createWriteStream(logFile, { flags: "a" });
      this.logStreams.set(logType, stream);
    }
  }

  /**
   * Formata timestamp para logs
   */
  private formatTimestamp(): string {
    return new Date().toISOString();
  }

  /**
   * Formata entrada de log
   */
  private formatLogEntry(entry: LogEntry): string {
    const levelName = LogLevel[entry.level];
    const clientInfo = entry.clientId ? `[${entry.clientId}]` : "";
    const imeiInfo = entry.imei ? `[IMEI:${entry.imei}]` : "";

    let logLine = `${entry.timestamp} [${levelName}] ${clientInfo}${imeiInfo} ${entry.message}`;

    if (entry.data) {
      logLine += ` | Data: ${JSON.stringify(entry.data)}`;
    }

    return logLine;
  }

  /**
   * Escreve log no arquivo e console
   */
  private writeLog(entry: LogEntry): void {
    // Verificar se deve logar baseado no nível
    if (entry.level < this.config.logLevel) {
      return;
    }

    const formattedEntry = this.formatLogEntry(entry);

    // Escrever no arquivo
    const stream = this.logStreams.get(entry.type);
    if (stream) {
      stream.write(formattedEntry + "\n");
    }

    // Escrever no console se habilitado
    if (this.config.enableConsole) {
      this.writeToConsole(entry.level, formattedEntry);
    }

    // Verificar rotação de arquivos
    if (this.config.enableRotation) {
      this.checkFileRotation(entry.type);
    }
  }

  /**
   * Escreve no console com cores
   */
  private writeToConsole(level: LogLevel, message: string): void {
    const colors = {
      [LogLevel.DEBUG]: "\x1b[36m", // Cyan
      [LogLevel.INFO]: "\x1b[32m", // Green
      [LogLevel.WARN]: "\x1b[33m", // Yellow
      [LogLevel.ERROR]: "\x1b[31m", // Red
    };

    const reset = "\x1b[0m";
    console.log(`${colors[level]}${message}${reset}`);
  }

  /**
   * Verifica se precisa rotacionar arquivo
   */
  private checkFileRotation(logType: LogType): void {
    const logFile = path.join(this.config.logDirectory, `${logType}.log`);

    try {
      const stats = fs.statSync(logFile);
      const fileSizeInMB = stats.size / (1024 * 1024);

      if (fileSizeInMB > this.config.maxFileSize) {
        this.rotateLogFile(logType);
      }
    } catch (error) {
      // Arquivo não existe ou erro ao acessar
    }
  }

  /**
   * Rotaciona arquivo de log
   */
  private rotateLogFile(logType: LogType): void {
    const logFile = path.join(this.config.logDirectory, `${logType}.log`);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const rotatedFile = path.join(
      this.config.logDirectory,
      `${logType}-${timestamp}.log`
    );

    try {
      // Fechar stream atual
      const currentStream = this.logStreams.get(logType);
      if (currentStream) {
        currentStream.end();
      }

      // Renomear arquivo atual
      if (fs.existsSync(logFile)) {
        fs.renameSync(logFile, rotatedFile);
      }

      // Criar novo stream
      const newStream = fs.createWriteStream(logFile, { flags: "a" });
      this.logStreams.set(logType, newStream);

      // Limpar arquivos antigos
      this.cleanOldLogFiles(logType);

      this.info(LogType.APPLICATION, "Log file rotated", {
        logType,
        rotatedFile: path.basename(rotatedFile),
      });
    } catch (error) {
      console.error("Erro ao rotacionar arquivo de log:", error);
    }
  }

  /**
   * Remove arquivos de log antigos
   */
  private cleanOldLogFiles(logType: LogType): void {
    try {
      const files = fs
        .readdirSync(this.config.logDirectory)
        .filter(
          (file) => file.startsWith(`${logType}-`) && file.endsWith(".log")
        )
        .map((file) => ({
          name: file,
          path: path.join(this.config.logDirectory, file),
          mtime: fs.statSync(path.join(this.config.logDirectory, file)).mtime,
        }))
        .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

      // Remover arquivos excedentes
      if (files.length > this.config.maxFiles) {
        const filesToDelete = files.slice(this.config.maxFiles);
        filesToDelete.forEach((file) => {
          fs.unlinkSync(file.path);
        });
      }
    } catch (error) {
      console.error("Erro ao limpar arquivos antigos:", error);
    }
  }

  // Métodos públicos de logging

  /**
   * Log de debug
   */
  public debug(
    type: LogType,
    message: string,
    data?: any,
    clientId?: string,
    imei?: string
  ): void {
    this.writeLog({
      timestamp: this.formatTimestamp(),
      level: LogLevel.DEBUG,
      type,
      clientId,
      imei,
      message,
      data,
    });
  }

  /**
   * Log de informação
   */
  public info(
    type: LogType,
    message: string,
    data?: any,
    clientId?: string,
    imei?: string
  ): void {
    this.writeLog({
      timestamp: this.formatTimestamp(),
      level: LogLevel.INFO,
      type,
      clientId,
      imei,
      message,
      data,
    });
  }

  /**
   * Log de warning
   */
  public warn(
    type: LogType,
    message: string,
    data?: any,
    clientId?: string,
    imei?: string
  ): void {
    this.writeLog({
      timestamp: this.formatTimestamp(),
      level: LogLevel.WARN,
      type,
      clientId,
      imei,
      message,
      data,
    });
  }

  /**
   * Log de erro
   */
  public error(
    type: LogType,
    message: string,
    error?: Error,
    data?: any,
    clientId?: string,
    imei?: string
  ): void {
    this.writeLog({
      timestamp: this.formatTimestamp(),
      level: LogLevel.ERROR,
      type,
      clientId,
      imei,
      message,
      data: {
        ...data,
        error: error
          ? {
              name: error.name,
              message: error.message,
              stack: error.stack,
            }
          : undefined,
      },
    });
  }

  // Métodos específicos para o protocolo GL33CG

  /**
   * Log de conexão de cliente
   */
  public logConnection(clientId: string, remoteAddress: string): void {
    this.info(
      LogType.CONNECTION,
      "New client connected",
      {
        remoteAddress,
      },
      clientId
    );
  }

  /**
   * Log de desconexão de cliente
   */
  public logDisconnection(
    clientId: string,
    duration: number,
    messageCount: number,
    imei?: string
  ): void {
    this.info(
      LogType.CONNECTION,
      "Client disconnected",
      {
        duration: `${duration}s`,
        messageCount,
      },
      clientId,
      imei
    );
  }

  /**
   * Log de identificação de dispositivo
   */
  public logDeviceIdentification(
    clientId: string,
    imei: string,
    deviceName: string
  ): void {
    this.info(
      LogType.DEVICE,
      "Device identified",
      {
        deviceName,
      },
      clientId,
      imei
    );
  }

  /**
   * Log de mensagem recebida
   */
  public logMessageReceived(clientId: string, message: BaseMessage): void {
    this.info(
      LogType.PROTOCOL,
      `Message received: ${message.frameType}:${message.commandWord}`,
      {
        fullMessage: message.rawMessage,
        timestamp: message.sendTime,
        countNumber: message.countNumber,
      },
      clientId,
      message.uniqueId
    );
  }

  /**
   * Log de resposta SACK enviada
   */
  public logSackSent(
    clientId: string,
    sackMessage: string,
    imei?: string
  ): void {
    this.info(
      LogType.PROTOCOL,
      "SACK response sent",
      {
        sackMessage,
      },
      clientId,
      imei
    );
  }

  /**
   * Log de erro no protocolo
   */
  public logProtocolError(
    clientId: string,
    error: string,
    rawMessage?: string,
    imei?: string
  ): void {
    this.error(
      LogType.PROTOCOL,
      "Protocol parsing error",
      undefined,
      {
        error,
        rawMessage,
      },
      clientId,
      imei
    );
  }

  /**
   * Log de heartbeat
   */
  public logHeartbeat(clientId: string, imei: string): void {
    this.debug(
      LogType.PROTOCOL,
      "Heartbeat received",
      undefined,
      clientId,
      imei
    );
  }

  /**
   * Força flush de todos os streams
   */
  public flush(): void {
    for (const stream of this.logStreams.values()) {
      if (stream.writable) {
        stream.cork();
        stream.uncork();
      }
    }
  }

  /**
   * Fecha todos os streams
   */
  public close(): void {
    for (const stream of this.logStreams.values()) {
      stream.end();
    }
    this.logStreams.clear();
  }

  /**
   * Obtém estatísticas dos logs
   */
  public getLogStats(): any {
    const stats: any = {};

    try {
      for (const logType of Object.values(LogType)) {
        const logFile = path.join(this.config.logDirectory, `${logType}.log`);
        if (fs.existsSync(logFile)) {
          const fileStats = fs.statSync(logFile);
          stats[logType] = {
            size: `${(fileStats.size / 1024).toFixed(2)} KB`,
            lastModified: fileStats.mtime,
            lines: this.countFileLines(logFile),
          };
        }
      }
    } catch (error: unknown) {
      // 1) se for um Error, passa direto
      if (error instanceof Error) {
        this.error(LogType.APPLICATION, "Error getting log stats", error);
      } else {
        // 2) caso algum outro tipo caia aqui (string, objeto literal, etc.),
        //    converte para Error para satisfazer a assinatura.
        this.error(
          LogType.APPLICATION,
          "Error getting log stats",
          new Error(String(error))
        );
      }
    }

    return stats;
  }

  /**
   * Conta linhas de um arquivo
   */
  private countFileLines(filePath: string): number {
    try {
      const content = fs.readFileSync(filePath, "utf8");
      return content.split("\n").length - 1;
    } catch {
      return 0;
    }
  }
}

// Exportar instância singleton
export const logger = Logger.getInstance();
export { Logger };
