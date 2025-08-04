/**
 * Serviço de banco de dados com Supabase
 * Gerencia persistência de dados dos dispositivos GL33CG
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { logger, LogType } from "./logger";
import {
  Device,
  Connection,
  Message,
  LocationReport,
  Alert,
  DeviceStats,
  AlertType,
  AlertSeverity,
  DatabaseResponse,
  DatabaseConfig,
  DeviceFilter,
  MessageFilter,
  LocationFilter,
  AlertFilter,
  PaginationOptions,
  DashboardStats,
  DeviceActivity,
} from "../types/database";
import { BaseMessage } from "../types/protocol";

class DatabaseService {
  private static instance: DatabaseService;
  private supabase: SupabaseClient;
  private config: DatabaseConfig;

  private constructor() {
    this.config = this.loadConfig();
    this.supabase = createClient(this.config.url, this.config.anonKey);
    this.initializeDatabase();
  }

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  /**
   * Carrega configuração do banco
   */
  private loadConfig(): DatabaseConfig {
    const url = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;

    if (!url || !anonKey) {
      throw new Error(
        "SUPABASE_URL e SUPABASE_ANON_KEY são obrigatórios no .env"
      );
    }

    return {
      url,
      anonKey,
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      enableRealtime: process.env.ENABLE_REALTIME === "true",
      enableLogging: process.env.ENABLE_DB_LOGGING !== "false",
    };
  }

  /**
   * Inicializa conexão com banco
   */
  private async initializeDatabase(): Promise<void> {
    try {
      // Testar conexão
      const { data, error } = await this.supabase
        .from("devices")
        .select("count", { count: "exact", head: true });

      if (error) {
        logger.error(LogType.APPLICATION, "Database connection failed", error);
        throw error;
      }

      logger.info(LogType.APPLICATION, "Database connected successfully", {
        url: this.config.url.split("@")[1], // Log sem credenciais
      });
    } catch (error) {
      logger.error(
        LogType.APPLICATION,
        "Failed to initialize database",
        error as Error
      );
      throw error;
    }
  }

  // OPERAÇÕES COM DISPOSITIVOS

  /**
   * Cria ou atualiza dispositivo
   */
  async upsertDevice(
    deviceData: Partial<Device>
  ): Promise<DatabaseResponse<Device>> {
    try {
      const { data, error } = await this.supabase
        .from("devices")
        .upsert(
          {
            imei: deviceData.imei,
            device_name: deviceData.device_name,
            protocol_version: deviceData.protocol_version,
            last_seen: new Date().toISOString(),
            is_active: true,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "imei",
            ignoreDuplicates: false,
          }
        )
        .select()
        .single();

      if (error) {
        logger.error(LogType.APPLICATION, "Error upserting device", error);
        return { success: false, error: error.message };
      }

      logger.info(LogType.APPLICATION, "Device upserted successfully", {
        imei: deviceData.imei,
      });
      return { success: true, data };
    } catch (error) {
      logger.error(
        LogType.APPLICATION,
        "Database error in upsertDevice",
        error as Error
      );
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Busca dispositivo por IMEI
   */
  async getDeviceByImei(imei: string): Promise<DatabaseResponse<Device>> {
    try {
      const { data, error } = await this.supabase
        .from("devices")
        .select("*")
        .eq("imei", imei)
        .single();

      if (error && error.code !== "PGRST116") {
        // PGRST116 = não encontrado
        logger.error(LogType.APPLICATION, "Error fetching device", error);
        return { success: false, error: error.message };
      }

      return { success: true, data: data || undefined };
    } catch (error) {
      logger.error(
        LogType.APPLICATION,
        "Database error in getDeviceByImei",
        error as Error
      );
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Lista dispositivos com filtros
   */
  async getDevices(
    filter?: DeviceFilter,
    pagination?: PaginationOptions
  ): Promise<DatabaseResponse<Device[]>> {
    try {
      let query = this.supabase.from("devices").select("*");

      // Aplicar filtros
      if (filter?.imei) query = query.eq("imei", filter.imei);
      if (filter?.device_name)
        query = query.ilike("device_name", `%${filter.device_name}%`);
      if (filter?.is_active !== undefined)
        query = query.eq("is_active", filter.is_active);
      if (filter?.last_seen_after)
        query = query.gte("last_seen", filter.last_seen_after);
      if (filter?.last_seen_before)
        query = query.lte("last_seen", filter.last_seen_before);

      // Aplicar paginação e ordenação
      if (pagination?.orderBy) {
        query = query.order(pagination.orderBy, {
          ascending: pagination.orderDirection === "asc",
        });
      }

      if (pagination?.page && pagination?.limit) {
        const from = (pagination.page - 1) * pagination.limit;
        const to = from + pagination.limit - 1;
        query = query.range(from, to);
      }

      const { data, error, count } = await query;

      if (error) {
        logger.error(LogType.APPLICATION, "Error fetching devices", error);
        return { success: false, error: error.message };
      }

      return { success: true, data: data || [], count: count || 0 };
    } catch (error) {
      logger.error(
        LogType.APPLICATION,
        "Database error in getDevices",
        error as Error
      );
      return { success: false, error: (error as Error).message };
    }
  }

  // OPERAÇÕES COM CONEXÕES

  /**
   * Cria nova conexão
   */
  async createConnection(
    connectionData: Omit<Connection, "id" | "created_at">
  ): Promise<DatabaseResponse<Connection>> {
    try {
      const { data, error } = await this.supabase
        .from("connections")
        .insert({
          ...connectionData,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        logger.error(LogType.APPLICATION, "Error creating connection", error);
        return { success: false, error: error.message };
      }

      return { success: true, data };
    } catch (error) {
      logger.error(
        LogType.APPLICATION,
        "Database error in createConnection",
        error as Error
      );
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Atualiza conexão (desconexão)
   */
  async updateConnection(
    connectionId: string,
    updates: Partial<Connection>
  ): Promise<DatabaseResponse<Connection>> {
    try {
      const { data, error } = await this.supabase
        .from("connections")
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq("id", connectionId)
        .select()
        .single();

      if (error) {
        logger.error(LogType.APPLICATION, "Error updating connection", error);
        return { success: false, error: error.message };
      }

      return { success: true, data };
    } catch (error) {
      logger.error(
        LogType.APPLICATION,
        "Database error in updateConnection",
        error as Error
      );
      return { success: false, error: (error as Error).message };
    }
  }

  // OPERAÇÕES COM MENSAGENS

  /**
   * Salva mensagem recebida
   */
  async saveMessage(
    messageData: Omit<Message, "id" | "created_at">
  ): Promise<DatabaseResponse<Message>> {
    try {
      const { data, error } = await this.supabase
        .from("messages")
        .insert({
          ...messageData,
          received_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        logger.error(LogType.APPLICATION, "Error saving message", error);
        return { success: false, error: error.message };
      }

      // Incrementar contador de mensagens do dispositivo
      await this.incrementDeviceMessageCount(messageData.device_id);

      return { success: true, data };
    } catch (error) {
      logger.error(
        LogType.APPLICATION,
        "Database error in saveMessage",
        error as Error
      );
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Incrementa contador de mensagens do dispositivo
   */
  private async incrementDeviceMessageCount(deviceId: string): Promise<void> {
    try {
      const { error } = await this.supabase.rpc(
        "increment_device_message_count",
        {
          device_id: deviceId,
        }
      );

      if (error) {
        logger.error(
          LogType.APPLICATION,
          "Error incrementing message count",
          error
        );
      }
    } catch (error) {
      logger.error(
        LogType.APPLICATION,
        "Database error in incrementDeviceMessageCount",
        error as Error
      );
    }
  }

  /**
   * Busca mensagens com filtros
   */
  async getMessages(
    filter?: MessageFilter,
    pagination?: PaginationOptions
  ): Promise<DatabaseResponse<Message[]>> {
    try {
      let query = this.supabase.from("messages").select(`
        *,
        devices (imei, device_name)
      `);

      // Aplicar filtros
      if (filter?.device_id) query = query.eq("device_id", filter.device_id);
      if (filter?.frame_type) query = query.eq("frame_type", filter.frame_type);
      if (filter?.command_word)
        query = query.eq("command_word", filter.command_word);
      if (filter?.processed !== undefined)
        query = query.eq("processed", filter.processed);
      if (filter?.date_from) query = query.gte("received_at", filter.date_from);
      if (filter?.date_to) query = query.lte("received_at", filter.date_to);

      // Ordenação padrão por data
      query = query.order("received_at", { ascending: false });

      // Paginação
      if (pagination?.page && pagination?.limit) {
        const from = (pagination.page - 1) * pagination.limit;
        const to = from + pagination.limit - 1;
        query = query.range(from, to);
      }

      const { data, error, count } = await query;

      if (error) {
        logger.error(LogType.APPLICATION, "Error fetching messages", error);
        return { success: false, error: error.message };
      }

      return { success: true, data: data || [], count: count || 0 };
    } catch (error) {
      logger.error(
        LogType.APPLICATION,
        "Database error in getMessages",
        error as Error
      );
      return { success: false, error: (error as Error).message };
    }
  }

  // OPERAÇÕES COM RELATÓRIOS DE LOCALIZAÇÃO

  /**
   * Salva relatório de localização
   */
  async saveLocationReport(
    locationData: Omit<LocationReport, "id" | "created_at">
  ): Promise<DatabaseResponse<LocationReport>> {
    try {
      const { data, error } = await this.supabase
        .from("location_reports")
        .insert({
          ...locationData,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        logger.error(
          LogType.APPLICATION,
          "Error saving location report",
          error
        );
        return { success: false, error: error.message };
      }

      return { success: true, data };
    } catch (error) {
      logger.error(
        LogType.APPLICATION,
        "Database error in saveLocationReport",
        error as Error
      );
      return { success: false, error: (error as Error).message };
    }
  }

  // OPERAÇÕES COM ALERTAS

  /**
   * Cria alerta
   */
  async createAlert(
    alertData: Omit<Alert, "id" | "created_at">
  ): Promise<DatabaseResponse<Alert>> {
    try {
      const { data, error } = await this.supabase
        .from("alerts")
        .insert({
          ...alertData,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        logger.error(LogType.APPLICATION, "Error creating alert", error);
        return { success: false, error: error.message };
      }

      return { success: true, data };
    } catch (error) {
      logger.error(
        LogType.APPLICATION,
        "Database error in createAlert",
        error as Error
      );
      return { success: false, error: (error as Error).message };
    }
  }

  // ESTATÍSTICAS E DASHBOARD

  /**
   * Obtém estatísticas do dashboard
   */
  async getDashboardStats(): Promise<DatabaseResponse<DashboardStats>> {
    try {
      // Executar múltiplas queries em paralelo
      const [devicesResult, messagesResult, alertsResult] = await Promise.all([
        this.supabase.from("devices").select("is_active", { count: "exact" }),
        this.supabase
          .from("messages")
          .select("command_word")
          .gte("received_at", new Date().toISOString().split("T")[0]),
        this.supabase.from("alerts").select("severity, resolved"),
      ]);

      // Processar resultados
      const stats: DashboardStats = {
        total_devices: devicesResult.count || 0,
        active_devices: 0,
        total_messages_today: messagesResult.count || 0,
        active_alerts: 0,
        devices_by_status: {
          online: 0,
          offline: 0,
          inactive: 0,
        },
        messages_by_type: {},
        alerts_by_severity: {
          low: 0,
          medium: 0,
          high: 0,
          critical: 0,
        },
      };

      // Contar dispositivos ativos
      if (devicesResult.data) {
        stats.active_devices = devicesResult.data.filter(
          (d) => d.is_active
        ).length;
      }

      // Contar alertas ativos
      if (alertsResult.data) {
        stats.active_alerts = alertsResult.data.filter(
          (a) => !a.resolved
        ).length;

        // Agrupar por severidade
        alertsResult.data.forEach((alert) => {
          stats.alerts_by_severity[alert.severity as AlertSeverity]++;
        });
      }

      // Agrupar mensagens por tipo
      if (messagesResult.data) {
        messagesResult.data.forEach((msg) => {
          stats.messages_by_type[msg.command_word] =
            (stats.messages_by_type[msg.command_word] || 0) + 1;
        });
      }

      return { success: true, data: stats };
    } catch (error) {
      logger.error(
        LogType.APPLICATION,
        "Database error in getDashboardStats",
        error as Error
      );
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Testa conexão com o banco
   */
  async testConnection(): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from("devices")
        .select("count", { count: "exact", head: true });

      return !error;
    } catch {
      return false;
    }
  }
}

// Exportar instância singleton
export const database = DatabaseService.getInstance();
export { DatabaseService };
