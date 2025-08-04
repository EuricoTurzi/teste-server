/**
 * Gerenciador de dados - Integra servidor TCP com banco de dados
 * Processa mensagens dos dispositivos e persiste no Supabase
 */

import dotenv from "dotenv";
dotenv.config();

import { database } from "./database";
import { logger, LogType } from "./logger";
import { BaseMessage, ConnectedClient } from "../types/protocol";
import {
  Device,
  Connection,
  Message,
  LocationReport,
  Alert,
  AlertType,
  AlertSeverity,
} from "../types/database";

export class DataManager {
  private activeConnections: Map<string, string> = new Map(); // clientId -> connectionId

  /**
   * Processa conexão de novo cliente
   */
  async handleClientConnection(
    clientId: string,
    clientIp: string,
    imei?: string
  ): Promise<void> {
    try {
      if (!imei) {
        logger.warn(LogType.APPLICATION, "Client connected without IMEI", {
          clientId,
          clientIp,
        });
        return;
      }

      // Buscar ou criar dispositivo
      const deviceResult = await database.getDeviceByImei(imei);
      let device: Device;

      if (!deviceResult.success || !deviceResult.data) {
        // Criar novo dispositivo
        const newDeviceResult = await database.upsertDevice({
          imei,
          device_name: `GL33CG_${imei.slice(-4)}`, // Usar últimos 4 dígitos como nome padrão
          protocol_version: "80200A0303",
        });

        if (!newDeviceResult.success || !newDeviceResult.data) {
          logger.error(
            LogType.APPLICATION,
            "Failed to create device",
            undefined,
            { imei }
          );
          return;
        }

        device = newDeviceResult.data;
        logger.info(LogType.APPLICATION, "New device created", {
          imei,
          deviceId: device.id,
        });
      } else {
        device = deviceResult.data;
        // Atualizar última vez visto
        await database.upsertDevice({
          imei,
          device_name: device.device_name,
          protocol_version: device.protocol_version,
        });
      }

      // Criar registro de conexão
      const connectionResult = await database.createConnection({
        device_id: device.id!,
        client_ip: clientIp,
        connected_at: new Date().toISOString(),
        message_count: 0,
      });

      if (connectionResult.success && connectionResult.data) {
        this.activeConnections.set(clientId, connectionResult.data.id!);
        logger.info(LogType.APPLICATION, "Connection created in database", {
          clientId,
          deviceId: device.id,
          connectionId: connectionResult.data.id,
        });
      }
    } catch (error) {
      logger.error(
        LogType.APPLICATION,
        "Error handling client connection",
        error as Error,
        { clientId, clientIp }
      );
    }
  }

  /**
   * Processa desconexão de cliente
   */
  async handleClientDisconnection(
    clientId: string,
    duration: number,
    messageCount: number
  ): Promise<void> {
    try {
      const connectionId = this.activeConnections.get(clientId);
      if (!connectionId) {
        logger.warn(
          LogType.APPLICATION,
          "No active connection found for client",
          { clientId }
        );
        return;
      }

      // Atualizar registro de conexão
      await database.updateConnection(connectionId, {
        disconnected_at: new Date().toISOString(),
        duration_seconds: duration,
        message_count: messageCount,
      });

      this.activeConnections.delete(clientId);
      logger.info(LogType.APPLICATION, "Connection closed in database", {
        clientId,
        connectionId,
        duration,
        messageCount,
      });
    } catch (error) {
      logger.error(
        LogType.APPLICATION,
        "Error handling client disconnection",
        error as Error,
        { clientId }
      );
    }
  }

