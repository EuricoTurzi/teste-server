/**
 * Monitor de logs em tempo real
 * Monitora arquivos de log e exibe atualizações
 */

import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

interface LogMonitorConfig {
  logDirectory: string;
  refreshInterval: number; // em ms
  maxLines: number;
  followMode: boolean;
}

class LogMonitor {
  private config: LogMonitorConfig;
  private watchers: Map<string, fs.FSWatcher> = new Map();
  private lastPositions: Map<string, number> = new Map();
  private rl: readline.Interface;
  private isRunning: boolean = false;

  constructor() {
    this.config = {
      logDirectory: process.env.LOG_DIRECTORY || "./logs",
      refreshInterval: 1000,
      maxLines: 50,
      followMode: true,
    };

    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  /**
   * Inicia o monitor
   */
  public start(): void {
    console.log("📊 LOG MONITOR GL33CG");
    console.log("═══════════════════════════════════");
    console.log(`📁 Diretório: ${this.config.logDirectory}`);
    console.log(`🔄 Intervalo: ${this.config.refreshInterval}ms`);
    console.log("═══════════════════════════════════\n");

    if (!fs.existsSync(this.config.logDirectory)) {
      console.log("❌ Diretório de logs não encontrado!");
      console.log(
        "   Certifique-se que o servidor foi executado pelo menos uma vez."
      );
      return;
    }

    this.isRunning = true;
    this.setupFileWatchers();
    this.showInitialLogs();
    this.startInteractiveMenu();
  }

  /**
   * Configura watchers para arquivos de log
   */
  private setupFileWatchers(): void {
    const logFiles = this.getLogFiles();

    for (const logFile of logFiles) {
      const filePath = path.join(this.config.logDirectory, logFile);

      try {
        // Inicializar posição do arquivo
        const stats = fs.statSync(filePath);
        this.lastPositions.set(logFile, stats.size);

        // Criar watcher
        const watcher = fs.watchFile(
          filePath,
          { interval: this.config.refreshInterval },
          () => {
            this.handleFileChange(logFile);
          }
        );

        console.log(`👀 Monitorando: ${logFile}`);
      } catch (error) {
        console.log(`⚠️  Não foi possível monitorar: ${logFile}`);
      }
    }
  }

  /**
   * Obtém lista de arquivos de log
   */
  private getLogFiles(): string[] {
    try {
      return fs
        .readdirSync(this.config.logDirectory)
        .filter((file) => file.endsWith(".log") && !file.includes("-"))
        .sort();
    } catch {
      return [];
    }
  }

  /**
   * Manipula mudanças em arquivo
   */
  private handleFileChange(logFile: string): void {
    if (!this.isRunning) return;

    const filePath = path.join(this.config.logDirectory, logFile);
    const lastPosition = this.lastPositions.get(logFile) || 0;

    try {
      const stats = fs.statSync(filePath);

      if (stats.size > lastPosition) {
        const newContent = this.readFileFromPosition(filePath, lastPosition);
        if (newContent.trim()) {
          this.displayNewContent(logFile, newContent);
        }
        this.lastPositions.set(logFile, stats.size);
      }
    } catch (error) {
      console.error(`❌ Erro ao ler ${logFile}:`, error);
    }
  }

  /**
   * Lê arquivo a partir de uma posição
   */
  private readFileFromPosition(filePath: string, position: number): string {
    const buffer = Buffer.alloc(8192); // 8KB buffer
    const fd = fs.openSync(filePath, "r");

    try {
      const stats = fs.fstatSync(fd);
      const bytesToRead = Math.min(buffer.length, stats.size - position);

      if (bytesToRead > 0) {
        fs.readSync(fd, buffer, 0, bytesToRead, position);
        return buffer.toString("utf8", 0, bytesToRead);
      }

      return "";
    } finally {
      fs.closeSync(fd);
    }
  }

  /**
   * Exibe novo conteúdo com formatação
   */
  private displayNewContent(logFile: string, content: string): void {
    const lines = content.trim().split("\n");
    const logType = logFile.replace(".log", "").toUpperCase();

    for (const line of lines) {
      if (line.trim()) {
        this.formatAndDisplayLine(logType, line);
      }
    }
  }

  /**
   * Formata e exibe linha de log
   */
  private formatAndDisplayLine(logType: string, line: string): void {
    const timestamp = new Date().toLocaleTimeString();

    // Cores para diferentes tipos de log
    const colors: { [key: string]: string } = {
      APPLICATION: "\x1b[36m", // Cyan
      PROTOCOL: "\x1b[32m", // Green
      CONNECTION: "\x1b[33m", // Yellow
      ERROR: "\x1b[31m", // Red
      DEVICE: "\x1b[35m", // Magenta
    };

    const color = colors[logType] || "\x1b[37m"; // White default
    const reset = "\x1b[0m";

    // Extrair nível de log se presente
    let levelIcon = "📝";
    if (line.includes("[ERROR]")) levelIcon = "❌";
    else if (line.includes("[WARN]")) levelIcon = "⚠️";
    else if (line.includes("[INFO]")) levelIcon = "ℹ️";
    else if (line.includes("[DEBUG]")) levelIcon = "🔍";

    console.log(
      `${color}[${timestamp}] ${levelIcon} [${logType}] ${line}${reset}`
    );
  }

  /**
   * Mostra logs iniciais
   */
  private showInitialLogs(): void {
    console.log("📋 ÚLTIMAS LINHAS DOS LOGS:\n");

    const logFiles = this.getLogFiles();

    for (const logFile of logFiles) {
      console.log(`\n📄 === ${logFile.toUpperCase()} ===`);
      this.showLastLines(logFile, 5);
    }

    console.log("\n🔴 === MODO TEMPO REAL ATIVO ===\n");
  }

  /**
   * Mostra últimas linhas de um arquivo
   */
  private showLastLines(logFile: string, numLines: number): void {
    const filePath = path.join(this.config.logDirectory, logFile);

    try {
      const content = fs.readFileSync(filePath, "utf8");
      const lines = content.trim().split("\n");
      const lastLines = lines.slice(-numLines);

      for (const line of lastLines) {
        if (line.trim()) {
          console.log(`  ${line}`);
        }
      }
    } catch (error) {
      console.log(`  ❌ Erro ao ler arquivo: ${error}`);
    }
  }

  /**
   * Menu interativo
   */
  private startInteractiveMenu(): void {
    console.log("\n🎮 COMANDOS DISPONÍVEIS:");
    console.log("═══════════════════════");
    console.log("s - Mostrar estatísticas dos logs");
    console.log("c - Limpar tela");
    console.log("r - Recarregar arquivos");
    console.log("f - Alternar modo follow");
    console.log("q - Sair");
    console.log("═══════════════════════\n");

    this.rl.on("line", (input) => {
      const command = input.trim().toLowerCase();

      switch (command) {
        case "s":
          this.showLogStats();
          break;
        case "c":
          console.clear();
          console.log("🔴 === MODO TEMPO REAL ATIVO ===\n");
          break;
        case "r":
          this.reloadFiles();
          break;
        case "f":
          this.toggleFollowMode();
          break;
        case "q":
          this.stop();
          process.exit(0);
          break;
        default:
          console.log("❓ Comando inválido. Digite s, c, r, f ou q");
      }
    });
  }

  /**
   * Mostra estatísticas dos logs
   */
  private showLogStats(): void {
    console.log("\n📊 ESTATÍSTICAS DOS LOGS");
    console.log("═══════════════════════════");

    const logFiles = this.getLogFiles();

    for (const logFile of logFiles) {
      const filePath = path.join(this.config.logDirectory, logFile);

      try {
        const stats = fs.statSync(filePath);
        const content = fs.readFileSync(filePath, "utf8");
        const lines = content.split("\n").length - 1;
        const size = (stats.size / 1024).toFixed(2);

        console.log(`📄 ${logFile}:`);
        console.log(`   Tamanho: ${size} KB`);
        console.log(`   Linhas: ${lines}`);
        console.log(`   Modificado: ${stats.mtime.toLocaleString()}`);
        console.log("");
      } catch (error) {
        console.log(`❌ Erro ao acessar ${logFile}: ${error}`);
      }
    }

    console.log("═══════════════════════════\n");
  }

  /**
   * Recarrega arquivos
   */
  private reloadFiles(): void {
    console.log("🔄 Recarregando arquivos...");

    // Parar watchers atuais
    this.watchers.forEach((watcher) => {
      // fs.watchFile não tem método close, usar fs.unwatchFile
    });
    this.watchers.clear();
    this.lastPositions.clear();

    // Reconfigurar
    this.setupFileWatchers();
    console.log("✅ Arquivos recarregados!\n");
  }

  /**
   * Alterna modo follow
   */
  private toggleFollowMode(): void {
    this.config.followMode = !this.config.followMode;
    console.log(
      `🔄 Modo follow: ${this.config.followMode ? "ATIVO" : "INATIVO"}\n`
    );
  }

  /**
   * Para o monitor
   */
  public stop(): void {
    console.log("\n🛑 Parando monitor de logs...");
    this.isRunning = false;

    // Parar todos os watchers
    const logFiles = this.getLogFiles();
    for (const logFile of logFiles) {
      const filePath = path.join(this.config.logDirectory, logFile);
      fs.unwatchFile(filePath);
    }

    this.rl.close();
    console.log("✅ Monitor parado com sucesso!");
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  const monitor = new LogMonitor();

  // Graceful shutdown
  process.on("SIGINT", () => {
    monitor.stop();
    process.exit(0);
  });

  monitor.start();
}

export { LogMonitor };
