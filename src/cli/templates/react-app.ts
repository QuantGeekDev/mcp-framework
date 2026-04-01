/**
 * Shared React template generators for MCP Apps.
 * Used by both `mcp add app --react` and `mcp add tool --react`.
 */

/** HTML shell that Vite uses as the entry point. */
export function generateReactHtmlShell(appName: string): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${appName}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./App.tsx"></script>
  </body>
</html>
`;
}

/** Main React component with useApp() wired up. */
export function generateReactApp(appName: string, className: string): string {
  return `import type { App as McpApp, McpUiHostContext } from "@modelcontextprotocol/ext-apps";
import { useApp } from "@modelcontextprotocol/ext-apps/react";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

function ${className}() {
  const [toolInput, setToolInput] = useState<Record<string, unknown> | null>(null);
  const [toolResult, setToolResult] = useState<CallToolResult | null>(null);
  const [hostContext, setHostContext] = useState<McpUiHostContext | undefined>();

  const { app, error } = useApp({
    appInfo: { name: "${appName}", version: "1.0.0" },
    capabilities: {},
    onAppCreated: (app: McpApp) => {
      app.ontoolinput = (params) => {
        setToolInput(params.arguments ?? null);
      };
      app.ontoolresult = (result) => {
        setToolResult(result);
      };
      app.ontoolcancelled = (params) => {
        console.info("Tool cancelled:", params.reason);
      };
      app.onhostcontextchanged = (params) => {
        setHostContext((prev) => ({ ...prev, ...params }));
      };
    },
  });

  useEffect(() => {
    if (app) {
      setHostContext(app.getHostContext());
    }
  }, [app]);

  // Apply host theme
  useEffect(() => {
    const vars = hostContext?.styles?.variables;
    if (vars) {
      for (const [key, value] of Object.entries(vars)) {
        if (value) document.documentElement.style.setProperty(key, String(value));
      }
    }
    if (hostContext?.theme) {
      document.documentElement.setAttribute("data-theme", hostContext.theme);
      document.documentElement.style.colorScheme = hostContext.theme;
    }
  }, [hostContext]);

  if (error) {
    return <div className="error">Error: {error.message}</div>;
  }
  if (!app) {
    return <div className="loading">Connecting...</div>;
  }

  const resultText = toolResult?.content?.find((c) => c.type === "text");

  return (
    <div className="container">
      <h2>${className}</h2>

      {toolInput && (
        <section>
          <h3>Input</h3>
          <pre>{JSON.stringify(toolInput, null, 2)}</pre>
        </section>
      )}

      {resultText && (
        <section>
          <h3>Result</h3>
          <pre>{(resultText as { text: string }).text}</pre>
        </section>
      )}

      {!toolInput && !toolResult && (
        <p>Waiting for tool execution...</p>
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <${className} />
  </StrictMode>
);
`;
}

/** Default CSS with host variable fallbacks. */
export function generateReactStyles(): string {
  return `:root {
  /* Host theme fallbacks — overridden by host-provided variables */
  --color-background-primary: light-dark(#ffffff, #1a1a1a);
  --color-background-secondary: light-dark(#f5f5f5, #262626);
  --color-text-primary: light-dark(#1a1a1a, #fafafa);
  --color-text-secondary: light-dark(#525252, #a3a3a3);
  --color-border-primary: light-dark(#e5e5e5, #404040);
  --font-sans: system-ui, -apple-system, sans-serif;
  --font-mono: ui-monospace, "Cascadia Code", "Fira Code", monospace;
  --border-radius-md: 8px;
  --border-radius-sm: 4px;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: var(--font-sans);
  background: var(--color-background-primary);
  color: var(--color-text-primary);
  padding: 16px;
  line-height: 1.5;
}

.container {
  max-width: 600px;
  margin: 0 auto;
}

h2 {
  margin-bottom: 16px;
  font-size: 1.25rem;
}

h3 {
  font-size: 0.875rem;
  color: var(--color-text-secondary);
  margin-bottom: 8px;
}

section {
  margin-bottom: 16px;
  padding: 12px;
  background: var(--color-background-secondary);
  border: 1px solid var(--color-border-primary);
  border-radius: var(--border-radius-md);
}

pre {
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.loading, .error {
  padding: 24px;
  text-align: center;
}

.error {
  color: #ef4444;
}

button {
  font-family: var(--font-sans);
  font-size: 0.8125rem;
  padding: 6px 12px;
  border-radius: var(--border-radius-sm);
  border: 1px solid var(--color-border-primary);
  background: var(--color-background-secondary);
  color: var(--color-text-primary);
  cursor: pointer;
}

button:hover {
  opacity: 0.8;
}
`;
}

/** Vite config for bundling React into a single HTML file. */
export function generateViteConfig(): string {
  return `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: "dist",
    emptyOutDir: false,
    cssMinify: true,
    minify: true,
  },
});
`;
}

/** TypeScript config for the client-side React code. */
export function generateTsconfigApp(): string {
  return `{
  "compilerOptions": {
    "target": "ESNext",
    "lib": ["ESNext", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["."]
}
`;
}

/** List of npm packages to install for React app views. */
export const REACT_DEPENDENCIES = [
  '@modelcontextprotocol/ext-apps',
  '@modelcontextprotocol/sdk',
  'react',
  'react-dom',
];

export const REACT_DEV_DEPENDENCIES = [
  '@types/react',
  '@types/react-dom',
  '@vitejs/plugin-react',
  'vite',
  'vite-plugin-singlefile',
];

/** Console instructions for installing React deps. */
export function getReactInstallInstructions(): string {
  return `
  To install React dependencies, run:
    npm install ${REACT_DEPENDENCIES.join(' ')}
    npm install -D ${REACT_DEV_DEPENDENCIES.join(' ')}

  To build the app view:
    cd src/app-views/<name> && npx vite build

  Or add to your package.json scripts:
    "build:views": "cd src/app-views/<name> && npx vite build"
    "build": "npm run build:views && tsc"`;
}
