# mcp-framework

MCP is a framework for building Model Context Protocol (MCP) servers elegantly in TypeScript.

MCP-Framework gives you architecture out of the box, with automatic directory-based discovery for tools, resources, and prompts. Use our powerful MCP abstractions to define tools, resources, or prompts in an elegant way. Our cli makes getting started with your own MCP server a breeze

[Read the full docs here](https://mcp-framework.com)

Get started fast with mcp-framework ⚡⚡⚡

## Features

- 🛠️ Automatic directory-based discovery and loading for tools, prompts, and resources
- 🏗️ Powerful abstractions with full type safety
- 🚀 Simple server setup and configuration
- 📦 CLI for rapid development and project scaffolding
- 🔍 Built-in support for autocompletion
- 📝 URI templates for dynamic resources

## Quick Start

### Using the CLI (Recommended)

```bash
# Install the framework globally
npm install -g mcp-framework

# Create a new MCP server project
mcp create my-mcp-server

# Navigate to your project
cd my-mcp-server

# Your server is ready to use!
```

### Manual Installation

```bash
npm install mcp-framework
```

## CLI Usage

The framework provides a powerful CLI for managing your MCP server projects:

### Project Creation

```bash
# Create a new project
mcp create <your project name here>
```

### Adding a Tool

```bash
# Add a new tool
mcp add tool price-fetcher
```

### Adding a Prompt

```bash
# Add a new prompt
mcp add prompt price-analysis
```

### Adding a Resource

```bash
# Add a new resource
mcp add resource market-data
```

## Development Workflow

1. Create your project:

```bash
  mcp create my-mcp-server
  cd my-mcp-server
```

2. Add tools as needed:

   ```bash
   mcp add tool data-fetcher
   mcp add tool data-processor
   mcp add tool report-generator
   ```

3. Build:

   ```bash
   npm run build

   ```

4. Add to MCP Client (Read below for Claude Desktop example)

## Using with Claude Desktop

### Local Development

Add this configuration to your Claude Desktop config file:

**MacOS**: \`~/Library/Application Support/Claude/claude_desktop_config.json\`
**Windows**: \`%APPDATA%/Claude/claude_desktop_config.json\`

```json
{
"mcpServers": {
"${projectName}": {
      "command": "node",
      "args":["/absolute/path/to/${projectName}/dist/index.js"]
}
}
}
```

### After Publishing

Add this configuration to your Claude Desktop config file:

**MacOS**: \`~/Library/Application Support/Claude/claude_desktop_config.json\`
**Windows**: \`%APPDATA%/Claude/claude_desktop_config.json\`

```json
{
"mcpServers": {
"${projectName}": {
      "command": "npx",
      "args": ["${projectName}"]
}
}
}
```

## Building and Testing

1. Make changes to your tools
2. Run \`npm run build\` to compile
3. The server will automatically load your tools on startup

## Components Overview

### 1. Tools (Main Component)

Tools are the primary way to extend an LLM's capabilities. Each tool should perform a specific function:

```typescript
import { MCPTool } from "mcp-framework";
import { z } from "zod";

interface ExampleInput {
  message: string;
}

class ExampleTool extends MCPTool<ExampleInput> {
  name = "example_tool";
  description = "An example tool that processes messages";

  schema = {
    message: {
      type: z.string(),
      description: "Message to process",
    },
  };

  async execute(input: ExampleInput) {
    return `Processed: ${input.message}`;
  }
}

export default ExampleTool;
```

### 2. Prompts (Optional)

Prompts help structure conversations with Claude and can provide completion suggestions:

```typescript
import { MCPPrompt } from "mcp-framework";
import { z } from "zod";

interface GreetingInput {
  name: string;
  language?: string;
}

class GreetingPrompt extends MCPPrompt<GreetingInput> {
  name = "greeting";
  description = "Generate a greeting in different languages";

  schema = {
    name: {
      type: z.string(),
      description: "Name to greet",
      required: true,
    },
    language: {
      type: z.string().optional(),
      description: "Language for greeting",
      required: false,
    },
  };

  // Provide auto-completions for arguments
  async complete(argumentName: string, value: string) {
    if (argumentName === "language") {
      const languages = ["English", "Spanish", "French", "German"];
      const matches = languages.filter(lang => 
        lang.toLowerCase().startsWith(value.toLowerCase())
      );
      return {
        values: matches,
        total: matches.length
      };
    }
    return { values: [] };
  }

  async generateMessages({ name, language = "English" }: GreetingInput) {
    return [
      {
        role: "user",
        content: {
          type: "text",
          text: `Generate a greeting for ${name} in ${language}`,
        },
      },
    ];
  }
}

export default GreetingPrompt;
```

### 3. Resources (Optional)

Resources provide data access capabilities with support for dynamic URIs and completions:

```typescript
import { MCPResource, ResourceContent } from "mcp-framework";

class ConfigResource extends MCPResource {
  uri = "config://app/settings";
  name = "Application Settings";
  description = "Current application configuration";
  mimeType = "application/json";

  protected template = {
    uriTemplate: "config://app/{section}",
    description: "Access settings by section"
  };

  // Optional: Provide completions for URI template arguments  
  async complete(argumentName: string, value: string) {
    if (argumentName === "section") {
      const sections = ["theme", "network"];
      return {
        values: sections.filter(s => s.startsWith(value)),
        total: sections.length
      };
    }
    return { values: [] };
  }

  async read(): Promise<ResourceContent[]> {
    const config = {
      theme: {
        mode: "dark",
        language: "en",
      },
      network: {
        proxy: "none"
      }
    };

    return [
      {
        uri: this.uri,
        mimeType: this.mimeType,
        text: JSON.stringify(config, null, 2),
      },
    ];
  }
}

export default ConfigResource;
```

## Project Structure

```
your-project/
├── src/
│   ├── tools/          # Tool implementations (Required)
│   │   └── ExampleTool.ts
│   ├── prompts/        # Prompt implementations (Optional)
│   │   └── GreetingPrompt.ts
│   ├── resources/      # Resource implementations (Optional)
│   │   └── ConfigResource.ts
│   └── index.ts
├── package.json
└── tsconfig.json
```

## Automatic Feature Discovery

The framework automatically discovers and loads:

- Tools from the `src/tools` directory
- Prompts from the `src/prompts` directory (if present)
- Resources from the `src/resources` directory (if present)

Each feature should be in its own file and export a default class that extends the appropriate base class:

- `MCPTool` for tools
- `MCPPrompt` for prompts
- `MCPResource` for resources

### Base Classes

#### MCPTool

- Handles input validation using Zod
- Provides error handling and response formatting
- Includes fetch helper for HTTP requests

#### MCPPrompt

- Manages prompt arguments and validation
- Generates message sequences for LLM interactions
- Supports dynamic prompt templates
- Optional completion support for arguments

#### MCPResource

- Exposes data through URI-based system
- Supports text and binary content
- Optional subscription capabilities for real-time updates
- Optional URI templates for dynamic access
- Optional completion support for template arguments

## Type Safety

All features use Zod for runtime type validation and TypeScript for compile-time type checking. Define your input schemas using Zod types:

```typescript
schema = {
  parameter: {
    type: z.string().email(),
    description: "User email address",
  },
  count: {
    type: z.number().min(1).max(100),
    description: "Number of items",
  },
};
```

## License

MIT
