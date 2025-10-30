import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';
import { ResourceLoader } from '../../src/loaders/resourceLoader.js';

describe('ResourceLoader Integration Tests', () => {
  let testBaseDir: string;
  let resourcesDir: string;

  beforeEach(async () => {
    testBaseDir = join(tmpdir(), `resource-loader-test-${Date.now()}-${Math.random()}`);
    resourcesDir = join(testBaseDir, 'resources');
    await fs.mkdir(resourcesDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      if (process.version.startsWith('v14') || process.version.startsWith('v16')) {
        execSync(`rm -rf "${testBaseDir}"`, { stdio: 'ignore' });
      } else {
        await fs.rm(testBaseDir, { recursive: true, force: true });
      }
    } catch (err) {
      void err;
    }
  });

  const createResourceFile = async (filePath: string, resourceName: string) => {
    const resourceContent = `
class ${resourceName} {
  constructor() {
    this.uri = "file://${resourceName.toLowerCase()}";
    this.name = "${resourceName.toLowerCase()}";
  }

  get resourceDefinition() {
    return {
      uri: this.uri,
      name: this.name,
      description: "Test resource",
      mimeType: "text/plain"
    };
  }

  async read() {
    return {
      contents: [{ type: "text", text: "Test content" }]
    };
  }
}

module.exports = ${resourceName};
`;
    await fs.writeFile(filePath, resourceContent);
  };

  describe('Recursive Resource Loading', () => {
    it('should detect resources exist in root directory', async () => {
      const resourceLoader = new ResourceLoader(testBaseDir);

      await createResourceFile(join(resourcesDir, 'RootResource.js'), 'RootResource');

      const hasResources = await resourceLoader.hasResources();
      expect(hasResources).toBe(true);
    });

    it('should load resources from root directory', async () => {
      const resourceLoader = new ResourceLoader(testBaseDir);

      await createResourceFile(join(resourcesDir, 'RootResource.js'), 'RootResource');
      await createResourceFile(join(resourcesDir, 'AnotherResource.js'), 'AnotherResource');

      const resources = await resourceLoader.loadResources();
      expect(resources).toHaveLength(2);

      const resourceNames = resources.map((resource) => resource.name);
      expect(resourceNames).toContain('rootresource');
      expect(resourceNames).toContain('anotherresource');
    });

    it('should load resources from nested directories', async () => {
      const resourceLoader = new ResourceLoader(testBaseDir);

      const nestedDir = join(resourcesDir, 'category');
      await fs.mkdir(nestedDir, { recursive: true });

      await createResourceFile(join(resourcesDir, 'RootResource.js'), 'RootResource');
      await createResourceFile(join(nestedDir, 'NestedResource.js'), 'NestedResource');

      const resources = await resourceLoader.loadResources();
      expect(resources).toHaveLength(2);

      const resourceNames = resources.map((resource) => resource.name);
      expect(resourceNames).toContain('rootresource');
      expect(resourceNames).toContain('nestedresource');
    });

    it('should load resources from deeply nested directories', async () => {
      const resourceLoader = new ResourceLoader(testBaseDir);

      const deepDir = join(resourcesDir, 'category', 'subcategory', 'specific');
      await fs.mkdir(deepDir, { recursive: true });

      await createResourceFile(join(deepDir, 'DeepResource.js'), 'DeepResource');

      const resources = await resourceLoader.loadResources();
      expect(resources).toHaveLength(1);
      expect(resources[0].name).toBe('deepresource');
    });

    it('should exclude files matching exclude patterns', async () => {
      const resourceLoader = new ResourceLoader(testBaseDir);

      await createResourceFile(join(resourcesDir, 'ValidResource.js'), 'ValidResource');
      await fs.writeFile(join(resourcesDir, 'BaseResource.js'), 'module.exports = {};');
      await fs.writeFile(join(resourcesDir, 'TestResource.test.js'), 'module.exports = {};');
      await fs.writeFile(join(resourcesDir, 'TestResource.spec.js'), 'module.exports = {};');

      const resources = await resourceLoader.loadResources();
      expect(resources).toHaveLength(1);
      expect(resources[0].name).toBe('validresource');
    });

    it('should handle invalid resources gracefully', async () => {
      const resourceLoader = new ResourceLoader(testBaseDir);

      await createResourceFile(join(resourcesDir, 'ValidResource.js'), 'ValidResource');
      await fs.writeFile(join(resourcesDir, 'InvalidResource.js'), 'module.exports = {};');

      const resources = await resourceLoader.loadResources();
      expect(resources).toHaveLength(1);
      expect(resources[0].name).toBe('validresource');
    });

    it('should return false when no resources exist', async () => {
      const resourceLoader = new ResourceLoader(testBaseDir);

      const hasResources = await resourceLoader.hasResources();
      expect(hasResources).toBe(false);
    });

    it('should return empty array when no valid resources found', async () => {
      const resourceLoader = new ResourceLoader(testBaseDir);

      const resources = await resourceLoader.loadResources();
      expect(resources).toHaveLength(0);
    });

    it('should validate resource properties correctly', async () => {
      const resourceLoader = new ResourceLoader(testBaseDir);

      const validResourceContent = `
class ValidResource {
  constructor() {
    this.uri = "file://validresource";
    this.name = "validresource";
  }

  get resourceDefinition() {
    return {
      uri: this.uri,
      name: this.name,
      description: "Valid resource",
      mimeType: "text/plain"
    };
  }

  async read() {
    return {
      contents: [{ type: "text", text: "Valid content" }]
    };
  }
}

module.exports = ValidResource;
`;

      const invalidResourceContent = `
class InvalidResource {
  constructor() {
    this.name = "invalidresource";
  }
}

module.exports = InvalidResource;
`;

      await fs.writeFile(join(resourcesDir, 'ValidResource.js'), validResourceContent);
      await fs.writeFile(join(resourcesDir, 'InvalidResource.js'), invalidResourceContent);

      const resources = await resourceLoader.loadResources();
      expect(resources).toHaveLength(1);
      expect(resources[0].name).toBe('validresource');
    });
  });

  describe('Directory Resolution', () => {
    it('should use provided basePath for resources directory', () => {
      const resourceLoader = new ResourceLoader(testBaseDir);
      expect(resourceLoader).toBeDefined();
    });

    it('should handle non-existent base directories gracefully', async () => {
      const nonExistentBaseDir = join(tmpdir(), 'non-existent-resources');
      const resourceLoader = new ResourceLoader(nonExistentBaseDir);

      const hasResources = await resourceLoader.hasResources();
      expect(hasResources).toBe(false);

      const resources = await resourceLoader.loadResources();
      expect(resources).toHaveLength(0);
    });
  });
});
