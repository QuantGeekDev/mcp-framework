import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { WebSocketClientTransport } from '@modelcontextprotocol/sdk/client/websocket.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import readline from 'readline/promises';

/**
 * Supported MCPClient configuration types.
 */
type MCPClientConfig =
  | {
      transport: 'stdio';
      serverScriptPath: string;
    }
  | {
      transport: 'sse';
      url: string;
      headers?: Record<string, string>;
    }
  | {
      transport: 'websocket';
      url: string;
      // WebSocket transport in the SDK might not directly support custom headers in constructor
    }
  | {
      transport: 'http-stream';
      url: string;
      headers?: Record<string, string>;
    };

/**
 * MCPClient supports connecting to an MCP server over multiple transports:
 * - stdio (spawns a subprocess)
 * - SSE (connects to a remote HTTP SSE endpoint)
 * - WebSocket (connects to a remote WebSocket endpoint)
 * - HTTP Stream (connects to a remote HTTP streaming POST endpoint)
 */
class MCPClient {
  private mcp: Client;
  private transport: any = null;
  private tools: Array<{ name: string; description: string; input_schema: any }> = []; // Typed tools array

  constructor() {
    this.mcp = new Client({ name: 'mcp-client-cli', version: '1.0.0' });
  }

  /**
   * Connect to an MCP server using the specified transport configuration.
   */
  async connect(config: MCPClientConfig) {
    if (config.transport === 'stdio') {
      const isJs = config.serverScriptPath.endsWith('.js');
      const isPy = config.serverScriptPath.endsWith('.py');
      if (!isJs && !isPy) {
        throw new Error('Server script must be a .js or .py file');
      }
      const command = isPy
        ? process.platform === 'win32'
          ? 'python'
          : 'python3'
        : process.execPath;

      this.transport = new StdioClientTransport({
        command,
        args: [config.serverScriptPath],
      });
    } else if (config.transport === 'sse') {
      this.transport = new SSEClientTransport(
        new URL(config.url),
        config.headers
          ? {
              eventSourceInit: {
                fetch: (u, init) =>
                  fetch(u, {
                    ...init,
                    headers: {
                      ...(init?.headers || {}),
                      ...config.headers,
                      Accept: 'text/event-stream',
                    },
                  }),
              },
              // requestInit might be used by some SDK versions for initial handshake if any,
              // but primary header injection for SSE is via eventSourceInit.fetch override.
              requestInit: { headers: config.headers },
            }
          : undefined
      );
    } else if (config.transport === 'websocket') {
      // WebSocket constructor in @modelcontextprotocol/sdk typically doesn't take headers.
      // Headers are usually set during the WebSocket handshake by the browser/client environment,
      // or might require a custom transport if server-side node client needs them for ws library.
      this.transport = new WebSocketClientTransport(new URL(config.url));
    } else if (config.transport === 'http-stream') {
      this.transport = new StreamableHTTPClientTransport(
        new URL(config.url),
        config.headers ? { requestInit: { headers: config.headers } } : undefined
      );
    } else {
      throw new Error(`Unsupported transport type: ${(config as any).transport}`);
    }

    this.mcp.connect(this.transport);

    const toolsResult = await this.mcp.listTools();
    this.tools = toolsResult.tools.map((tool) => ({
      name: tool.name,
      description: tool.description ?? '', // Ensure description is always a string
      input_schema: tool.inputSchema,
    }));
    console.log(`Successfully connected to server. Found ${this.tools.length} tools.`);
  }

  async callTool(toolName: string, toolArgs: any) {
    return await this.mcp.callTool({
      name: toolName,
      arguments: toolArgs,
    });
  }

  getTools() {
    return this.tools;
  }

  async chatLoop() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: 'mcp> ',
    });

    console.log('\nMCP Client REPL. Type "help" for commands, "quit" or "exit" to exit.');
    rl.prompt();

    try {
      for await (const line of rl) {
        const [cmd, ...rest] = line.trim().split(/\s+/);

        switch (cmd?.toLowerCase()) {
          case 'quit':
          case 'exit':
            rl.close();
            return;
          case 'help':
            console.log(`
Available commands:
  help                            - Show this help message.
  tools                           - List available tools from the connected server.
  call <toolName> [jsonArgs]      - Call a tool with JSON arguments.
                                    Example: call MyTool {"param1":"value1"}
                                    Example: call NoArgTool
  quit / exit                     - Exit the REPL.`);
            break;
          case 'tools': {
            const tools = this.getTools();
            if (tools.length > 0) {
              console.log('Available tools:');
              console.table(tools.map((t) => ({ Name: t.name, Description: t.description })));
            } else {
              console.log('No tools available or not connected.');
            }
            break;
          }
          case 'call': {
            const [toolName, ...jsonPieces] = rest;
            if (!toolName) {
              console.error('Error: toolName is required. Usage: call <toolName> [jsonArgs]');
              break;
            }
            try {
              const argsString = jsonPieces.join(' ');
              // Allow empty argsString for tools that take no arguments
              const toolArgs = argsString ? JSON.parse(argsString) : {};
              console.log(`Calling tool "${toolName}" with args:`, toolArgs);
              const result = await this.callTool(toolName, toolArgs);
              console.log('Tool result:');
              console.dir(result, { depth: null, colors: true });
            } catch (err: any) {
              console.error(`Error calling tool "${toolName}":`, err.message || err);
              if (err instanceof SyntaxError) {
                console.error(
                  'Hint: Ensure your JSON arguments are correctly formatted, e.g., {"key": "value"}.'
                );
              }
            }
            break;
          }
          case '': // Handle empty input from just pressing Enter
            break;
          default: {
            if (cmd) {
              // Only show unknown if cmd is not empty
              console.log(`Unknown command: "${cmd}". Type "help" for available commands.`);
            }
          }
        }
        rl.prompt();
      }
    } catch (error) {
      console.error('An unexpected error occurred in the REPL:', error);
    } finally {
      if (!rl.close) {
        rl.close();
      }
    }
  }

  async cleanup() {
    console.log('\nCleaning up and disconnecting...');
    await this.mcp.close();
    console.log('Disconnected.');
  }
}

