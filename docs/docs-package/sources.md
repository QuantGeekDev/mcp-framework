# Source Adapters

Source adapters are the central abstraction in `@mcpframework/docs`. Every documentation backend implements the `DocSource` interface, and all tools interact through it — never touching HTTP or filesystem directly.

## DocSource Interface

```typescript
interface DocSource {
  name: string;
  search(query: string, options?: DocSearchOptions): Promise<DocSearchResult[]>;
  getPage(slug: string): Promise<DocPage | null>;
  listSections(): Promise<DocSection[]>;
  getIndex(): Promise<string>;
  getFullContent(): Promise<string>;
  healthCheck(): Promise<{ ok: boolean; message?: string }>;
}
```

## FumadocsRemoteSource

Purpose-built for [Fumadocs](https://fumadocs.vercel.app/) sites. Leverages the native Orama search API for high-quality search results, with automatic fallback to local text search when the API is unavailable.

### Configuration

```typescript
import { FumadocsRemoteSource } from "@mcpframework/docs";

const source = new FumadocsRemoteSource({
  baseUrl: "https://docs.myapi.com",       // Required
  searchEndpoint: "/api/search",            // Default: "/api/search"
  llmsTxtPath: "/llms.txt",                // Default: "/llms.txt"
  llmsFullTxtPath: "/llms-full.txt",       // Default: "/llms-full.txt"
  mdxPathPrefix: "/",                       // Default: "/"
  refreshInterval: 300_000,                // Default: 5 minutes
  headers: {                                // Optional
    Authorization: "Bearer your-token",
  },
});
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `baseUrl` | `string` | *required* | Base URL of your Fumadocs site |
| `searchEndpoint` | `string` | `"/api/search"` | Fumadocs Orama search API path |
| `llmsTxtPath` | `string` | `"/llms.txt"` | Path to the llms.txt index file |
| `llmsFullTxtPath` | `string` | `"/llms-full.txt"` | Path to the full content file |
| `mdxPathPrefix` | `string` | `"/"` | Prefix for individual .mdx page URLs |
| `refreshInterval` | `number` | `300000` | Cache TTL in milliseconds |
| `headers` | `Record<string, string>` | `undefined` | Custom HTTP headers for all requests |
| `cache` | `Cache` | `MemoryCache` | Custom cache implementation |

### How It Works

- **`search()`** — Hits `{baseUrl}/api/search?query=...` (Fumadocs Orama endpoint) and maps the response to `DocSearchResult[]`. On API failure, falls back to local text search against `llms-full.txt`.
- **`getPage(slug)`** — Fetches `{baseUrl}/{slug}.mdx`. Falls back to extracting from `llms-full.txt`.
- **`listSections()`** — Parses `llms.txt` into a structured `DocSection[]` tree.
- **`getIndex()`** — Returns raw `llms.txt` content.
- **`getFullContent()`** — Returns raw `llms-full.txt` content.

## LlmsTxtSource

Works with **any** documentation site that publishes `llms.txt` and `llms-full.txt` — including Fumadocs, Docusaurus (with plugin), or custom sites.

Search is performed locally by splitting `llms-full.txt` into page blocks and scoring by query term frequency.

### Configuration

```typescript
import { LlmsTxtSource } from "@mcpframework/docs";

const source = new LlmsTxtSource({
  baseUrl: "https://docs.myapi.com",
  llmsTxtPath: "/llms.txt",
  llmsFullTxtPath: "/llms-full.txt",
  mdxPathPrefix: "/docs/",
  refreshInterval: 300_000,
  headers: {
    "X-API-Key": "your-key",
  },
});
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `baseUrl` | `string` | *required* | Base URL of your docs site |
| `llmsTxtPath` | `string` | `"/llms.txt"` | Path to llms.txt |
| `llmsFullTxtPath` | `string` | `"/llms-full.txt"` | Path to llms-full.txt |
| `mdxPathPrefix` | `string` | `"/"` | Prefix for .mdx page fetching |
| `refreshInterval` | `number` | `300000` | Cache TTL in milliseconds |
| `headers` | `Record<string, string>` | `undefined` | Custom HTTP headers |
| `cache` | `Cache` | `MemoryCache` | Custom cache implementation |

### Search Algorithm

The local search works as follows:

1. Fetch and cache `llms-full.txt`
2. Split content into page blocks using `# Title (url)` headers
3. For each block, count query term occurrences (title matches weighted 3x)
4. Normalize scores to 0–1 range
5. Return top N results sorted by score, with snippet extraction

## Core Types

### DocPage

```typescript
interface DocPage {
  slug: string;          // URL-friendly identifier
  url: string;           // Full URL to the page
  title: string;         // Page title
  description?: string;  // Brief description
  content: string;       // Full markdown body
  section?: string;      // Parent section name
  lastModified?: string; // ISO 8601 date
}
```

### DocSearchResult

```typescript
interface DocSearchResult {
  slug: string;          // URL-friendly identifier
  url: string;           // Full URL to the page
  title: string;         // Page title
  description?: string;  // Brief description
  snippet: string;       // Matched excerpt (max 200 chars)
  section?: string;      // Parent section name
  score: number;         // Relevance score 0–1
}
```

### DocSection

```typescript
interface DocSection {
  name: string;          // Display name
  slug: string;          // URL-friendly identifier
  url: string;           // Full URL
  children: DocSection[];// Nested subsections
  pageCount: number;     // Pages in this section (not counting children)
}
```
