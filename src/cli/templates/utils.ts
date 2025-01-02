export function generateLogger(): string {
  return `import { createWriteStream, WriteStream } from "fs";
import { join } from "path";
import { mkdir } from "fs/promises";

export class Logger {
  private static instance: Logger;
  private logStream: WriteStream | null = null;
  private logFilePath: string;
  private logDir: string;

  private constructor() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    this.logDir = join(process.cwd(), "logs");
    this.logFilePath = join(this.logDir, \`mcp-server-\${timestamp}.log\`);
    this.initializeLogDir();
  }

  private async initializeLogDir() {
    try {
      await mkdir(this.logDir, { recursive: true });
      this.logStream = createWriteStream(this.logFilePath, { flags: "a" });
      
      // Handle stream errors gracefully
      this.logStream.on('error', (err) => {
        console.error(\`Error writing to log file: \${err.message}\`);
        this.logStream = null; // Stop trying to write to file on error
      });
    } catch (err) {
      console.error(\`Failed to create logs directory: \${err}\`);
      // Continue without file logging
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
    return \`[\${this.getTimestamp()}] [\${level}] \${message}\n\`;
  }

  private writeToStream(formattedMessage: string) {
    // Always write to stderr for CLI visibility
    process.stderr.write(formattedMessage);

    // Try to write to file if stream is available
    if (this.logStream) {
      try {
        this.logStream.write(formattedMessage);
      } catch (err) {
        console.error(\`Error writing to log file: \${err}\`);
        this.logStream = null; // Stop trying to write to file on error
      }
    }
  }

  public info(message: string): void {
    const formattedMessage = this.formatMessage("INFO", message);
    this.writeToStream(formattedMessage);
  }

  public error(message: string): void {
    const formattedMessage = this.formatMessage("ERROR", message);
    this.writeToStream(formattedMessage);
  }

  public warn(message: string): void {
    const formattedMessage = this.formatMessage("WARN", message);
    this.writeToStream(formattedMessage);
  }

  public debug(message: string): void {
    const formattedMessage = this.formatMessage("DEBUG", message);
    this.writeToStream(formattedMessage);
  }

  public close(): void {
    if (this.logStream) {
      this.logStream.end();
      this.logStream = null;
    }
  }

  public getLogPath(): string | null {
    return this.logStream ? this.logFilePath : null;
  }
}

export const logger = Logger.getInstance();`;
}

export function generateComponentLoader(): string {
  return `import { join, dirname } from "path";
import { promises as fs } from "fs";
import { logger } from "./logger.js";

// Base interface for all components
interface BaseComponent {
  name: string;
}

export class ComponentLoader<T extends BaseComponent> {
  private readonly EXCLUDED_FILES = ["*.test.js", "*.spec.js"];
  private readonly componentDir: string;
  private readonly componentType: string;

  constructor(
    private basePath: string,
    componentType: string,
    private validateComponent: (component: any) => component is T
  ) {
    this.componentType = componentType;
    // When running from dist/index.js, we need to look in dist/[componentType]
    const scriptDir = dirname(process.argv[1]); // dist/
    this.componentDir = join(scriptDir, componentType);
    
    logger.debug(
      \`Initialized \${componentType} loader with directory: \${this.componentDir}\`
    );
  }

  async hasComponents(): Promise<boolean> {
    try {
      const stats = await fs.stat(this.componentDir);
      if (!stats.isDirectory()) {
        logger.debug("Component path exists but is not a directory");
        return false;
      }

      const files = await fs.readdir(this.componentDir);
      const hasValidFiles = files.some((dir) => this.isComponentDirectory(dir));
      logger.debug(\`Component directory has valid directories: \${hasValidFiles}\`);
      return hasValidFiles;
    } catch (error) {
      logger.debug("No component directory found");
      return false;
    }
  }

  private isComponentDirectory(dir: string): boolean {
    return !dir.startsWith('.') && !this.EXCLUDED_FILES.includes(dir);
  }

  async loadComponents(): Promise<T[]> {
    try {
      logger.debug(\`Attempting to load components from: \${this.componentDir}\`);

      let stats;
      try {
        stats = await fs.stat(this.componentDir);
      } catch (error) {
        logger.debug("No component directory found");
        return [];
      }

      if (!stats.isDirectory()) {
        logger.error(\`Path is not a directory: \${this.componentDir}\`);
        return [];
      }

      // Get component directories (example-tool, my-tool, etc.)
      const componentDirs = await fs.readdir(this.componentDir);
      logger.debug(\`Found component directories: \${componentDirs.join(", ")}\`);

      const components: T[] = [];

      for (const dir of componentDirs) {
        if (!this.isComponentDirectory(dir)) {
          continue;
        }

        try {
          // Import the index.js file from each component directory
          const indexPath = join(this.componentDir, dir, 'index.js');
          logger.debug(\`Attempting to load component from: \${indexPath}\`);

          // Use relative import path from current directory (dist/utils)
          const relativeImportPath = \`../\${this.componentType}/\${dir}/index.js\`;
          logger.debug(\`Using import path: \${relativeImportPath}\`);
          
          const { default: ComponentClass } = await import(relativeImportPath);

          if (!ComponentClass) {
            logger.warn(\`No default export found in \${indexPath}\`);
            continue;
          }

          // Pass the basePath to the component constructor
          const component = new ComponentClass(this.basePath);
          if (this.validateComponent(component)) {
            logger.debug(\`Successfully loaded component: \${component.name}\`);
            components.push(component);
          } else {
            logger.warn(\`Component validation failed for: \${dir}\`);
          }
        } catch (error) {
          logger.error(\`Error loading component \${dir}: \${error}\`);
        }
      }

      logger.debug(
        \`Successfully loaded \${components.length} components: \${components.map(c => c.name).join(', ')}\`
      );
      return components;
    } catch (error) {
      logger.error(\`Failed to load components: \${error}\`);
      return [];
    }
  }
}`;
}