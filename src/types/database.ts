/**
 * Tipos para integração com banco de dados Supabase
 * Estruturas para armazenar dados dos dispositivos GL33CG
 */

export interface Device {
  id?: string;
  imei: string;
  device_name: string;
  protocol_version: string;
  first_seen: string;
  last_seen: string;
  is_active: boolean;
  total_messages: number;
  created_at?: string;
  updated_at?: string;
}

export interface Connection {
  id?: string;
  device_id: string;
  client_ip: string;
  connected_at: string;
  disconnected_at?: string;
  duration_seconds?: number;
  message_count: number;
  created_at?: string;
}

export interface Message {
  id?: string;
  device_id: string;
  connection_id?: string;
  frame_type: string;
  command_word: string;
  raw_message: string;
  send_time: string;
  count_number: string;
  received_at: string;
  processed: boolean;
  created_at?: string;
}

export interface LocationReport {
  id?: string;
  device_id: string;
  message_id: string;
  latitude: number;
  longitude: number;
  speed: number;
  heading: number;
  altitude?: number;
  hdop?: number;
  mcc?: string;
  mnc?: string;
  lac?: string;
  cell_id?: string;
  battery_level?: number;
  gsm_signal?: number;
  report_time: string;
  created_at?: string;
}

export interface Alert {
  id?: string;
  device_id: string;
  message_id: string;
  alert_type: AlertType;
  severity: AlertSeverity;
  description: string;
  additional_data?: any;
  resolved: boolean;
  resolved_at?: string;
  created_at?: string;
}

export enum AlertType {
  POWER_FAILURE = "power_failure",
  BATTERY_LOW = "battery_low",
  TEMPERATURE = "temperature",
  JAMMING = "jamming",
  GEOFENCE = "geofence",
  SPEED_LIMIT = "speed_limit",
  CONNECTION_LOST = "connection_lost",
}

export enum AlertSeverity {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  CRITICAL = "critical",
}

export interface DeviceStats {
  id?: string;
  device_id: string;
  date: string;
  total_messages: number;
  heartbeats: number;
  location_reports: number;
  alerts: number;
  connection_time_minutes: number;
  avg_battery_level?: number;
  avg_signal_strength?: number;
  created_at?: string;
}

// Tipos para queries e filtros
export interface DeviceFilter {
  imei?: string;
  device_name?: string;
  is_active?: boolean;
  last_seen_after?: string;
  last_seen_before?: string;
}

export interface MessageFilter {
  device_id?: string;
  frame_type?: string;
  command_word?: string;
  date_from?: string;
  date_to?: string;
  processed?: boolean;
}

export interface LocationFilter {
  device_id?: string;
  date_from?: string;
  date_to?: string;
  bounds?: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
}

export interface AlertFilter {
  device_id?: string;
  alert_type?: AlertType;
  severity?: AlertSeverity;
  resolved?: boolean;
  date_from?: string;
  date_to?: string;
}

// Tipos para respostas da API
export interface DatabaseResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  count?: number;
}

export interface PaginationOptions {
  page?: number;
  limit?: number;
  orderBy?: string;
  orderDirection?: "asc" | "desc";
}

// Tipos para estatísticas e dashboards
export interface DashboardStats {
  total_devices: number;
  active_devices: number;
  total_messages_today: number;
  active_alerts: number;
  devices_by_status: {
    online: number;
    offline: number;
    inactive: number;
  };
  messages_by_type: {
    [key: string]: number;
  };
  alerts_by_severity: {
    [key in AlertSeverity]: number;
  };
}

export interface DeviceActivity {
  device_id: string;
  imei: string;
  device_name: string;
  last_message: string;
  last_location?: {
    latitude: number;
    longitude: number;
    timestamp: string;
  };
  status: "online" | "offline" | "inactive";
  battery_level?: number;
  signal_strength?: number;
}

// Configuração do banco
export interface DatabaseConfig {
  url: string;
  anonKey: string;
  serviceRoleKey?: string;
  enableRealtime: boolean;
  enableLogging: boolean;
}
