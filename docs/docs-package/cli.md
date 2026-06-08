# CLI & Project Scaffolding

`@mcpframework/docs` includes a CLI tool that scaffolds a ready-to-run documentation MCP server project.

## Creating a Project

```bash
npx -p @mcpframework/docs create-docs-mcp my-api-docs
```

This creates a project with the following structure:

```
my-api-docs/
├── src/
│   └── index.ts          # Pre-configured DocsServer with FumadocsRemoteSource
├── package.json          # Dependencies on mcp-framework + @mcpframework/docs
├── tsconfig.json         # TypeScript configuration
├── .env.example          # DOCS_BASE_URL, optional DOCS_API_KEY
├── .gitignore
└── README.md             # Setup instructions and MCP client config
```

## Generated Files

### `src/index.ts`

```typescript
import { DocsServer, FumadocsRemoteSource } from "@mcpframework/docs";

const source = new FumadocsRemoteSource({
  baseUrl: process.env.DOCS_BASE_URL || "https://docs.example.com",
  headers: process.env.DOCS_API_KEY
    ? { Authorization: `Bearer ${process.env.DOCS_API_KEY}` }
    : undefined,
});

const server = new DocsServer({
  source,
  name: process.env.DOCS_SERVER_NAME || "my-api-docs",
  version: "1.0.0",
});

server.start();
```

### `.env.example`

```bash
DOCS_BASE_URL=https://docs.example.com
DOCS_SERVER_NAME=my-api-docs
# DOCS_API_KEY=your-api-key-here
```

## Setup After Scaffolding

```bash
cd my-api-docs
cp .env.example .env
# Edit .env with your documentation site URL
npm run build
npm start
```

## Connecting to MCP Clients

### Claude Code

```bash
claude mcp add my-api-docs -- node /path/to/my-api-docs/dist/index.js
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "my-api-docs": {
      "command": "node",
      "args": ["/path/to/my-api-docs/dist/index.js"],
      "env": {
        "DOCS_BASE_URL": "https://docs.myapi.com"
      }
    }
  }
}
```

### Cursor

Add to MCP settings:

```json
{
  "my-api-docs": {
    "command": "node",
    "args": ["/path/to/my-api-docs/dist/index.js"],
    "env": {
      "DOCS_BASE_URL": "https://docs.myapi.com"
    }
  }
}
```

## SKILL.md Template

The package includes a `SKILL.md.template` that you can customize to teach Claude Code how to approach integrations against your API. Copy it into your project:

```bash
cp node_modules/@mcpframework/docs/SKILL.md.template SKILL.md
# Edit SKILL.md with your API-specific patterns
```

The template includes `<!-- CUSTOMIZE -->` markers for sections you should edit:
- Authentication patterns
- SDK initialization
- Common API call patterns
- Error handling
- Common pitfalls
