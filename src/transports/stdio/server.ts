import { StdioServerTransport as SDKStdioTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { BaseTransport } from "../base.js";
import { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import {
  ImageTransportOptions,
  DEFAULT_IMAGE_OPTIONS,
  hasImageContent,
  prepareImageForTransport,
  ImageContent
} from "../utils/image-handler.js";
import { logger } from "../../core/Logger.js";

type ExtendedJSONRPCMessage = JSONRPCMessage & {
  result?: {
    content?: Array<ImageContent | { type: string; [key: string]: unknown }>;
    [key: string]: unknown;
  };
};

/**
 * StdioServerTransport
 */
export class StdioServerTransport implements BaseTransport {
  readonly type = "stdio";
  private transport: SDKStdioTransport;
  private running: boolean = false;
  private imageOptions: ImageTransportOptions;

  constructor(imageOptions: Partial<ImageTransportOptions> = {}) {
    this.transport = new SDKStdioTransport();
    this.imageOptions = {
      ...DEFAULT_IMAGE_OPTIONS,
      ...imageOptions
    };
  }

  async start(): Promise<void> {
    await this.transport.start();
    this.running = true;

    // Exit cleanly when the parent process disconnects (stdin EOF). Without
    // this, the underlying SDK readline poll spins on null reads after the
    // pipe closes, leaving the server reparented to init at ~99% CPU until
    // killed manually. Observed daily on macOS Darwin 25.x when the parent
    // (Claude CLI / Claude Desktop) is hard-killed.
    process.stdin.on("end", this.handleStdinClose);
    process.stdin.on("close", this.handleStdinClose);
  }

  private handleStdinClose = (): void => {
    // Stdio transport has no work to do once stdin is gone. Best-effort
    // cleanup of the SDK transport, then exit so launchd / parent never sees
    // a CPU-spinning zombie.
    this.transport.close().finally(() => process.exit(0));
  };

  async send(message: ExtendedJSONRPCMessage): Promise<void> {
    try {
      if (hasImageContent(message)) {
        message = this.prepareMessageWithImage(message);
      }
      await this.transport.send(message);
    } catch (error) {
      logger.error(`Error sending message through stdio transport: ${error}`);
      throw error;
    }
  }

  private prepareMessageWithImage(message: ExtendedJSONRPCMessage): ExtendedJSONRPCMessage {
    if (!message.result?.content) {
      return message;
    }

    const processedContent = message.result.content.map((item: ImageContent | { type: string; [key: string]: unknown }) => {
      if (item.type === 'image') {
        return prepareImageForTransport(item as ImageContent, this.imageOptions);
      }
      return item;
    });

    return {
      ...message,
      result: {
        ...message.result,
        content: processedContent
      }
    };
  }

  async close(): Promise<void> {
    process.stdin.off("end", this.handleStdinClose);
    process.stdin.off("close", this.handleStdinClose);
    await this.transport.close();
    this.running = false;
  }

  isRunning(): boolean {
    return this.running;
  }

  set onclose(handler: (() => void) | undefined) {
    this.transport.onclose = handler;
  }

  set onerror(handler: ((error: Error) => void) | undefined) {
    this.transport.onerror = handler;
  }

  set onmessage(handler: ((message: JSONRPCMessage) => void) | undefined) {
    this.transport.onmessage = handler;
  }
}
