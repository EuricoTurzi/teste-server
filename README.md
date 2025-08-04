# Servidor TCP GL33CG @Track Protocol

Servidor TCP em TypeScript para recebimento de dados dos dispositivos GL33CG da Queclink usando o protocolo @Track Air Interface.

## 📋 Pré-requisitos

### Windows

- **Node.js 18+** - [Download aqui](https://nodejs.org/)
- **Git** - [Download aqui](https://git-scm.com/)
- **VS Code** (recomendado) - [Download aqui](https://code.visualstudio.com/)

### Verificar instalações

```bash
node --version
npm --version
git --version
```

## 🚀 Inicialização do Projeto

### 1. Clonar/Criar o projeto

```bash
# Se usando Git
git clone <seu-repositorio>
cd gl33cg-tcp-server

# Ou criar manualmente
mkdir gl33cg-tcp-server
cd gl33cg-tcp-server
```

### 2. Criar estrutura de pastas

```bash
mkdir src
mkdir src\types
mkdir src\utils
mkdir src\services
mkdir logs
```

### 3. Criar arquivos do projeto

Copie os arquivos criados anteriormente:

- `package.json`
- `tsconfig.json`
- `src\types\protocol.ts`
- `src\utils\protocolParser.ts`

### 4. Instalar dependências

```bash
npm install
```

### 5. Configurar variáveis de ambiente

```bash
# Copiar arquivo de exemplo
copy .env.example .env

# Editar .env conforme necessário
notepad .env
```

### 6. Executar em modo desenvolvimento

```bash
npm run dev
```

## 📁 Estrutura do Projeto

```
gl33cg-tcp-server/
├── src/
│   ├── types/
│   │   └── protocol.ts          # Tipos e interfaces do protocolo
│   ├── utils/
│   │   └── protocolParser.ts    # Parser de mensagens @Track
│   ├── services/
│   │   ├── tcpServer.ts         # Servidor TCP principal
│   │   ├── clientManager.ts     # Gerenciador de clientes
│   │   └── logger.ts           # Sistema de logging
│   └── server.ts               # Ponto de entrada da aplicação
├── dist/                       # Arquivos compilados (auto-gerado)
├── logs/                       # Logs da aplicação
├── .env                        # Configurações de ambiente
├── .env.example               # Exemplo de configurações
├── package.json               # Configuração do projeto
├── tsconfig.json              # Configuração TypeScript
└── README.md                  # Este arquivo
```

## 🔧 Scripts Disponíveis

```bash
# Desenvolvimento com hot reload
npm run dev

# Compilar TypeScript
npm run build

# Executar versão compilada
npm start

# Compilar e observar mudanças
npm run watch

# Limpar arquivos compilados
npm run clean
```

## ⚙️ Configurações (.env)

| Variável             | Descrição                   | Padrão    |
| -------------------- | --------------------------- | --------- |
| `SERVER_PORT`        | Porta do servidor TCP       | `8080`    |
| `SERVER_HOST`        | IP do servidor              | `0.0.0.0` |
| `ENABLE_SACK`        | Habilitar respostas SACK    | `true`    |
| `SACK_MODE`          | Modo de resposta SACK (0-2) | `1`       |
| `HEARTBEAT_INTERVAL` | Intervalo heartbeat (min)   | `60`      |
| `CONNECTION_LIFE`    | Vida da conexão (seg)       | `30`      |
| `MAX_CONNECTIONS`    | Máximo de conexões          | `1000`    |
| `ENABLE_LOGGING`     | Habilitar logs              | `true`    |
| `LOG_LEVEL`          | Nível de log                | `info`    |

## 📊 Protocolo @Track Suportado

### Tipos de Frame

- `+ACK:` - Acknowledgement (Heartbeat)
- `+RESP:` - Response (Relatórios)
- `+BUFF:` - Buffer Report (Dados em buffer)
- `+SACK:` - Server Acknowledgement (Resposta do servidor)

### Comandos Principais

- `GTHBD` - Heartbeat Data
- `GTFRI` - Fixed Report Information
- `GTPFA` - Power Failure Alarm
- `GTPDP` - GPRS Connection Failure
- `GTBPL` - Battery Low
- `GTTEM` - Temperature
- E outros...

## 🔍 Logs e Monitoramento

Os logs são salvos em:

- `logs/application.log` - Log geral da aplicação
- `logs/protocol.log` - Log específico do protocolo
- `logs/errors.log` - Log de erros

## 🚨 Solução de Problemas

### Erro "Cannot find module"

```bash
npm install
npm run build
```

### Erro de porta em uso

```bash
# Verificar o que está usando a porta
netstat -ano | findstr :8080

# Matar processo se necessário
taskkill /PID <PID> /F

# Ou alterar porta no .env
```

### Problemas de permissão

```bash
# Executar como administrador
# Ou alterar porta para > 1024
```

## 📱 Testando com Dispositivos

### Configuração do GL33CG

```
AT+GTQSS=gl33cg,,,,3,,<IP_SERVIDOR>,<PORTA>,0,0,,,,,FFFF$
```

### Exemplo de mensagem recebida

```
+ACK:GTHBD,80200A0303,865585040014007,GL33CG,20190517022529,0029$
```

### Resposta SACK enviada

```
+SACK:GTHBD,80200A,0029$
```

## 🔄 Próximos Passos

1. ✅ Estrutura básica e parser
2. 🔄 Servidor TCP principal
3. ⏳ Sistema de logging
4. ⏳ Gerenciador de clientes
5. ⏳ Integração com banco de dados
6. ⏳ Interface web (Next.js)

## 📞 Suporte

Para dúvidas ou problemas:

1. Verifique os logs em `logs/`
2. Revise as configurações no `.env`
3. Consulte a documentação do protocolo @Track
