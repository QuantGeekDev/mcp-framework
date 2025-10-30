import { Command } from 'commander';
import { join } from 'path';
import { existsSync, readdirSync } from 'fs';
import { pathToFileURL } from 'url';

export const validateCommand = new Command('validate')
  .description('Validate all tools in the current project')
  .action(async () => {
    console.log('🔍 Validating tools...\n');

    const distPath = join(process.cwd(), 'dist', 'tools');

    if (!existsSync(distPath)) {
      console.error('❌ No dist/tools directory found. Run "npm run build" first.');
      process.exit(1);
    }

    const toolFiles = readdirSync(distPath).filter(
      (f) => f.endsWith('.js') && !f.includes('.test.')
    );
    const errors: string[] = [];
    let validatedCount = 0;

    for (const file of toolFiles) {
      try {
        const toolPath = pathToFileURL(join(distPath, file)).href;
        const module = await import(toolPath);
        const ToolClass = module.default;

        if (ToolClass && typeof ToolClass === 'function') {
          const instance = new ToolClass();
          if ('validate' in instance && typeof instance.validate === 'function') {
            try {
              instance.validate();
              validatedCount++;
              console.log(`✅ ${file}: Valid`);
            } catch (error: any) {
              errors.push(`❌ ${file}: ${error.message}`);
            }
          }
        }
      } catch (error: any) {
        errors.push(`❌ ${file}: Failed to load - ${error.message}`);
      }
    }

    console.log('');

    if (errors.length > 0) {
      console.error('Validation failed:\n');
      errors.forEach((error) => console.error(error));
      console.error(`\n❌ ${errors.length} error(s) found`);
      process.exit(1);
    } else {
      console.log(`✅ All ${validatedCount} tools validated successfully!`);
    }
  });
