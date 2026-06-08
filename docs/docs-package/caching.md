# Caching

`@mcpframework/docs` includes a built-in caching layer that reduces HTTP requests to your documentation site. All source adapters use caching automatically.

## Default Cache

The default `MemoryCache` is an in-memory LRU (Least Recently Used) cache with TTL (Time-To-Live) expiry.

### What Gets Cached

| Content | Cache Key | Default TTL |
|---------|-----------|-------------|
| `llms.txt` content | `index:{baseUrl}` | `refreshInterval` |
| `llms-full.txt` content | `full:{baseUrl}` | `refreshInterval` |
| Individual page content | `page:{slug}` | `refreshInterval` |
| Search results | `search:{query}:{section}:{limit}` | `refreshInterval` |
| Parsed section tree | `sections:{baseUrl}` | `refreshInterval` |

### Configuration

```typescript
import { MemoryCache, LlmsTxtSource } from "@mcpframework/docs";

const cache = new MemoryCache({
  maxEntries: 200,       // Default: 100
  ttlMs: 600_000,        // Default: 300_000 (5 minutes)
});

const source = new LlmsTxtSource({
  baseUrl: "https://docs.example.com",
  cache,
});
```

The `refreshInterval` option on source adapters sets the TTL for the default cache. If you provide a custom cache, the `ttlMs` on the cache takes precedence.

## Cache Behavior

- **Lazy expiry** — Expired entries are cleaned on access, not via a background timer. This avoids interval leaks.
- **LRU eviction** — When `maxEntries` is reached, the oldest entry is evicted to make room for new ones.
- **Per-entry TTL** — Each `set()` call can override the default TTL.
- **Overwrite resets TTL** — Storing the same key again resets the expiry timer.

## Cache Interface

Implement this interface for custom backends (Redis, SQLite, etc.):

```typescript
interface Cache {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlMs?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  stats(): { hits: number; misses: number; size: number };
}
```

### Example: Redis Cache

```typescript
import { Cache, CacheStats } from "@mcpframework/docs";
import { createClient } from "redis";

class RedisCache implements Cache {
  private client;
  private defaultTtl: number;
  private _hits = 0;
  private _misses = 0;

  constructor(redisUrl: string, ttlMs = 300_000) {
    this.client = createClient({ url: redisUrl });
    this.defaultTtl = ttlMs;
  }

  async get<T>(key: string): Promise<T | null> {
    const value = await this.client.get(`docs:${key}`);
    if (!value) {
      this._misses++;
      return null;
    }
    this._hits++;
    return JSON.parse(value);
  }

  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    const ttl = Math.ceil((ttlMs ?? this.defaultTtl) / 1000);
    await this.client.set(`docs:${key}`, JSON.stringify(value), { EX: ttl });
  }

  async delete(key: string): Promise<void> {
    await this.client.del(`docs:${key}`);
  }

  async clear(): Promise<void> {
    // Careful: only clear docs: keys
    const keys = await this.client.keys("docs:*");
    if (keys.length > 0) await this.client.del(keys);
    this._hits = 0;
    this._misses = 0;
  }

  stats(): CacheStats {
    return { hits: this._hits, misses: this._misses, size: -1 };
  }
}
```

## Cache Invalidation

In v1, cache invalidation is **TTL-based only**. When the TTL expires, the next request triggers a fresh fetch. There is no webhook-based or push-based invalidation.

For near-real-time updates, set a shorter `refreshInterval`:

```typescript
const source = new FumadocsRemoteSource({
  baseUrl: "https://docs.example.com",
  refreshInterval: 60_000, // Re-fetch every minute
});
```

For less frequently changing docs, increase it:

```typescript
const source = new FumadocsRemoteSource({
  baseUrl: "https://docs.example.com",
  refreshInterval: 3_600_000, // Re-fetch every hour
});
```
