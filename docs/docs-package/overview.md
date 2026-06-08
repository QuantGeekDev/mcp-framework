# @mcpframework/docs Overview

`@mcpframework/docs` is a companion package that lets API providers spin up an MCP documentation server from their existing documentation site. Developers connect from Claude Code, Cursor, or any MCP client and get tools to search, browse, and retrieve documentation — enabling AI agents to write correct integration code on the first try.

## How It Works

The package provides:

1. **Source Adapters** — connect to your documentation backend (Fumadocs, any site with `llms.txt`)
2. **MCP Tools** — `search_docs`, `get_page`, `list_sections` that AI agents can call
3. **DocsServer** — a convenience wrapper that wires everything together
4. **CLI Scaffolder** — `npx -p @mcpframework/docs create-docs-mcp my-api-docs` to generate a project in seconds

```
Your Docs Site                    MCP Client (Claude Code, Cursor, etc.)
┌──────────────┐                  ┌──────────────────────────────┐
│  llms.txt    │◄────fetch────────│                              │
│  /api/search │                  │   search_docs("auth")        │
│  pages.mdx   │    DocsServer    │   get_page("getting-started")│
└──────────────┘   ┌──────────┐   │   list_sections()            │
                   │ Source   │   │                              │
                   │ Adapter  │◄──┤  AI Agent writes integration │
                   │ + Cache  │   │  code using your docs        │
                   └──────────┘   └──────────────────────────────┘
```

## Quick Start

```typescript
import { DocsServer, FumadocsRemoteSource } from "@mcpframework/docs";

const source = new FumadocsRemoteSource({
  baseUrl: "https://docs.myapi.com",
});

const server = new DocsServer({
  source,
  name: "my-api-docs",
  version: "1.0.0",
});

server.start();
```

Or scaffold a complete project:

```bash
npx -p @mcpframework/docs create-docs-mcp my-api-docs
cd my-api-docs
cp .env.example .env
# Edit .env with your docs site URL
npm run build && npm start
```

## Relationship to mcp-framework

`@mcpframework/docs` is a **consumer** of mcp-framework, not a fork. It imports `MCPTool` from mcp-framework and composes pre-built documentation tools on top of it. This keeps the core framework general-purpose while giving docs-server users a turnkey experience.

```
mcp-framework (peer dependency)
    └── @mcpframework/docs
            ├── DocSource interface
            ├── Pre-built tools (SearchDocs, GetPage, ListSections)
            ├── DocsServer convenience class
            └── CLI template
```

## Prerequisites

Your documentation site must serve at least one of:

- `/llms.txt` — a structured index of your documentation (required)
- `/llms-full.txt` — full content of all documentation pages (required for search)
- `/api/search` — Fumadocs Orama search endpoint (optional, for higher-quality search)

See [Fumadocs Setup](./fumadocs-setup.md) for instructions on enabling these endpoints.

## Next Steps

- [Sources](./sources.md) — Learn about source adapters
- [Tools](./tools.md) — Available MCP tools and their parameters
- [Server Configuration](./server.md) — DocsServer options
- [Caching](./caching.md) — Cache configuration and custom implementations
- [CLI](./cli.md) — Project scaffolding
- [Custom Adapters](./custom-adapters.md) — Build your own source adapter
- [Fumadocs Setup](./fumadocs-setup.md) — Configure your Fumadocs site
