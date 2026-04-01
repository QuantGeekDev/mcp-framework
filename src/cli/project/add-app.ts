import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import prompts from 'prompts';
import { validateMCPProject } from '../utils/validate-project.js';
import { toPascalCase } from '../utils/string-utils.js';
import {
  generateReactHtmlShell,
  generateReactApp,
  generateReactStyles,
  generateViteConfig,
  generateTsconfigApp,
  getReactInstallInstructions,
} from '../templates/react-app.js';

export async function addApp(name?: string, options?: { react?: boolean }) {
  await validateMCPProject();

  let appName = name;
  if (!appName) {
    const response = await prompts([
      {
        type: 'text',
        name: 'name',
        message: 'What is the name of your app?',
        validate: (value: string) =>
          /^[a-z0-9-]+$/.test(value)
            ? true
            : 'App name can only contain lowercase letters, numbers, and hyphens',
      },
    ]);

    if (!response.name) {
      console.log('App creation cancelled');
      process.exit(1);
    }

    appName = response.name;
  }

  if (!appName) {
    throw new Error('App name is required');
  }

  const useReact = options?.react ?? false;
  const className = toPascalCase(appName);
  const fileName = `${className}App.ts`;
  const appsDir = join(process.cwd(), 'src/apps');
  const viewsDir = join(process.cwd(), 'src/app-views', appName);

  try {
    await mkdir(appsDir, { recursive: true });
    await mkdir(viewsDir, { recursive: true });

    if (useReact) {
      await writeFile(join(appsDir, fileName), generateReactAppClass(appName, className));
      await writeFile(join(viewsDir, 'index.html'), generateReactHtmlShell(appName));
      await writeFile(join(viewsDir, 'App.tsx'), generateReactApp(appName, className));
      await writeFile(join(viewsDir, 'styles.css'), generateReactStyles());
      await writeFile(join(viewsDir, 'vite.config.ts'), generateViteConfig());
      await writeFile(join(viewsDir, 'tsconfig.json'), generateTsconfigApp());

      console.log(`React app ${appName} created successfully:`);
      console.log(`  - App class:    src/apps/${fileName}`);
      console.log(`  - React entry:  src/app-views/${appName}/App.tsx`);
      console.log(`  - Styles:       src/app-views/${appName}/styles.css`);
      console.log(`  - Vite config:  src/app-views/${appName}/vite.config.ts`);
      console.log(getReactInstallInstructions().replace(/<name>/g, appName));
    } else {
      await writeFile(join(appsDir, fileName), generateVanillaAppClass(appName, className));
      await writeFile(join(viewsDir, 'index.html'), generateVanillaHtmlView(appName, className));

      console.log(`App ${appName} created successfully:`);
      console.log(`  - App class: src/apps/${fileName}`);
      console.log(`  - HTML view: src/app-views/${appName}/index.html`);
    }
  } catch (error) {
    console.error('Error creating app:', error);
    process.exit(1);
  }
}

// ── React App Class (Mode A) ──────────────────────────────────────────────────

function generateReactAppClass(appName: string, className: string): string {
  return `import { MCPApp } from "mcp-framework";
import { z } from "zod";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

class ${className}App extends MCPApp {
  name = "${appName}";

  ui = {
    resourceUri: "ui://${appName}/view",
    resourceName: "${className}",
    resourceDescription: "${className} interactive view",
  };

  getContent() {
    // Reads the Vite-bundled single HTML file
    return readFileSync(
      join(__dirname, "../../app-views/${appName}/dist/index.html"),
      "utf-8"
    );
  }

  tools = [
    {
      name: "${appName}_show",
      description: "Display the ${className} view",
      schema: z.object({
        query: z.string().describe("Input query"),
      }),
      execute: async (input: { query: string }) => {
        return { result: \`Processed: \${input.query}\` };
      },
    },
  ];
}

export default ${className}App;
`;
}

// ── Vanilla Templates (unchanged) ─────────────────────────────────────────────

function generateVanillaAppClass(appName: string, className: string): string {
  return `import { MCPApp } from "mcp-framework";
import { z } from "zod";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

class ${className}App extends MCPApp {
  name = "${appName}";

  ui = {
    resourceUri: "ui://${appName}/view",
    resourceName: "${className}",
    resourceDescription: "${className} interactive view",
  };

  getContent() {
    return readFileSync(
      join(__dirname, "../../app-views/${appName}/index.html"),
      "utf-8"
    );
  }

  tools = [
    {
      name: "${appName}_show",
      description: "Display the ${className} view",
      schema: z.object({
        query: z.string().describe("Input query"),
      }),
      execute: async (input: { query: string }) => {
        return { result: \`Processed: \${input.query}\` };
      },
    },
  ];
}

export default ${className}App;
`;
}

function generateVanillaHtmlView(appName: string, className: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${className}</title>
  <style>
    :root {
      --color-background-primary: light-dark(#ffffff, #1a1a1a);
      --color-text-primary: light-dark(#1a1a1a, #fafafa);
      --font-sans: system-ui, sans-serif;
    }
    body {
      margin: 0; padding: 16px;
      background: var(--color-background-primary);
      color: var(--color-text-primary);
      font-family: var(--font-sans);
    }
    #app { max-width: 600px; margin: 0 auto; }
  </style>
</head>
<body>
  <div id="app">Loading...</div>
  <script type="module">
    let nextId = 1;
    function sendRequest(method, params) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        function listener(event) {
          if (event.data?.id === id) {
            window.removeEventListener("message", listener);
            event.data?.result ? resolve(event.data.result) : reject(event.data?.error);
          }
        }
        window.addEventListener("message", listener);
        window.parent.postMessage({ jsonrpc: "2.0", id, method, params }, "*");
      });
    }
    function onNotification(method, handler) {
      window.addEventListener("message", (event) => {
        if (event.data?.method === method) handler(event.data.params);
      });
    }

    const init = await sendRequest("initialize", {
      capabilities: {},
      clientInfo: { name: "${appName}", version: "1.0.0" },
      protocolVersion: "2026-01-26",
    });

    const vars = init.hostContext?.styles?.variables;
    if (vars) {
      for (const [key, value] of Object.entries(vars)) {
        if (value) document.documentElement.style.setProperty(key, value);
      }
    }

    onNotification("ui/notifications/tool-input", (params) => {
      document.getElementById("app").innerHTML =
        "<h2>${className}</h2><pre>" +
        JSON.stringify(params.arguments, null, 2) +
        "</pre>";
    });

    onNotification("ui/notifications/tool-result", (params) => {
      const text = params.content?.[0]?.text ?? JSON.stringify(params);
      document.getElementById("app").innerHTML =
        "<h2>Result</h2><pre>" + text + "</pre>";
    });

    window.parent.postMessage({
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {}
    }, "*");
  </script>
</body>
</html>
`;
}