  /**
   * Processa mensagem recebida
   */
  async handleMessage(
    clientId: string,
    message: BaseMessage,
    client: ConnectedClient
  ): Promise<void> {
    try {
      if (!client.imei) {
        logger.warn(
          LogType.APPLICATION,
          "Message received from unidentified device",
          { clientId }
        );
        return;
      }

      // Buscar dispositivo
      const deviceResult = await database.getDeviceByImei(client.imei);
      if (!deviceResult.success || !deviceResult.data) {
        logger.error(
          LogType.APPLICATION,
          "Device not found for message",
          undefined,
          { imei: client.imei }
        );
        return;
      }

      const device = deviceResult.data;
      const connectionId = this.activeConnections.get(clientId);

      // Salvar mensagem
      const messageResult = await database.saveMessage({
        device_id: device.id!,
        connection_id: connectionId,
        frame_type: message.frameType,
        command_word: message.commandWord,
        raw_message: message.rawMessage,
        send_time: message.sendTime,
        count_number: message.countNumber,
        processed: true,
        received_at: new Date().toISOString(),
      });

      if (!messageResult.success || !messageResult.data) {
        logger.error(LogType.APPLICATION, "Failed to save message", undefined, {
          clientId,
          command: message.commandWord,
        });
        return;
      }

      const savedMessage = messageResult.data;

      // Processar comando específico
      await this.processSpecificCommand(device, savedMessage, message);

      logger.debug(LogType.APPLICATION, "Message processed and saved", {
        deviceId: device.id,
        messageId: savedMessage.id,
        command: message.commandWord,
      });
    } catch (error) {
      logger.error(
        LogType.APPLICATION,
        "Error handling message",
        error as Error,
        {
          clientId,
          command: message.commandWord,
        }
      );
    }
  }

  /**
   * Processa comandos específicos
   */
  private async processSpecificCommand(
    device: Device,
    savedMessage: Message,
    originalMessage: BaseMessage
  ): Promise<void> {
    try {
      switch (originalMessage.commandWord) {
        case "GTFRI":
          await this.processLocationReport(
            device,
            savedMessage,
            originalMessage
          );
          break;

        case "GTPFA":
          await this.createAlert(
            device,
            savedMessage,
            AlertType.POWER_FAILURE,
            AlertSeverity.HIGH,
            "Power failure detected"
          );
          break;

        case "GTBPL":
          await this.createAlert(
            device,
            savedMessage,
            AlertType.BATTERY_LOW,
            AlertSeverity.MEDIUM,
            "Battery low"
          );
          break;

        case "GTTEM":
          await this.processTemperatureAlert(
            device,
            savedMessage,
            originalMessage
          );
          break;

        case "GTJDS":
          await this.createAlert(
            device,
            savedMessage,
            AlertType.JAMMING,
            AlertSeverity.HIGH,
            "GPS jamming detected"
          );
          break;

        case "GTGEO":
          await this.createAlert(
            device,
            savedMessage,
            AlertType.GEOFENCE,
            AlertSeverity.MEDIUM,
            "Geofence alert"
          );
          break;

        case "GTHBD":
          // Heartbeat - apenas log, já processado
          logger.debug(LogType.APPLICATION, "Heartbeat processed", {
            deviceId: device.id,
          });
          break;

        default:
          logger.debug(LogType.APPLICATION, "Unknown command processed", {
            command: originalMessage.commandWord,
            deviceId: device.id,
          });
      }
    } catch (error) {
      logger.error(
        LogType.APPLICATION,
        "Error processing specific command",
        error as Error,
        {
          command: originalMessage.commandWord,
          deviceId: device.id,
        }
      );
    }
  }

