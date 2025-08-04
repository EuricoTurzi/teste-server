-- Schema para o banco de dados GL33CG
-- Execute este script no SQL Editor do Supabase

-- =============================================
-- TABELA DE DISPOSITIVOS
-- =============================================
CREATE TABLE devices (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    imei VARCHAR(15) UNIQUE NOT NULL,
    device_name VARCHAR(50) NOT NULL,
    protocol_version VARCHAR(20) NOT NULL,
    first_seen TIMESTAMPTZ DEFAULT NOW(),
    last_seen TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT true,
    total_messages INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX idx_devices_imei ON devices(imei);
CREATE INDEX idx_devices_active ON devices(is_active);
CREATE INDEX idx_devices_last_seen ON devices(last_seen);

-- =============================================
-- TABELA DE CONEXÕES
-- =============================================
CREATE TABLE connections (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
    client_ip INET NOT NULL,
    connected_at TIMESTAMPTZ NOT NULL,
    disconnected_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    message_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_connections_device ON connections(device_id);
CREATE INDEX idx_connections_connected_at ON connections(connected_at);

-- =============================================
-- TABELA DE MENSAGENS
-- =============================================
CREATE TABLE messages (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
    connection_id UUID REFERENCES connections(id) ON DELETE SET NULL,
    frame_type VARCHAR(10) NOT NULL,
    command_word VARCHAR(10) NOT NULL,
    raw_message TEXT NOT NULL,
    send_time VARCHAR(14) NOT NULL, -- YYYYMMDDHHMMSS
    count_number VARCHAR(4) NOT NULL,
    received_at TIMESTAMPTZ NOT NULL,
    processed BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_messages_device ON messages(device_id);
CREATE INDEX idx_messages_received_at ON messages(received_at);
CREATE INDEX idx_messages_command ON messages(command_word);
CREATE INDEX idx_messages_frame_type ON messages(frame_type);

-- =============================================
-- TABELA DE RELATÓRIOS DE LOCALIZAÇÃO
-- =============================================
CREATE TABLE location_reports (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
    message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    latitude DECIMAL(10, 8) NOT NULL,
    longitude DECIMAL(11, 8) NOT NULL,
    speed DECIMAL(6, 2) DEFAULT 0,
    heading INTEGER DEFAULT 0, -- 0-359 graus
    altitude DECIMAL(8, 2),
    hdop DECIMAL(4, 2),
    mcc VARCHAR(3), -- Mobile Country Code
    mnc VARCHAR(3), -- Mobile Network Code
    lac VARCHAR(4), -- Location Area Code
    cell_id VARCHAR(8), -- Cell ID
    battery_level DECIMAL(5, 2),
    gsm_signal INTEGER,
    report_time TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices espaciais e de performance
CREATE INDEX idx_location_device ON location_reports(device_id);
CREATE INDEX idx_location_time ON location_reports(report_time);
CREATE INDEX idx_location_coords ON location_reports(latitude, longitude);

-- =============================================
-- TABELA DE ALERTAS
-- =============================================
CREATE TYPE alert_type AS ENUM (
    'power_failure',
    'battery_low', 
    'temperature',
    'jamming',
    'geofence',
    'speed_limit',
    'connection_lost'
);

CREATE TYPE alert_severity AS ENUM ('low', 'medium', 'high', 'critical');

CREATE TABLE alerts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
    message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    alert_type alert_type NOT NULL,
    severity alert_severity NOT NULL,
    description TEXT NOT NULL,
    additional_data JSONB,
    resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX idx_alerts_device ON alerts(device_id);
CREATE INDEX idx_alerts_type ON alerts(alert_type);
CREATE INDEX idx_alerts_severity ON alerts(severity);
CREATE INDEX idx_alerts_resolved ON alerts(resolved);
CREATE INDEX idx_alerts_created_at ON alerts(created_at);

-- =============================================
-- TABELA DE ESTATÍSTICAS DIÁRIAS
-- =============================================
CREATE TABLE device_stats (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    total_messages INTEGER DEFAULT 0,
    heartbeats INTEGER DEFAULT 0,
    location_reports INTEGER DEFAULT 0,
    alerts INTEGER DEFAULT 0,
    connection_time_minutes INTEGER DEFAULT 0,
    avg_battery_level DECIMAL(5, 2),
    avg_signal_strength INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(device_id, date)
);

-- Índices
CREATE INDEX idx_device_stats_device ON device_stats(device_id);
CREATE INDEX idx_device_stats_date ON device_stats(date);

-- =============================================
-- FUNÇÕES E TRIGGERS
-- =============================================

-- Função para incrementar contador de mensagens
CREATE OR REPLACE FUNCTION increment_device_message_count(device_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE devices 
    SET total_messages = total_messages + 1,
        last_seen = NOW(),
        updated_at = NOW()
    WHERE id = device_id;
END;
$$ LANGUAGE plpgsql;

-- Função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Função para calcular duração da conexão
CREATE OR REPLACE FUNCTION calculate_connection_duration()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.disconnected_at IS NOT NULL AND OLD.disconnected_at IS NULL THEN
        NEW.duration_seconds = EXTRACT(EPOCH FROM (NEW.disconnected_at - NEW.connected_at));
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar triggers nas tabelas necessárias
CREATE TRIGGER update_devices_updated_at 
    BEFORE UPDATE ON devices 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER calculate_connection_duration_trigger
    BEFORE UPDATE ON connections
    FOR EACH ROW
    EXECUTE FUNCTION calculate_connection_duration();

-- =============================================
-- VIEWS ÚTEIS
-- =============================================

-- View de dispositivos com última localização
CREATE OR REPLACE VIEW devices_with_last_location AS
SELECT 
    d.*,
    lr.latitude as last_latitude,
    lr.longitude as last_longitude,
    lr.speed as last_speed,
    lr.battery_level as last_battery_level,
    lr.gsm_signal as last_signal_strength,
    lr.report_time as last_location_time
FROM devices d
LEFT JOIN LATERAL (
    SELECT latitude, longitude, speed, battery_level, gsm_signal, report_time
    FROM location_reports lr2
    WHERE lr2.device_id = d.id 
    AND lr2.report_time = (
        SELECT MAX(report_time) 
        FROM location_reports 
        WHERE device_id = d.id
    )
) lr ON true;

-- View de estatísticas por dispositivo
CREATE VIEW device_summary_stats AS
SELECT 
    d.id,
    d.imei,
    d.device_name,
    d.is_active,
    d.last_seen,
    COUNT(DISTINCT c.id) as total_connections,
    COUNT(m.id) as total_messages,
    COUNT(lr.id) as total_locations,
    COUNT(CASE WHEN a.resolved = false THEN a.id END) as active_alerts,
    MAX(lr.report_time) as last_location_time
FROM devices d
LEFT JOIN connections c ON c.device_id = d.id
LEFT JOIN messages m ON m.device_id = d.id
LEFT JOIN location_reports lr ON lr.device_id = d.id
LEFT JOIN alerts a ON a.device_id = d.id
GROUP BY d.id, d.imei, d.device_name, d.is_active, d.last_seen;

-- View de alertas ativos com informações do dispositivo
CREATE VIEW active_alerts_with_device AS
SELECT 
    a.*,
    d.imei,
    d.device_name,
    m.raw_message,
    m.received_at as message_received_at
FROM alerts a
JOIN devices d ON d.id = a.device_id
LEFT JOIN messages m ON m.id = a.message_id
WHERE a.resolved = false
ORDER BY a.created_at DESC;

-- =============================================
-- POLÍTICAS RLS (Row Level Security)
-- =============================================

-- Habilitar RLS nas tabelas principais
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_stats ENABLE ROW LEVEL SECURITY;

-- Políticas para acesso público (ajustar conforme necessário)
CREATE POLICY "Enable read access for all users" ON devices FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON devices FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON devices FOR UPDATE USING (true);

CREATE POLICY "Enable read access for all users" ON connections FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON connections FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON connections FOR UPDATE USING (true);

CREATE POLICY "Enable read access for all users" ON messages FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON messages FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON messages FOR UPDATE USING (true);

CREATE POLICY "Enable read access for all users" ON location_reports FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON location_reports FOR INSERT WITH CHECK (true);

CREATE POLICY "Enable read access for all users" ON alerts FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON alerts FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON alerts FOR UPDATE USING (true);

CREATE POLICY "Enable read access for all users" ON device_stats FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON device_stats FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON device_stats FOR UPDATE USING (true);

-- =============================================
-- DADOS INICIAIS DE EXEMPLO (OPCIONAL)
-- =============================================

-- Inserir dispositivo de exemplo para testes
INSERT INTO devices (imei, device_name, protocol_version) 
VALUES ('865585040014007', 'GL33CG_TEST', '80200A0303')
ON CONFLICT (imei) DO NOTHING;

-- =============================================
-- ÍNDICES ADICIONAIS PARA PERFORMANCE
-- =============================================

-- Índices compostos para queries frequentes
CREATE INDEX idx_messages_device_time ON messages(device_id, received_at DESC);
CREATE INDEX idx_location_device_time ON location_reports(device_id, report_time DESC);
CREATE INDEX idx_alerts_device_unresolved ON alerts(device_id, resolved) WHERE resolved = false;

-- Adicionar colunas manuais (sem expressão)
ALTER TABLE messages ADD COLUMN received_day DATE;
ALTER TABLE connections ADD COLUMN connected_day DATE;

-- Funções para preenchimento automático
CREATE OR REPLACE FUNCTION set_received_day()
RETURNS TRIGGER AS $$
BEGIN
    NEW.received_day := NEW.received_at::DATE;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION set_connected_day()
RETURNS TRIGGER AS $$
BEGIN
    NEW.connected_day := NEW.connected_at::DATE;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para aplicar as funções
CREATE TRIGGER trg_set_received_day
BEFORE INSERT OR UPDATE ON messages
FOR EACH ROW EXECUTE FUNCTION set_received_day();

CREATE TRIGGER trg_set_connected_day
BEFORE INSERT OR UPDATE ON connections
FOR EACH ROW EXECUTE FUNCTION set_connected_day();

-- Índices agora válidos
CREATE INDEX idx_messages_daily_stats ON messages(device_id, command_word, received_day);
CREATE INDEX idx_connections_daily ON connections(device_id, connected_day);

-- =============================================
-- COMENTÁRIOS NAS TABELAS
-- =============================================

COMMENT ON TABLE devices IS 'Dispositivos GL33CG registrados no sistema';
COMMENT ON TABLE connections IS 'Histórico de conexões TCP dos dispositivos';
COMMENT ON TABLE messages IS 'Todas as mensagens recebidas dos dispositivos';
COMMENT ON TABLE location_reports IS 'Relatórios de localização GPS dos dispositivos';
COMMENT ON TABLE alerts IS 'Alertas gerados pelos dispositivos';
COMMENT ON TABLE device_stats IS 'Estatísticas diárias agregadas por dispositivo';

-- Comentários em colunas importantes
COMMENT ON COLUMN devices.imei IS 'IMEI único do dispositivo (15 dígitos)';
COMMENT ON COLUMN messages.raw_message IS 'Mensagem original recebida do dispositivo';
COMMENT ON COLUMN messages.send_time IS 'Timestamp da mensagem no formato YYYYMMDDHHMMSS';
COMMENT ON COLUMN location_reports.hdop IS 'Horizontal Dilution of Precision - precisão GPS';

-- =============================================
-- FUNÇÃO PARA LIMPEZA DE DADOS ANTIGOS
-- =============================================

CREATE OR REPLACE FUNCTION cleanup_old_data(days_to_keep INTEGER DEFAULT 90)
RETURNS TABLE(
    deleted_messages INTEGER,
    deleted_locations INTEGER,
    deleted_connections INTEGER
) AS $$
DECLARE
    del_messages INTEGER;
    del_locations INTEGER;
    del_connections INTEGER;
    cutoff_date TIMESTAMPTZ;
BEGIN
    cutoff_date := NOW() - INTERVAL '1 day' * days_to_keep;
    
    -- Deletar mensagens antigas (exceto alertas)
    DELETE FROM messages 
    WHERE received_at < cutoff_date 
    AND command_word NOT IN ('GTPFA', 'GTBPL', 'GTTEM', 'GTJDS', 'GTGEO');
    GET DIAGNOSTICS del_messages = ROW_COUNT;
    
    -- Deletar relatórios de localização antigos
    DELETE FROM location_reports 
    WHERE report_time < cutoff_date;
    GET DIAGNOSTICS del_locations = ROW_COUNT;
    
    -- Deletar conexões antigas
    DELETE FROM connections 
    WHERE connected_at < cutoff_date;
    GET DIAGNOSTICS del_connections = ROW_COUNT;
    
    deleted_messages := del_messages;
    deleted_locations := del_locations;
    deleted_connections := del_connections;
    
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- FINALIZAÇÃO
-- =============================================

-- Atualizar estatísticas do banco
ANALYZE;

-- Mensagem de sucesso
DO $$
BEGIN
    RAISE NOTICE 'Schema GL33CG criado com sucesso!';
    RAISE NOTICE 'Tabelas: devices, connections, messages, location_reports, alerts, device_stats';
    RAISE NOTICE 'Views: devices_with_last_location, device_summary_stats, active_alerts_with_device';
    RAISE NOTICE 'Funções: increment_device_message_count, cleanup_old_data';
END $$;