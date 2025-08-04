/**
 * Tipos e interfaces para o protocolo @Track da Queclink GL33CG
 * Baseado no documento: GL33CG @Track Air Interface Protocol v0303
 */

// Tipos de frames do protocolo
export enum FrameType {
  ACK = "+ACK", // Acknowledgement
  RESP = "+RESP", // Response
  BUFF = "+BUFF", // Buffer Report
  SACK = "+SACK", // Server Acknowledgement
}

// Comandos principais do protocolo
export enum CommandType {
  GTHBD = "GTHBD", // Heartbeat Data
  GTFRI = "GTFRI", // Fixed Report Information
  GTPFA = "GTPFA", // Power Failure Alarm
  GTPDP = "GTPDP", // GPRS Connection Failure
  GTBPL = "GTBPL", // Battery Low
  GTTEM = "GTTEM", // Temperature
  GTJDS = "GTJDS", // Jamming Detection
  GTGEO = "GTGEO", // Geofence
  GTUPD = "GTUPD", // Update Report
  GTRTP = "GTRTP", // Remote File Transfer
}

// Modos de relatório suportados
export enum ReportMode {
  STOP = 0, // Stop mode
  TCP_SHORT_PREFERRED = 1, // TCP short-connection preferred
  TCP_SHORT_FORCED = 2, // TCP short-connection forced
  TCP_LONG = 3, // TCP long-connection
  UDP = 4, // UDP mode
  SMS_FORCED = 5, // Forced SMS mode
  UDP_FIXED_PORT = 6, // UDP with fixed local port
  TCP_BACKUP = 7, // Backup server supported TCP long-connection
  MQTT = 9, // MQTT mode
}

// Modos SACK (Server Acknowledgement)
export enum SackMode {
  NO_REPLY = 0, // Não responde com SACK
  REPLY_WITH_CHECK = 1, // Responde com SACK e verifica serial
  REPLY_NO_CHECK = 2, // Responde com SACK sem verificar serial
}

// Interface base para mensagens do protocolo
export interface BaseMessage {
  frameType: FrameType;
  commandWord: string;
  fullProtocolVersion: string;
  uniqueId: string; // IMEI do dispositivo
  deviceName: string;
  sendTime: string; // YYYYMMDDHHMMSS
  countNumber: string; // 0000-FFFF
  rawMessage: string; // Mensagem original completa
}

// Interface para mensagens de Heartbeat
export interface HeartbeatMessage extends BaseMessage {
  commandWord: "GTHBD";
}

// Interface para mensagens de resposta SACK
export interface SackMessage {
  frameType: FrameType.SACK;
  commandWord?: string;
  fullProtocolVersion?: string;
  countNumber: string;
}

// Interface para dados de localização
export interface LocationData {
  latitude: number;
  longitude: number;
  speed: number;
  heading: number;
  altitude: number;
  hdop: number;
  mcc: string; // Mobile Country Code
  mnc: string; // Mobile Network Code
  lac: string; // Location Area Code
  cellId: string; // Cell ID
}

// Interface para informações do dispositivo
export interface DeviceInfo {
  imei: string;
  deviceName: string;
  protocolVersion: string;
  batteryLevel?: number;
  gsmSignal?: number;
  temperature?: number;
}

// Interface para configuração do servidor
export interface ServerConfig {
  port: number;
  host: string;
  enableSack: boolean;
  sackMode: SackMode;
  heartbeatInterval: number; // em minutos
  connectionLife: number; // em segundos
  enableLogging: boolean;
  maxConnections: number;
}

// Interface para cliente conectado
export interface ConnectedClient {
  socket: any; // Socket TCP
  imei?: string;
  deviceName?: string;
  lastHeartbeat: Date;
  connected: Date;
  messageCount: number;
  isAlive: boolean;
}

// Interface para resposta de parsing
export interface ParseResult {
  success: boolean;
  message?: BaseMessage;
  error?: string;
  needsAck?: boolean;
  ackMessage?: string;
}

// Tipos utilitários
export type MessageHandler = (
  message: BaseMessage,
  client: ConnectedClient
) => Promise<void>;
export type ErrorHandler = (error: Error, client?: ConnectedClient) => void;

// Constantes do protocolo
export const PROTOCOL_CONSTANTS = {
  TAIL_CHAR: "$",
  SEPARATOR: ":",
  FIELD_SEPARATOR: ",",
  DEFAULT_PROTOCOL_VERSION: "80200A0303",
  DEFAULT_DEVICE_TYPE: "GL33CG",
  MAX_MESSAGE_LENGTH: 1024,
  HEARTBEAT_TIMEOUT: 300000, // 5 minutos em ms
  CONNECTION_TIMEOUT: 30000, // 30 segundos em ms
} as const;
