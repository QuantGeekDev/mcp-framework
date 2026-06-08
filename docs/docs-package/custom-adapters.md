# Custom Source Adapters

If your documentation doesn't use Fumadocs or `llms.txt`, you can build a custom source adapter by implementing the `DocSource` interface.

## Implementing DocSource

```typescript
import {
  DocSource,
  DocPage,
  DocSearchResult,
  DocSection,
  DocSearchOptions,
} from "@mcpframework/docs";

class MyCustomSource implements DocSource {
  name = "my-custom-docs";

  async search(query: string, options?: DocSearchOptions): Promise<DocSearchResult[]> {
    const limit = options?.limit ?? 10;
    const section = options?.section;

    // Call your search backend
    const response = await fetch(`https://api.example.com/search?q=${query}`);
    const data = await response.json();

    return data.results.slice(0, limit).map((item: any) => ({
      slug: item.path,
      url: `https://docs.example.com/${item.path}`,
      title: item.title,
      snippet: item.excerpt,
      section: item.category,
      score: item.relevance,
    }));
  }

  async getPage(slug: string): Promise<DocPage | null> {
    try {
      const response = await fetch(`https://api.example.com/pages/${slug}`);
      if (!response.ok) return null;

      const data = await response.json();
      return {
        slug,
        url: `https://docs.example.com/${slug}`,
        title: data.title,
        content: data.markdown,
        section: data.category,
      };
    } catch {
      return null;
    }
  }

  async listSections(): Promise<DocSection[]> {
    const response = await fetch("https://api.example.com/sections");
    const data = await response.json();

    return data.map((s: any) => ({
      name: s.title,
      slug: s.id,
      url: `https://docs.example.com/${s.id}`,
      children: (s.subsections || []).map((sub: any) => ({
        name: sub.title,
        slug: sub.id,
        url: `https://docs.example.com/${s.id}/${sub.id}`,
        children: [],
        pageCount: sub.page_count,
      })),
      pageCount: s.page_count,
    }));
  }

  async getIndex(): Promise<string> {
    // Return llms.txt-formatted content, or empty string
    return "";
  }

  async getFullContent(): Promise<string> {
    // Return all docs concatenated, or empty string
    return "";
  }

  async healthCheck(): Promise<{ ok: boolean; message?: string }> {
    try {
      const response = await fetch("https://api.example.com/health");
      return { ok: response.ok };
    } catch (error) {
      return { ok: false, message: (error as Error).message };
    }
  }
}
```

## Using Your Custom Source

```typescript
import { DocsServer } from "@mcpframework/docs";

const source = new MyCustomSource();

const server = new DocsServer({
  source,
  name: "my-custom-docs",
  version: "1.0.0",
});

server.start();
```

## Extending LlmsTxtSource

If your site publishes `llms.txt` but also has a custom search API, extend `LlmsTxtSource` instead of implementing from scratch:

```typescript
import { LlmsTxtSource, DocSearchResult, DocSearchOptions } from "@mcpframework/docs";

class MyEnhancedSource extends LlmsTxtSource {
  override get name(): string {
    return `enhanced:${this.baseUrl}`;
  }

  override async search(
    query: string,
    options?: DocSearchOptions
  ): Promise<DocSearchResult[]> {
    try {
      // Try your custom search API first
      const response = await fetch(`${this.baseUrl}/api/my-search?q=${query}`);
      if (response.ok) {
        const data = await response.json();
        return this.mapResults(data);
      }
    } catch {
      // Fall back to local text search
    }

    return super.search(query, options);
  }

  private mapResults(data: any[]): DocSearchResult[] {
    return data.map((item, i) => ({
      slug: item.slug,
      url: item.url,
      title: item.title,
      snippet: item.excerpt || "",
      score: 1 - i / data.length,
    }));
  }
}
```

## Error Handling

Use the built-in error classes for consistency:

```typescript
import {
  DocSourceError,
  DocFetchError,
  DocParseError,
  DocNotFoundError,
} from "@mcpframework/docs";

class MySource implements DocSource {
  async getPage(slug: string): Promise<DocPage | null> {
    const response = await fetch(`https://api.example.com/pages/${slug}`);

    if (response.status === 404) {
      return null; // Not found — return null, don't throw
    }

    if (!response.ok) {
      throw new DocFetchError(
        `https://api.example.com/pages/${slug}`,
        response.status,
        response.statusText
      );
    }

    const data = await response.json();
    if (!data.markdown) {
      throw new DocParseError(`Page ${slug} has no markdown content`);
    }

    return { slug, url: data.url, title: data.title, content: data.markdown };
  }
  // ... other methods
}
```

The tools catch `DocSourceError` subclasses and return user-friendly messages instead of exposing stack traces to the MCP client.
