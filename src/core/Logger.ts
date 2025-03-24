import { createWriteStream, WriteStream, mkdirSync, existsSync } from "fs";
import { join } from "path";
import * as os from "os";

export class Logger {
  private static instance: Logger;
  private logStream: WriteStream | null = null;
  private logFilePath: string;
  private logDir: string;

  private constructor() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    
    // Get log directory from environment variable or use default
    this.logDir = process.env.MCP_LOGS_DIR || "logs";
    this.logFilePath = join(this.logDir, `mcp-server-${timestamp}.log`);
    
    try {
      // If the directory doesn't exist, create it
      if (!existsSync(this.logDir)) {
        try {
          // First try to create in the current directory
          mkdirSync(this.logDir, { recursive: true });
          process.stderr.write(`Created logs directory: ${this.logDir}\n`);
        } catch (err) {
          // If that fails, try to use the tmp directory
          this.logDir = join(os.tmpdir(), "mcp-logs");
          this.logFilePath = join(this.logDir, `mcp-server-${timestamp}.log`);
          
          // Create the directory in tmp
          if (!existsSync(this.logDir)) {
            mkdirSync(this.logDir, { recursive: true });
          }
          process.stderr.write(`Created logs directory in temp: ${this.logDir}\n`);
        }
      }
      
      // Now create the write stream
      this.logStream = createWriteStream(this.logFilePath, { flags: "a" });
      process.stderr.write(`Log file created at: ${this.logFilePath}\n`);
    } catch (err) {
      // If all fails, log to stderr only
      process.stderr.write(`Failed to create log file: ${err}\n`);
      process.stderr.write(`Logs will only be written to stderr\n`);
    }

    process.on("exit", () => this.close());
    process.on("SIGINT", () => this.close());
    process.on("SIGTERM", () => this.close());
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
    if (this.logStream) {
      this.logStream.write(formattedMessage);
    }
    process.stderr.write(formattedMessage);
  }

  public log(message: string): void {
    this.info(message);
  }

  public error(message: string): void {
    const formattedMessage = this.formatMessage("ERROR", message);
    if (this.logStream) {
      this.logStream.write(formattedMessage);
    }
    process.stderr.write(formattedMessage);
  }

  public warn(message: string): void {
    const formattedMessage = this.formatMessage("WARN", message);
    if (this.logStream) {
      this.logStream.write(formattedMessage);
    }
    process.stderr.write(formattedMessage);
  }

  public debug(message: string): void {
    const formattedMessage = this.formatMessage("DEBUG", message);
    if (this.logStream) {
      this.logStream.write(formattedMessage);
    }
    process.stderr.write(formattedMessage);
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
}

export const logger = Logger.getInstance();