  /**
   * Processa relatório de localização
   */
  private async processLocationReport(
    device: Device,
    message: Message,
    originalMessage: BaseMessage
  ): Promise<void> {
    try {
      console.log("🐛 DEBUG: Iniciando processLocationReport", {
        deviceId: device.id,
        command: originalMessage.commandWord,
        rawMessage: originalMessage.rawMessage,
      });

      // Parse da mensagem para extrair dados de localização
      const locationData = this.parseLocationFromMessage(
        originalMessage.rawMessage
      );

      console.log("🐛 DEBUG: Dados de localização parseados:", locationData);

      if (!locationData) {
        logger.warn(LogType.APPLICATION, "Could not parse location data", {
          deviceId: device.id,
          rawMessage: originalMessage.rawMessage,
        });
        console.log("❌ DEBUG: Falha no parse dos dados de localização");
        return;
      }

      console.log("🐛 DEBUG: Tentando salvar no banco...");

      // Salvar relatório de localização
      const locationResult = await database.saveLocationReport({
        device_id: device.id!,
        message_id: message.id!,
        latitude: locationData.latitude,
        longitude: locationData.longitude,
        speed: locationData.speed,
        heading: locationData.heading,
        altitude: locationData.altitude,
        hdop: locationData.hdop,
        mcc: locationData.mcc, // ✅ ADICIONADO
        mnc: locationData.mnc, // ✅ ADICIONADO
        lac: locationData.lac, // ✅ ADICIONADO
        cell_id: locationData.cellId, // ✅ ADICIONADO
        battery_level: locationData.batteryLevel,
        gsm_signal: locationData.gsmSignal,
        report_time: this.parseTimestamp(originalMessage.sendTime),
      });

      console.log("🐛 DEBUG: Resultado do salvamento:", locationResult);

      if (locationResult.success) {
        logger.info(LogType.APPLICATION, "Location report saved", {
          deviceId: device.id,
          latitude: locationData.latitude,
          longitude: locationData.longitude,
          speed: locationData.speed,
          mcc: locationData.mcc,
          mnc: locationData.mnc,
          lac: locationData.lac,
          cellId: locationData.cellId,
        });

        console.log("✅ DEBUG: Location report salvo com sucesso!");

        // Verificar alertas baseados na localização
        await this.checkLocationBasedAlerts(device, message, locationData);
      } else {
        console.log(
          "❌ DEBUG: Falha ao salvar location report:",
          locationResult.error
        );
      }
    } catch (error) {
      console.log("❌ DEBUG: Erro na processLocationReport:", error);
      logger.error(
        LogType.APPLICATION,
        "Error processing location report",
        error as Error,
        {
          deviceId: device.id,
        }
      );
    }
  }

  /**
   * Parse de dados de localização da mensagem GTFRI
   */
  private parseLocationFromMessage(rawMessage: string): any | null {
    try {
      console.log("🐛 DEBUG: Parseando mensagem:", rawMessage);

      const parts = rawMessage
        .replace("+RESP:", "")
        .replace("$", "")
        .split(",");

      console.log("🐛 DEBUG: Partes da mensagem:", parts.length, parts);

      if (parts.length < 18) {
        console.log("❌ DEBUG: Mensagem muito curta, partes:", parts.length);
        return null;
      }

      const speed = parseFloat(parts[8] ?? "0");
      const heading = parseInt(parts[9] ?? "0");
      const altitude = parseFloat(parts[10] ?? "0");
      const longitude = parseFloat(parts[11] ?? "0");
      const latitude = parseFloat(parts[12] ?? "0");
      const hdop = parseFloat(parts[7] ?? "0");

      // ✅ CAMPOS CORRIGIDOS - POSIÇÕES CERTAS
      const mcc = parts[14] ?? ""; // MCC na posição 14
      const mnc = parts[15] ?? ""; // MNC na posição 15
      const lac = parts[16] ?? ""; // LAC na posição 16
      const cellId = parts[17] ?? ""; // Cell ID na posição 17
      const batteryLevel = parts[19] ? parseFloat(parts[19]) : undefined; // Battery na posição 19

      const result = {
        latitude,
        longitude,
        speed,
        heading,
        altitude,
        hdop,
        batteryLevel,
        gsmSignal: undefined,
        mcc, // ✅ NOVO
        mnc, // ✅ NOVO
        lac, // ✅ NOVO
        cellId, // ✅ NOVO
      };

      console.log("🐛 DEBUG: Resultado do parse:", result);
      return result;
    } catch (error) {
      console.log("❌ DEBUG: Erro no parse:", error);
      logger.error(
        LogType.APPLICATION,
        "Error parsing location data",
        error as Error
      );
      return null;
    }
  }