async function main() {
  const args = process.argv.slice(2);
  const argMap: Record<string, string | boolean | undefined> = {}; // Allow boolean for flags like --help
  const headers: Record<string, string> = {};

  function printUsageAndExit(exitCode = 1) {
    console.log(`
Usage: mcp-client --transport <type> [options]

Transports and their specific options:
  --transport stdio --script <path_to_server_script.js|.py>
    Connects to a local MCP server script via standard input/output.

  --transport sse --url <server_sse_url>
    Connects to an MCP server via Server-Sent Events (SSE).

  --transport websocket --url <server_websocket_url>
    Connects to an MCP server via WebSockets.

  --transport http-stream --url <server_http_stream_url>
    Connects to an MCP server via HTTP Streaming.

Optional flags (for sse and http-stream transports):
  --header <key=value>
    Adds an HTTP header to the request. Can be specified multiple times.
    Example: --header X-Auth-Token=mysecret --header Trace=1

General options:
  --help
    Show this usage information.
`);
    process.exit(exitCode);
  }

  for (let i = 0; i < args.length; i++) {
    const currentArg = args[i];
    if (currentArg === '--help') {
      printUsageAndExit(0);
    } else if (currentArg === '--header') {
      i++; // Move to the value part of --header
      const pair = args[i] ?? '';
      const [k, v] = pair.split('=');
      if (!k || v === undefined) {
        console.error(
          'Error: Header syntax must be key=value (e.g., --header X-Auth-Token=secret)'
        );
        printUsageAndExit();
      }
      headers[k] = v;
    } else if (currentArg.startsWith('--')) {
      const key = currentArg.substring(2);
      // Check if next arg is a value or another flag
      if (args[i + 1] && !args[i + 1].startsWith('--')) {
        argMap[key] = args[i + 1];
        i++; // Skip next arg as it's a value
      } else {
        argMap[key] = true; // Treat as a boolean flag if no value follows
      }
    } else {
      // Positional arguments not expected here, or handle them if your CLI design changes
      console.error(`Error: Unexpected argument '${currentArg}'`);
      printUsageAndExit();
    }
  }

  const transport = argMap['transport'] as string | undefined;
  const script = argMap['script'] as string | undefined;
  const url = argMap['url'] as string | undefined;

  if (!transport || !['stdio', 'sse', 'websocket', 'http-stream'].includes(transport)) {
    console.error('Error: Missing or invalid --transport specified.');
    printUsageAndExit();
  }

  if (transport === 'stdio' && !script) {
    console.error('Error: --script is required for stdio transport.');
    printUsageAndExit();
  }

  if ((transport === 'sse' || transport === 'websocket' || transport === 'http-stream') && !url) {
    console.error('Error: --url is required for sse, websocket, or http-stream transport.');
    printUsageAndExit();
  }

  let config: MCPClientConfig;
  const effectiveHeaders = Object.keys(headers).length > 0 ? headers : undefined;

  if (transport === 'stdio') {
    config = { transport: 'stdio', serverScriptPath: script! };
  } else if (transport === 'sse') {
    config = { transport: 'sse', url: url!, headers: effectiveHeaders };
  } else if (transport === 'websocket') {
    // Note: WebSocket headers are typically not passed this way via constructor
    config = { transport: 'websocket', url: url! };
  } else {
    // http-stream
    config = { transport: 'http-stream', url: url!, headers: effectiveHeaders };
  }

  const mcpClient = new MCPClient();
  try {
    await mcpClient.connect(config);
    await mcpClient.chatLoop();
  } catch (error: any) {
    console.error(`\nFatal error during MCPClient operation: ${error.message || error}`);
    // console.error(error.stack); // Uncomment for more detailed stack trace
  } finally {
    await mcpClient.cleanup();
    process.exit(0); // Ensure clean exit
  }
}

// Entry point if script is run directly
if (
  require.main === module ||
  (process.argv[1] &&
    (process.argv[1].endsWith('mcp-client') ||
      process.argv[1].endsWith('MCPClient.js') ||
      process.argv[1].endsWith('MCPClient.ts')))
) {
  main().catch((err) => {
    // This catch is for unhandled promise rejections from main() itself, though inner try/catch should handle most.
    console.error('Unhandled error in main execution:', err);
    process.exit(1);
  });
}

export { MCPClient, MCPClientConfig };
