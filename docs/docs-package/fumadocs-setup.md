# Fumadocs Setup Guide

This guide explains how to configure your [Fumadocs](https://fumadocs.vercel.app/) documentation site to work with `@mcpframework/docs`.

## Prerequisites

- A Fumadocs site using `fumadocs-core` and `fumadocs-mdx` (or `fumadocs-openapi`)
- Node.js 18+

## Step 1: Enable llms.txt

Fumadocs provides built-in support for generating `llms.txt` files via the `source.llms()` utility.

### In your `app/llms.txt/route.ts`:

```typescript
import { source } from "@/lib/source"; // Your Fumadocs source config

export function GET() {
  const content = source.llms().index();

  return new Response(content, {
    headers: { "Content-Type": "text/plain" },
  });
}
```

### In your `app/llms-full.txt/route.ts`:

```typescript
import { source } from "@/lib/source";

export async function GET() {
  const content = await source.llms().full();

  return new Response(content, {
    headers: { "Content-Type": "text/plain" },
  });
}
```

## Step 2: Enable Search API (Recommended)

Fumadocs includes a built-in Orama search API. If you haven't already set it up:

### In your `app/api/search/route.ts`:

```typescript
import { source } from "@/lib/source";
import { createFromSource } from "fumadocs-core/search/server";

export const { GET } = createFromSource(source);
```

This creates a `GET /api/search?query=...` endpoint that returns Orama search results.

## Step 3: Verify Endpoints

After deploying, verify the endpoints are accessible:

```bash
# Should return a markdown-formatted index
curl https://docs.yoursite.com/llms.txt

# Should return full documentation content
curl https://docs.yoursite.com/llms-full.txt

# Should return JSON search results (if enabled)
curl "https://docs.yoursite.com/api/search?query=getting+started"
```

## Step 4: Create Your MCP Server

```bash
npx -p @mcpframework/docs create-docs-mcp my-api-docs
cd my-api-docs
```

Edit `.env`:

```bash
DOCS_BASE_URL=https://docs.yoursite.com
DOCS_SERVER_NAME=my-api-docs
```

Build and test:

```bash
npm run build
npm start
```

## Expected llms.txt Format

The `source.llms().index()` method generates content in this format:

```markdown
# Project Name

> Project description

## Section Name

- [Page Title](https://docs.example.com/docs/page-slug): Page description

## Another Section

- [Another Page](https://docs.example.com/docs/another): Description
```

The parser expects:
- `#` for the project title (ignored)
- `>` for the project description (ignored)
- `##` for section headings
- `###` for subsection headings
- `- [Title](url): description` for page links

## Expected Search API Response

The Fumadocs Orama search endpoint returns JSON:

```json
[
  {
    "id": "/docs/page-slug",
    "url": "/docs/page-slug",
    "type": "page",
    "content": "matched text content...",
    "structured": {
      "heading": "Section Heading"
    }
  }
]
```

## Choosing a Source Adapter

| Your Setup | Recommended Adapter |
|------------|-------------------|
| Fumadocs with search API | `FumadocsRemoteSource` |
| Fumadocs without search API | `LlmsTxtSource` |
| Non-Fumadocs site with llms.txt | `LlmsTxtSource` |
| Custom documentation backend | [Custom Adapter](./custom-adapters.md) |

## Troubleshooting

### "No results found" for all searches

- Verify `llms-full.txt` is accessible and contains content
- If using `FumadocsRemoteSource`, check that `/api/search` returns valid JSON
- Check the `refreshInterval` — cached empty results won't refresh until TTL expires

### "Page not found" for valid pages

- Check that the slug matches what's in `llms.txt` URLs
- Verify `.mdx` endpoint is accessible: `curl https://docs.yoursite.com/docs/your-page.mdx`
- Try the full slug path (e.g., `docs/auth/api-keys` instead of just `api-keys`)

### Stale content

- Reduce `refreshInterval` for faster cache invalidation
- The default is 5 minutes — set to `60_000` (1 minute) for development