  /**
   * Processa alerta de temperatura
   */
  private async processTemperatureAlert(
    device: Device,
    message: Message,
    originalMessage: BaseMessage
  ): Promise<void> {
    // Parse da temperatura da mensagem (implementar conforme protocolo específico)
    const severity = AlertSeverity.MEDIUM; // Determinar baseado na temperatura
    await this.createAlert(
      device,
      message,
      AlertType.TEMPERATURE,
      severity,
      "Temperature alert"
    );
  }

  /**
   * Verifica alertas baseados na localização
   */
  private async checkLocationBasedAlerts(
    device: Device,
    message: Message,
    locationData: any
  ): Promise<void> {
    try {
      // Verificar limite de velocidade (exemplo: > 120 km/h)
      if (locationData.speed > 120) {
        await this.createAlert(
          device,
          message,
          AlertType.SPEED_LIMIT,
          AlertSeverity.HIGH,
          `Speed limit exceeded: ${locationData.speed} km/h`
        );
      }

      // Aqui você pode adicionar outras verificações:
      // - Geocercas
      // - Zonas proibidas
      // - Rotas não autorizadas
      // etc.
    } catch (error) {
      logger.error(
        LogType.APPLICATION,
        "Error checking location-based alerts",
        error as Error
      );
    }
  }

  /**
   * Cria alerta
   */
  private async createAlert(
    device: Device,
    message: Message,
    alertType: AlertType,
    severity: AlertSeverity,
    description: string,
    additionalData?: any
  ): Promise<void> {
    try {
      const alertResult = await database.createAlert({
        device_id: device.id!,
        message_id: message.id!,
        alert_type: alertType,
        severity,
        description,
        additional_data: additionalData,
        resolved: false,
      });

      if (alertResult.success) {
        logger.warn(LogType.APPLICATION, `Alert created: ${alertType}`, {
          deviceId: device.id,
          alertId: alertResult.data?.id,
          severity,
          description,
        });
      }
    } catch (error) {
      logger.error(
        LogType.APPLICATION,
        "Error creating alert",
        error as Error,
        {
          deviceId: device.id,
          alertType,
        }
      );
    }
  }

  /**
   * Converte timestamp de YYYYMMDDHHMMSS para ISO
   */
  private parseTimestamp(timestamp: string): string {
    try {
      if (timestamp.length !== 14) {
        return new Date().toISOString();
      }

      const year = parseInt(timestamp.substring(0, 4));
      const month = parseInt(timestamp.substring(4, 6)) - 1; // JS months are 0-based
      const day = parseInt(timestamp.substring(6, 8));
      const hour = parseInt(timestamp.substring(8, 10));
      const minute = parseInt(timestamp.substring(10, 12));
      const second = parseInt(timestamp.substring(12, 14));

      return new Date(year, month, day, hour, minute, second).toISOString();
    } catch {
      return new Date().toISOString();
    }
  }

  /**
   * Obtém estatísticas
   */
  async getStats(): Promise<any> {
    try {
      const stats = await database.getDashboardStats();
      return stats.data || {};
    } catch (error) {
      logger.error(
        LogType.APPLICATION,
        "Error getting database stats",
        error as Error
      );
      return {};
    }
  }

  /**
   * Testa conexão com banco
   */
  async testDatabaseConnection(): Promise<boolean> {
    try {
      const result = await database.testConnection();
      logger.info(
        LogType.APPLICATION,
        `Database connection test: ${result ? "SUCCESS" : "FAILED"}`
      );
      return result;
    } catch (error) {
      logger.error(
        LogType.APPLICATION,
        "Database connection test failed",
        error as Error
      );
      return false;
    }
  }
}

// Exportar instância singleton
export const dataManager = new DataManager();
