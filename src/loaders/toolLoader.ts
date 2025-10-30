import { ToolProtocol } from '../tools/BaseTool.js';
import { BaseLoader } from './BaseLoader.js';
import { logger } from '../core/Logger.js';

export class ToolLoader extends BaseLoader<ToolProtocol> {
  constructor(basePath?: string) {
    super(
      {
        subdirectory: 'tools',
        excludedFiles: ['BaseTool.js', '*.test.js', '*.spec.js'],
        extensions: ['.js'],
      },
      basePath
    );
  }

  async hasTools(): Promise<boolean> {
    return this.hasItems();
  }

  protected validateItem(tool: any): tool is ToolProtocol {
    const isValid = Boolean(
      tool &&
        typeof tool.name === 'string' &&
        tool.toolDefinition &&
        typeof tool.toolCall === 'function'
    );

    if (isValid) {
      logger.debug(`Validated tool: ${tool.name}`);
    } else {
      logger.warn(`Invalid tool found: missing required properties`);
    }

    return isValid;
  }

  protected createInstance(ToolClass: any): ToolProtocol {
    return new ToolClass();
  }

  protected getItemName(tool: ToolProtocol): string {
    return tool.name;
  }

  async loadTools(): Promise<ToolProtocol[]> {
    return this.loadItems();
  }
}
