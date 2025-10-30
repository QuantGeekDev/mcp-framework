import { createWriteStream, WriteStream } from "fs";
import { join } from "path";
import { mkdir } from "fs/promises";

export class Logger {
  private static instance: Logger;
  private logStream: WriteStream | null = null;
  private logFilePath: string = '';
  private logToFile: boolean = false;

  private constructor() {
    this.logToFile = process.env.MCP_ENABLE_FILE_LOGGING === 'true';
    
    if (this.logToFile) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const logDir = process.env.MCP_LOG_DIRECTORY || "logs";

      this.initFileLogging(logDir, timestamp);
    }

    process.on("exit", () => this.close());
    process.on("SIGINT", () => this.close());
    process.on("SIGTERM", () => this.close());
  }

  private async initFileLogging(logDir: string, timestamp: string): Promise<void> {
    try {
      await mkdir(logDir, { recursive: true });
      this.logFilePath = join(logDir, `mcp-server-${timestamp}.log`);
      this.logStream = createWriteStream(this.logFilePath, { flags: "a" });
      this.info(`File logging enabled, writing to: ${this.logFilePath}`);
    } catch (err) {
      process.stderr.write(`Failed to initialize file logging: ${err}\n`);
      this.logToFile = false;
    }
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private getTimestamp(): string {
    return new Date().toISOString();
  }

  private formatMessage(level: string, message: string): string {
    return `[${this.getTimestamp()}] [${level}] ${message}\n`;
  }

  public info(message: string): void {
    const formattedMessage = this.formatMessage("INFO", message);
    if (this.logToFile && this.logStream) {
      this.logStream.write(formattedMessage);
    }
    process.stderr.write(formattedMessage);
  }

  public log(message: string): void {
    this.info(message);
  }

  public error(message: string): void {
    const formattedMessage = this.formatMessage("ERROR", message);
    if (this.logToFile && this.logStream) {
      this.logStream.write(formattedMessage);
    }
    process.stderr.write(formattedMessage);
  }

  public warn(message: string): void {
    const formattedMessage = this.formatMessage("WARN", message);
    if (this.logToFile && this.logStream) {
      this.logStream.write(formattedMessage);
    }
    process.stderr.write(formattedMessage);
  }

  public debug(message: string): void {
    const formattedMessage = this.formatMessage("DEBUG", message);
    if (this.logToFile && this.logStream) {
      this.logStream.write(formattedMessage);
    }
    if (process.env.MCP_DEBUG_CONSOLE === 'true') {
      process.stderr.write(formattedMessage);
    }
  }

  public close(): void {
    if (this.logStream) {
      this.logStream.end();
      this.logStream = null;
    }
  }

  public getLogPath(): string {
    return this.logFilePath;
  }

  public isFileLoggingEnabled(): boolean {
    return this.logToFile;
  }
}

export const logger = Logger.getInstance();
