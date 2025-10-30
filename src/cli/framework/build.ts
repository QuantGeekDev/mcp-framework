#!/usr/bin/env node
import { execa } from 'execa';
import { readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { findUp } from 'find-up';
import { existsSync } from 'fs';

export async function buildFramework() {
  process.stderr.write('MCP Build Script Starting...\n');
  process.stderr.write('Finding project root...\n');

  const startDir = process.cwd();
  process.stderr.write(`Starting search from: ${startDir}\n`);

  const skipValidation = process.env.MCP_SKIP_VALIDATION === 'true';
  if (skipValidation) {
    process.stderr.write(`Skipping dependency validation\n`);
  }

  try {
    const pkgPath = await findUp('package.json');
    if (!pkgPath) {
      throw new Error('Could not find package.json in current directory or any parent directories');
    }

    const projectRoot = dirname(pkgPath);

    if (!skipValidation) {
      const pkgContent = await readFile(pkgPath, 'utf8');
      const pkg = JSON.parse(pkgContent);

      if (!pkg.dependencies?.['mcp-framework']) {
        throw new Error(
          'This directory is not an MCP project (mcp-framework not found in dependencies)'
        );
      }
    }

    process.stderr.write(`Running tsc in ${projectRoot}\n`);

    const tscCommand = process.platform === 'win32' ? ['npx.cmd', 'tsc'] : ['npx', 'tsc'];

    await execa(tscCommand[0], [tscCommand[1]], {
      cwd: projectRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        FORCE_COLOR: '1',
      },
    });

    const distPath = join(projectRoot, 'dist');
    const projectIndexPath = join(distPath, 'index.js');
    const shebang = '#!/usr/bin/env node\n';

    process.stderr.write('Adding shebang to index.js...\n');
    try {
      const content = await readFile(projectIndexPath, 'utf8');
      if (!content.startsWith(shebang)) {
        await writeFile(projectIndexPath, shebang + content);
      }
    } catch (error) {
      process.stderr.write(
        `Error processing index.js: ${error instanceof Error ? error.message : String(error)}\n`
      );
      throw error;
    }

    // Validate tools after build
    const skipToolValidation = process.env.MCP_SKIP_TOOL_VALIDATION === 'true';
    if (!skipToolValidation) {
      process.stderr.write('\nValidating tools...\n');

      const toolsPath = join(distPath, 'tools');

      if (existsSync(toolsPath)) {
        const { readdirSync } = await import('fs');
        const { pathToFileURL } = await import('url');

        const toolFiles = readdirSync(toolsPath).filter(
          (f) => f.endsWith('.js') && !f.includes('.test.')
        );
        const errors: string[] = [];
        let validatedCount = 0;

        for (const file of toolFiles) {
          try {
            const toolPath = pathToFileURL(join(toolsPath, file)).href;
            const module = await import(toolPath);
            const ToolClass = module.default;

            if (ToolClass && typeof ToolClass === 'function') {
              const instance = new ToolClass();
              if ('validate' in instance && typeof instance.validate === 'function') {
                try {
                  instance.validate();
                  validatedCount++;
                } catch (error: any) {
                  errors.push(`  ❌ ${file}: ${error.message}`);
                }
              }
            }
          } catch (error: any) {
            // Skip files that can't be imported
          }
        }

        if (errors.length > 0) {
          process.stderr.write('\n❌ Tool validation failed:\n');
          errors.forEach((error) => process.stderr.write(error + '\n'));
          process.stderr.write('\n');
          throw new Error('Tool validation failed - all Zod schema fields must have descriptions');
        }

        if (validatedCount > 0) {
          process.stderr.write(`✅ Validated ${validatedCount} tools successfully\n`);
        }
      }
    }

    process.stderr.write('Build completed successfully!\n');
  } catch (error) {
    process.stderr.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  }
}

export default buildFramework;
