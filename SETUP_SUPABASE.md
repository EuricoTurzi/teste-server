# 🗄️ CONFIGURAÇÃO DO SUPABASE

## 📋 Pré-requisitos

1. **Conta no Supabase** - [Criar conta gratuita](https://supabase.com)
2. **Projeto criado** no Supabase

## 🚀 Passo a passo

### 1. Criar projeto no Supabase

1. Acesse [supabase.com](https://supabase.com)
2. Clique em **"Start your project"**
3. Faça login ou crie uma conta
4. Clique em **"New project"**
5. Preencha:
   - **Name**: `gl33cg-tracker`
   - **Database Password**: Crie uma senha segura
   - **Region**: Escolha o mais próximo (ex: South America)
6. Clique em **"Create new project"**

### 2. Executar o Schema SQL

1. No dashboard do projeto, vá em **SQL Editor**
2. Clique em **"New query"**
3. Cole o conteúdo completo do arquivo `database/schema.sql`
4. Clique em **"Run"**
5. Aguarde a execução (pode demorar alguns segundos)

Você deve ver: `✅ Schema GL33CG criado com sucesso!`

### 3. Obter credenciais do projeto

### 3. Obter credenciais do projeto

1. Vá em **Settings** → **API**
2. Copie as seguintes informações:
   - **Project URL** (algo como: `https://abcdefgh.supabase.co`)
   - **anon public** (chave pública)
   - **service_role** (chave de serviço - opcional)

### 4. Configurar variáveis de ambiente

1. Abra o arquivo `.env` no seu projeto
2. Atualize as seguintes variáveis:

```bash
# Substitua pelos seus valores
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_ANON_KEY=sua-chave-anon-aqui
SUPABASE_SERVICE_ROLE_KEY=sua-chave-service-role-aqui
```

### 5. Verificar tabelas criadas

1. No Supabase, vá em **Table Editor**
2. Você deve ver as seguintes tabelas:
   - ✅ **devices** - Dispositivos cadastrados
   - ✅ **connections** - Histórico de conexões
   - ✅ **messages** - Mensagens recebidas
   - ✅ **location_reports** - Relatórios GPS
   - ✅ **alerts** - Alertas dos dispositivos
   - ✅ **device_stats** - Estatísticas diárias

### 6. Testar conexão (opcional)

Execute este comando para testar a conexão:

```bash
npm run test:database
```

## 📊 Estrutura das Tabelas

### **devices**

```sql
- id (UUID) - Primary key
- imei (VARCHAR) - IMEI único do dispositivo
- device_name (VARCHAR) - Nome do dispositivo
- protocol_version (VARCHAR) - Versão do protocolo
- first_seen (TIMESTAMPTZ) - Primeira vez visto
- last_seen (TIMESTAMPTZ) - Última vez visto
- is_active (BOOLEAN) - Se está ativo
- total_messages (INTEGER) - Total de mensagens
```

### **connections**

```sql
- id (UUID) - Primary key
- device_id (UUID) - FK para devices
- client_ip (INET) - IP do cliente
- connected_at (TIMESTAMPTZ) - Data/hora conexão
- disconnected_at (TIMESTAMPTZ) - Data/hora desconexão
- duration_seconds (INTEGER) - Duração em segundos
- message_count (INTEGER) - Mensagens nesta conexão
```

### **messages**

```sql
- id (UUID) - Primary key
- device_id (UUID) - FK para devices
- connection_id (UUID) - FK para connections
- frame_type (VARCHAR) - Tipo de frame (+ACK, +RESP, etc)
- command_word (VARCHAR) - Comando (GTHBD, GTFRI, etc)
- raw_message (TEXT) - Mensagem original completa
- send_time (VARCHAR) - Timestamp da mensagem
- count_number (VARCHAR) - Número sequencial
- received_at (TIMESTAMPTZ) - Quando foi recebida
- processed (BOOLEAN) - Se foi processada
```

### **location_reports**

```sql
- id (UUID) - Primary key
- device_id (UUID) - FK para devices
- message_id (UUID) - FK para messages
- latitude (DECIMAL) - Latitude GPS
- longitude (DECIMAL) - Longitude GPS
- speed (DECIMAL) - Velocidade km/h
- heading (INTEGER) - Direção 0-359°
- altitude (DECIMAL) - Altitude
- battery_level (DECIMAL) - Nível bateria
- report_time (TIMESTAMPTZ) - Hora do relatório
```

### **alerts**

```sql
- id (UUID) - Primary key
- device_id (UUID) - FK para devices
- message_id (UUID) - FK para messages
- alert_type (ENUM) - Tipo do alerta
- severity (ENUM) - Severidade (low, medium, high, critical)
- description (TEXT) - Descrição do alerta
- additional_data (JSONB) - Dados extras
- resolved (BOOLEAN) - Se foi resolvido
- resolved_at (TIMESTAMPTZ) - Quando foi resolvido
```

## 🔍 Views Criadas

### **devices_with_last_location**

Dispositivos com última localização conhecida

### **device_summary_stats**

Resumo estatístico por dispositivo

### **active_alerts_with_device**

Alertas ativos com informações do dispositivo

## 🔧 Funções Utilitárias

### **increment_device_message_count(device_id)**

Incrementa contador de mensagens de um dispositivo

### **cleanup_old_data(days_to_keep)**

Remove dados antigos (padrão: 90 dias)

```sql
-- Exemplo de uso:
SELECT * FROM cleanup_old_data(30); -- Remove dados > 30 dias
```

## 🛡️ Segurança (RLS)

- **Row Level Security habilitado** em todas as tabelas
- **Políticas permissivas** criadas para desenvolvimento
- ⚠️ **Para produção**: Ajustar políticas conforme necessário

## 🧪 Teste da Configuração

### 1. Instalar dependência

```bash
npm install
```

### 2. Iniciar servidor

```bash
npm run dev
```

### 3. Conectar simulador

```bash
npm run test:device
```

### 4. Verificar dados no Supabase

1. Vá em **Table Editor** → **devices**
2. Deve aparecer um dispositivo com IMEI `865585040014007`
3. Vá em **connections** → deve haver uma conexão ativa
4. Vá em **messages** → deve haver mensagens de heartbeat e localização

## 📈 Monitoramento

### No Supabase Dashboard:

- **Database** → Ver uso do banco
- **API** → Ver requisições da API
- **Logs** → Ver logs de erro
- **Reports** → Relatórios de performance

### No seu terminal:

```bash
# Monitorar logs
npm run logs:monitor

# Ver estatísticas
# (será implementado comando específico)
```

## 🚨 Troubleshooting

### Erro "Invalid API key"

- Verifique se `SUPABASE_URL` e `SUPABASE_ANON_KEY` estão corretos no `.env`
- Confirme que não há espaços extras nas variáveis

### Erro "relation does not exist"

- Execute novamente o schema SQL completo
- Verifique se todas as tabelas foram criadas

### Dados não aparecem

- Verifique se o servidor TCP está salvando no banco
- Monitore logs com `npm run logs:monitor`
- Verifique conexão de rede com Supabase

### Performance lenta

- Verifique plano do Supabase (free tier tem limites)
- Execute `ANALYZE;` no SQL Editor para atualizar estatísticas

## 📞 Suporte

- **Documentação Supabase**: [docs.supabase.com](https://docs.supabase.com)
- **Comunidade**: [discord.gg/supabase](https://discord.gg/supabase)
- **Status**: [status.supabase.com](https://status.supabase.com)

## 🎯 Próximos Passos

Após configurar o Supabase:

1. ✅ Testar integração completa
2. 🔄 Criar dashboard web
3. 📊 Implementar relatórios
4. 🚨 Configurar alertas em tempo real
5. 🔒 Ajustar segurança para produção
