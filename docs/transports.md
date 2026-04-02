# Transports

Transports handle communication between MCP clients and your server. The framework supports three transport types.

## Transport Comparison

| Feature | STDIO | HTTP Stream | SSE (Deprecated) |
|---------|-------|-------------|-------------------|
| Protocol | Standard I/O streams | HTTP/SSE | HTTP/SSE |
| Connection | Direct process | Network-based | Network-based |
| Authentication | N/A | JWT, API Key, OAuth | JWT, API Key |
| Session Management | N/A | Built-in | Limited |
| Resumability | N/A | Supported | No |
| Use Case | CLI tools, local | Web apps, distributed | Legacy systems |
| Configuration | Minimal | Highly configurable | Configurable |
| Scalability | Single process | Multiple clients | Multiple clients |
| MCP Spec | Compliant | 2025-03-26 | Legacy (2024-11-05) |

## STDIO Transport

The default transport using standard input/output streams. Best for CLI tools and local integrations.

```typescript
const server = new MCPServer();
// or explicitly:
const server = new MCPServer({
  transport: { type: "stdio" }
});
```

**When to use:**
- Building CLI tools
- Direct process communication
- Local integrations (e.g., Claude Desktop)

## HTTP Stream Transport

Network-based transport implementing the MCP 2025-03-26 specification. Recommended for web applications.

```typescript
const server = new MCPServer({
  transport: {
    type: "http-stream",
    options: {
      port: 8080,
      endpoint: "/mcp",
      responseMode: "batch",
      cors: {
        allowOrigin: "*"
      },
      auth: {
        // Optional authentication configuration
      }
    }
  }
});
```

**When to use:**
- Web applications
- Distributed systems
- When you need authentication or session management
- Multi-client scenarios

### Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `port` | `8080` | Server port |
| `endpoint` | `"/mcp"` | MCP endpoint path |
| `responseMode` | `"batch"` | `"batch"` or `"stream"` |
| `cors` | - | CORS configuration |
| `auth` | - | Authentication provider |
| `session` | - | Session management settings |
| `resumability` | - | Stream resumability settings |
| `health` | `{ enabled: true, path: "/health" }` | Health endpoint configuration |

## SSE Transport (Deprecated)

> **Deprecated:** Use HTTP Stream Transport instead for new projects.

Legacy Server-Sent Events transport:

```typescript
const server = new MCPServer({
  transport: {
    type: "sse",
    options: {
      port: 8080,
      endpoint: "/sse",
      messageEndpoint: "/messages",
      auth: {
        // Optional authentication configuration
      }
    }
  }
});
```

## Health Endpoint

Both HTTP Stream and SSE transports include a built-in health endpoint, **enabled by default** at `/health`. This is useful for Kubernetes liveness/readiness probes, load balancer health checks, and uptime monitoring.

```
GET /health → 200 { "ok": true }
```

No authentication is required on the health endpoint.

### Custom Path and Response

```typescript
const server = new MCPServer({
  transport: {
    type: "http-stream",
    options: {
      health: {
        path: "/healthz",
        response: { success: true, data: "ok" }
      }
    }
  }
});
// GET /healthz → { "success": true, "data": "ok" }
```

### Disable Health Endpoint

```typescript
health: { enabled: false }
```

### Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `enabled` | `true` | Whether the health endpoint is active |
| `path` | `"/health"` | URL path for the endpoint |
| `response` | `{ ok: true }` | Custom JSON response body |

## Choosing a Transport

- **STDIO** - Default choice for CLI tools and local integrations with Claude Desktop
- **HTTP Stream** - Recommended for any web-based or networked deployment
- **SSE** - Only for legacy systems that already use it

## Next Steps

- [Server Configuration](./server-configuration.md) - Full configuration reference
- [Authentication](./authentication.md) - Secure your HTTP endpoints
- [HTTP Quickstart](./http-quickstart.md) - Get started with HTTP Stream
