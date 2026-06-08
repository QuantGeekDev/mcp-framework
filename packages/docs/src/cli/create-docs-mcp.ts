#!/usr/bin/env node

import { mkdir, writeFile, readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Templates are at the package root /templates/ (two levels up from dist/cli/)
const templateDir = join(__dirname, '..', '..', 'templates');

async function main() {
  const projectName = process.argv[2];

  if (!projectName) {
    console.error('Usage: create-docs-mcp <project-name>');
    console.error('');
    console.error('Example:');
    console.error('  npx -p @mcpframework/docs create-docs-mcp my-api-docs');
    process.exit(1);
  }

  if (!/^[a-z0-9-]+$/.test(projectName)) {
    console.error('Error: Project name can only contain lowercase letters, numbers, and hyphens');
    process.exit(1);
  }

  const projectDir = join(process.cwd(), projectName);
  const srcDir = join(projectDir, 'src');

  console.log(`Creating docs MCP server: ${projectName}`);

  try {
    await mkdir(projectDir);
    await mkdir(srcDir);

    // Read and process templates
    const templates: Array<{ src: string; dest: string }> = [
      { src: 'index.ts.template', dest: join(srcDir, 'index.ts') },
      { src: 'package.json.template', dest: join(projectDir, 'package.json') },
      { src: 'tsconfig.json.template', dest: join(projectDir, 'tsconfig.json') },
      { src: 'env.example.template', dest: join(projectDir, '.env.example') },
      { src: 'README.md.template', dest: join(projectDir, 'README.md') },
    ];

    for (const t of templates) {
      let content = await readFile(join(templateDir, t.src), 'utf-8');
      content = content.replace(/\{\{PROJECT_NAME\}\}/g, projectName);
      await writeFile(t.dest, content);
    }

    // Create .gitignore
    await writeFile(
      join(projectDir, '.gitignore'),
      'node_modules\ndist\n.env\n*.log\n.DS_Store\n'
    );

    // Init git
    console.log('Initializing git repository...');
    spawnSync('git', ['init'], { cwd: projectDir, stdio: 'inherit', shell: true });

    // Install deps
    console.log('Installing dependencies...');
    const install = spawnSync('npm', ['install'], {
      cwd: projectDir,
      stdio: 'inherit',
      shell: true,
    });

    if (install.status !== 0) {
      console.error('Warning: npm install failed. Run it manually after setup.');
    } else {
      // Build
      console.log('Building project...');
      spawnSync('npx', ['tsc'], { cwd: projectDir, stdio: 'inherit', shell: true });
    }

    console.log(`
Done! Your docs MCP server is ready.

Next steps:
  cd ${projectName}
  cp .env.example .env
  # Edit .env with your documentation site URL
  npm run build
  npm start

Add to Claude Code:
  claude mcp add ${projectName} -- node $(pwd)/${projectName}/dist/index.js
`);
  } catch (error: any) {
    if (error.code === 'EEXIST') {
      console.error(`Error: Directory "${projectName}" already exists`);
    } else {
      console.error('Error creating project:', error.message);
    }
    process.exit(1);
  }
}

main();
