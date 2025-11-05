import { spawnSync } from 'child_process';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import prompts from 'prompts';
import { generateReadme } from '../templates/readme.js';
import { execa } from 'execa';

export async function createProject(
  name?: string,
  options?: { http?: boolean; cors?: boolean; port?: number; oauth?: boolean; install?: boolean; example?: boolean }
) {
  let projectName: string;
  // Default install and example to true if not specified
  const shouldInstall = options?.install !== false;
  const shouldCreateExample = options?.example !== false;

  // Validate OAuth requires HTTP
  if (options?.oauth && !options?.http) {
    console.error('❌ Error: --oauth requires --http flag');
    console.error('   OAuth authentication is only available with HTTP transports (SSE or HTTP Stream)');
    console.error('   Use: mcp create <name> --http --oauth');
    process.exit(1);
  }

  if (!name) {
    const response = await prompts([
      {
        type: 'text',
        name: 'projectName',
        message: 'What is the name of your MCP server project?',
        validate: (value: string) =>
          /^[a-z0-9-]+$/.test(value)
            ? true
            : 'Project name can only contain lowercase letters, numbers, and hyphens',
      },
    ]);

    if (!response.projectName) {
      console.log('Project creation cancelled');
      process.exit(1);
    }

    projectName = response.projectName as string;
  } else {
    projectName = name;
  }

  if (!projectName) {
    throw new Error('Project name is required');
  }

  const projectDir = join(process.cwd(), projectName);
  const srcDir = join(projectDir, 'src');
  const toolsDir = join(srcDir, 'tools');

  try {
    console.log('Creating project structure...');
    await mkdir(projectDir);
    await mkdir(srcDir);
    await mkdir(toolsDir);

    const packageJson = {
      name: projectName,
      version: '0.0.1',
      description: `${projectName} MCP server`,
      type: 'module',
      bin: {
        [projectName]: './dist/index.js',
      },
      files: ['dist'],
      scripts: {
        build: 'tsc && mcp-build',
        watch: 'tsc --watch',
        start: 'node dist/index.js',
      },
      dependencies: {
        'mcp-framework': '^0.2.2',
        ...(options?.oauth && { dotenv: '^16.3.1' }),
      },
      devDependencies: {
        '@types/node': '^20.11.24',
        typescript: '^5.3.3',
      },
      engines: {
        node: '>=18.19.0',
      },
    };

    const tsconfig = {
      compilerOptions: {
        target: 'ESNext',
        module: 'ESNext',
        moduleResolution: 'node',
        outDir: './dist',
        rootDir: './src',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
      },
      include: ['src/**/*'],
      exclude: ['node_modules'],
    };

    const gitignore = `node_modules
dist
.env
logs
.DS_Store
.idea
.vscode
`;
    let indexTs = '';

    if (options?.http) {
      const port = options.port || 8080;

      if (options?.oauth) {
        // OAuth configuration
        indexTs = `import { MCPServer, OAuthAuthProvider } from "mcp-framework";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Validate required OAuth environment variables
const requiredEnvs = [
  'OAUTH_AUTHORIZATION_SERVER',
  'OAUTH_RESOURCE',
  'OAUTH_AUDIENCE',
  'OAUTH_ISSUER',
  'OAUTH_JWKS_URI',
];

for (const env of requiredEnvs) {
  if (!process.env[env]) {
    console.error(\`❌ Missing required environment variable: \${env}\`);
    console.error('Please copy .env.example to .env and configure your OAuth provider');
    process.exit(1);
  }
}

// Create OAuth provider with JWT validation
const oauthProvider = new OAuthAuthProvider({
  authorizationServers: [process.env.OAUTH_AUTHORIZATION_SERVER!],
  resource: process.env.OAUTH_RESOURCE!,
  validation: {
    type: 'jwt',
    jwksUri: process.env.OAUTH_JWKS_URI!,
    audience: process.env.OAUTH_AUDIENCE!,
    issuer: process.env.OAUTH_ISSUER!,
  }
});

const server = new MCPServer({
  transport: {
    type: "http-stream",
    options: {
      port: ${port},
      auth: {
        provider: oauthProvider,
        endpoints: {
          initialize: true,  // Require auth for session initialization
          messages: true     // Require auth for MCP messages
        }
      }${options.cors ? `,
      cors: {
        allowOrigin: "*"
      }` : ''}
    }
  }
});

await server.start();
console.log('🔐 MCP Server with OAuth 2.1 running on http://localhost:${port}');
console.log('📋 OAuth Metadata: http://localhost:${port}/.well-known/oauth-protected-resource');`;
      } else {
        // Regular HTTP configuration without OAuth
        let transportConfig = `\n  transport: {
    type: "http-stream",
    options: {
      port: ${port}`;

        if (options.cors) {
          transportConfig += `,
      cors: {
        allowOrigin: "*"
      }`;
        }

        transportConfig += `
    }
  }`;

        indexTs = `import { MCPServer } from "mcp-framework";

const server = new MCPServer({${transportConfig}});

server.start();`;
      }
    } else {
      indexTs = `import { MCPServer } from "mcp-framework";

const server = new MCPServer();

server.start();`;
    }

    // Generate example tool (OAuth-aware if OAuth is enabled)
    const exampleToolTs = options?.oauth
      ? `import { MCPTool } from "mcp-framework";
import { z } from "zod";

interface ExampleInput {
  message: string;
}

class ExampleTool extends MCPTool<ExampleInput> {
  name = "example_tool";
  description = "An example authenticated tool that processes messages";

  schema = {
    message: {
      type: z.string(),
      description: "Message to process",
    },
  };

  async execute(input: ExampleInput, context?: any) {
    // Access authentication claims from OAuth token
    const claims = context?.auth?.data;
    const userId = claims?.sub || 'unknown';
    const scope = claims?.scope || 'N/A';

    return \`Processed: \${input.message}
Authenticated as: \${userId}
Token scope: \${scope}\`;
  }
}

export default ExampleTool;`
      : `import { MCPTool } from "mcp-framework";
import { z } from "zod";

interface ExampleInput {
  message: string;
}

class ExampleTool extends MCPTool<ExampleInput> {
  name = "example_tool";
  description = "An example tool that processes messages";

  schema = {
    message: {
      type: z.string(),
      description: "Message to process",
    },
  };

  async execute(input: ExampleInput) {
    return \`Processed: \${input.message}\`;
  }
}

export default ExampleTool;`;

    // Generate .env.example for OAuth projects
    const envExample = `# OAuth 2.1 Configuration
# See docs/OAUTH.md for detailed setup instructions

# Server Configuration
PORT=${options?.port || 8080}

# OAuth Configuration - JWT Validation (Recommended)
OAUTH_AUTHORIZATION_SERVER=https://auth.example.com
OAUTH_RESOURCE=https://mcp.example.com
OAUTH_JWKS_URI=https://auth.example.com/.well-known/jwks.json
OAUTH_AUDIENCE=https://mcp.example.com
OAUTH_ISSUER=https://auth.example.com

# Popular Provider Examples:

# --- Auth0 ---
# OAUTH_AUTHORIZATION_SERVER=https://your-tenant.auth0.com
# OAUTH_JWKS_URI=https://your-tenant.auth0.com/.well-known/jwks.json
# OAUTH_AUDIENCE=https://mcp.example.com
# OAUTH_ISSUER=https://your-tenant.auth0.com/
# OAUTH_RESOURCE=https://mcp.example.com

# --- Okta ---
# OAUTH_AUTHORIZATION_SERVER=https://your-domain.okta.com/oauth2/default
# OAUTH_JWKS_URI=https://your-domain.okta.com/oauth2/default/v1/keys
# OAUTH_AUDIENCE=api://mcp-server
# OAUTH_ISSUER=https://your-domain.okta.com/oauth2/default
# OAUTH_RESOURCE=api://mcp-server

# --- AWS Cognito ---
# OAUTH_AUTHORIZATION_SERVER=https://cognito-idp.REGION.amazonaws.com/POOL_ID
# OAUTH_JWKS_URI=https://cognito-idp.REGION.amazonaws.com/POOL_ID/.well-known/jwks.json
# OAUTH_AUDIENCE=YOUR_APP_CLIENT_ID
# OAUTH_ISSUER=https://cognito-idp.REGION.amazonaws.com/POOL_ID
# OAUTH_RESOURCE=YOUR_APP_CLIENT_ID

# Logging (Optional)
# MCP_ENABLE_FILE_LOGGING=true
# MCP_LOG_DIRECTORY=logs
# MCP_DEBUG_CONSOLE=true
`;

    const filesToWrite = [
      writeFile(join(projectDir, 'package.json'), JSON.stringify(packageJson, null, 2)),
      writeFile(join(projectDir, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2)),
      writeFile(join(projectDir, 'README.md'), generateReadme(projectName)),
      writeFile(join(srcDir, 'index.ts'), indexTs),
      writeFile(join(projectDir, '.gitignore'), gitignore),
    ];

    // Add .env.example for OAuth projects
    if (options?.oauth) {
      filesToWrite.push(writeFile(join(projectDir, '.env.example'), envExample));
    }

    if (shouldCreateExample) {
      filesToWrite.push(writeFile(join(toolsDir, 'ExampleTool.ts'), exampleToolTs));
    }

    console.log('Creating project files...');
    await Promise.all(filesToWrite);

    process.chdir(projectDir);

    console.log('Initializing git repository...');
    const gitInit = spawnSync('git', ['init'], {
      stdio: 'inherit',
      shell: true,
    });

    if (gitInit.status !== 0) {
      throw new Error('Failed to initialize git repository');
    }

    if (shouldInstall) {
      console.log('Installing dependencies...');
      const npmInstall = spawnSync('npm', ['install'], {
        stdio: 'inherit',
        shell: true,
      });

      if (npmInstall.status !== 0) {
        throw new Error('Failed to install dependencies');
      }

      console.log('Building project...');
      const tscBuild = await execa('npx', ['tsc'], {
        cwd: projectDir,
        stdio: 'inherit',
      });

      if (tscBuild.exitCode !== 0) {
        throw new Error('Failed to build TypeScript');
      }

      const mcpBuild = await execa('npx', ['mcp-build'], {
        cwd: projectDir,
        stdio: 'inherit',
        env: {
          ...process.env,
          MCP_SKIP_VALIDATION: 'true',
        },
      });

      if (mcpBuild.exitCode !== 0) {
        throw new Error('Failed to run mcp-build');
      }

      if (options?.oauth) {
        console.log(`
✅ Project ${projectName} created and built successfully with OAuth 2.1!

🔐 OAuth Setup Required:
1. cd ${projectName}
2. Copy .env.example to .env
3. Configure your OAuth provider settings in .env
4. See docs/OAUTH.md for provider-specific setup guides

📖 OAuth Resources:
   - Framework docs: https://github.com/QuantGeekDev/mcp-framework/blob/main/docs/OAUTH.md
   - Metadata endpoint: http://localhost:${options.port || 8080}/.well-known/oauth-protected-resource

🛠️  Add more tools:
   mcp add tool <tool-name>
    `);
      } else {
        console.log(`
Project ${projectName} created and built successfully!

You can now:
1. cd ${projectName}
2. Add more tools using:
   mcp add tool <n>
    `);
      }
    } else {
      if (options?.oauth) {
        console.log(`
✅ Project ${projectName} created successfully with OAuth 2.1 (without dependencies)!

Next steps:
1. cd ${projectName}
2. Copy .env.example to .env
3. Configure your OAuth provider settings in .env
4. Run 'npm install' to install dependencies
5. Run 'npm run build' to build the project
6. See docs/OAUTH.md for OAuth setup guides

🛠️  Add more tools:
   mcp add tool <tool-name>
    `);
      } else {
        console.log(`
Project ${projectName} created successfully (without dependencies)!

You can now:
1. cd ${projectName}
2. Run 'npm install' to install dependencies
3. Run 'npm run build' to build the project
4. Add more tools using:
   mcp add tool <n>
    `);
      }
    }
  } catch (error) {
    console.error('Error creating project:', error);
    process.exit(1);
  }
}
