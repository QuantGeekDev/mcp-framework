import { ResourceProtocol } from '../resources/BaseResource.js';
import { BaseLoader } from './BaseLoader.js';
import { logger } from '../core/Logger.js';

export class ResourceLoader extends BaseLoader<ResourceProtocol> {
  constructor(basePath?: string) {
    super(
      {
        subdirectory: 'resources',
        excludedFiles: ['BaseResource.js', '*.test.js', '*.spec.js'],
        extensions: ['.js'],
      },
      basePath
    );
  }

  async hasResources(): Promise<boolean> {
    return this.hasItems();
  }

  protected validateItem(resource: any): resource is ResourceProtocol {
    const isValid = Boolean(
      resource &&
        typeof resource.uri === 'string' &&
        typeof resource.name === 'string' &&
        resource.resourceDefinition &&
        typeof resource.read === 'function'
    );

    if (isValid) {
      logger.debug(`Validated resource: ${resource.name}`);
    } else {
      logger.warn(`Invalid resource found: missing required properties`);
    }

    return isValid;
  }

  protected createInstance(ResourceClass: any): ResourceProtocol {
    return new ResourceClass();
  }

  protected getItemName(resource: ResourceProtocol): string {
    return resource.name;
  }

  async loadResources(): Promise<ResourceProtocol[]> {
    return this.loadItems();
  }
}
