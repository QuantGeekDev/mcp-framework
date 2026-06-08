# Documentation Tools

`@mcpframework/docs` provides three MCP tools that extend `MCPTool` from mcp-framework. Each tool uses Zod schemas with mandatory `.describe()` on all fields.

## search_docs

Search documentation by keyword or phrase. Returns a ranked list of matching pages with relevant excerpts.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | `string` | yes | Search keywords or phrase |
| `section` | `string` | no | Filter results to a specific section |
| `limit` | `number` | no | Max results (default 10, max 25) |

### Example Output

```
1. **API Keys**
   https://docs.myapi.com/docs/auth/api-keys
   API keys are the simplest way to authenticate with MyAPI. Each key is scoped to a specific project.
   Section: Authentication

2. **OAuth 2.0**
   https://docs.myapi.com/docs/auth/oauth
   OAuth 2.0 is recommended for applications that act on behalf of users.
   Section: Authentication
```

### Token Budget

Results are truncated to stay under approximately **4,000 tokens** (~16,000 characters). Each result includes title, URL, and a snippet (max 200 characters). If the total exceeds the budget, trailing results are dropped with a count of omitted results.

### Behavior

- Returns `"No results found..."` when no matches
- On source errors, returns a user-friendly error message (not a stack trace)
- Validates input: rejects missing `query`, rejects `limit > 25` or `limit < 1`

## get_page

Retrieve the full markdown content of a documentation page by its slug or URL path.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `slug` | `string` | yes | Page slug or URL path |

### Example Output

```markdown
# Getting Started
https://docs.myapi.com/getting-started

Get started with MyAPI in just a few steps:

\`\`\`typescript
import { MyAPI } from 'myapi-sdk';
const client = new MyAPI({ apiKey: 'your-api-key' });
\`\`\`
```

### Slug Normalization

The tool automatically normalizes slugs before fetching:

| Input | Normalized |
|-------|-----------|
| `/getting-started` | `getting-started` |
| `getting-started/` | `getting-started` |
| `/docs/getting-started` | `getting-started` |
| `docs/auth/api-keys` | `auth/api-keys` |

### Token Budget

Page content is truncated at approximately **8,000 tokens** (~32,000 characters). If truncated, a notice is appended:

```
[Content truncated. Use search_docs with a more specific query to find relevant sections.]
```

### Behavior

- Returns `"Page not found..."` when the slug doesn't match any page
- On source errors, returns a user-friendly error message

## list_sections

Browse the documentation tree structure. Useful for discovering what documentation is available before searching.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `section` | `string` | no | Filter to a specific section's children |

### Example Output (all sections)

```
- **Getting Started** (3 pages) [getting-started]
- **Authentication** (1 pages) [authentication]
  - **OAuth** (2 pages) [oauth]
- **API Reference** (5 pages) [api-reference]
```

### Example Output (filtered)

With `section: "Authentication"`:

```
- **Authentication** (1 pages) [authentication]
  - **OAuth** (2 pages) [oauth]
```

### Behavior

- Returns `"No sections found..."` when the source has no sections
- When filtering by section name, returns `"Section not found..."` with a list of available sections
- Section matching is case-insensitive and matches both name and slug

## Using Tools Directly

You can use the tool classes directly without DocsServer:

```typescript
import { SearchDocsTool, GetPageTool, ListSectionsTool } from "@mcpframework/docs";
import { LlmsTxtSource } from "@mcpframework/docs/sources";

const source = new LlmsTxtSource({ baseUrl: "https://docs.example.com" });

const searchTool = new SearchDocsTool(source);
const getPageTool = new GetPageTool(source);
const listTool = new ListSectionsTool(source);

// Call directly (bypassing MCP protocol)
const result = await searchTool.toolCall({
  params: { name: "search_docs", arguments: { query: "authentication" } },
});
```
