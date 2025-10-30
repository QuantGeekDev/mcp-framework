import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';
import { BaseLoader, LoaderConfig } from '../../src/loaders/BaseLoader.js';

interface TestItem {
  name: string;
  type: string;
  validate(): boolean;
}

class TestLoader extends BaseLoader<TestItem> {
  constructor(basePath?: string) {
    super(
      {
        subdirectory: 'testItems',
        excludedFiles: ['BaseTestItem.js', '*.test.js', '*.spec.js'],
        extensions: ['.js'],
      },
      basePath
    );
  }

  protected validateItem(item: any): item is TestItem {
    return Boolean(
      item &&
        typeof item.name === 'string' &&
        typeof item.type === 'string' &&
        typeof item.validate === 'function'
    );
  }

  protected createInstance(ItemClass: any): TestItem {
    return new ItemClass();
  }

  protected getItemName(item: TestItem): string {
    return item.name;
  }

  async hasTestItems(): Promise<boolean> {
    return this.hasItems();
  }

  async loadTestItems(): Promise<TestItem[]> {
    return this.loadItems();
  }
}

describe('BaseLoader', () => {
  let testBaseDir: string;
  let testItemsDir: string;

  beforeEach(async () => {
    testBaseDir = join(tmpdir(), `base-loader-test-${Date.now()}-${Math.random()}`);
    testItemsDir = join(testBaseDir, 'testItems');
    await fs.mkdir(testItemsDir, { recursive: true });
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

  const createTestItemFile = async (filePath: string, itemName: string) => {
    const itemContent = `
class ${itemName} {
  constructor() {
    this.name = "${itemName.toLowerCase()}";
    this.type = "test";
  }

  validate() {
    return true;
  }
}

module.exports = ${itemName};
`;
    await fs.writeFile(filePath, itemContent);
  };

  describe('Constructor and Directory Resolution', () => {
    it('should use provided basePath when given', () => {
      const loader = new TestLoader(testBaseDir);
      expect(loader).toBeDefined();
    });

    it('should fallback to auto-detection when no basePath provided', () => {
      const loader = new TestLoader();
      expect(loader).toBeDefined();
    });
  });

  describe('hasItems functionality', () => {
    it('should detect items exist in directory', async () => {
      const loader = new TestLoader(testBaseDir);

      await createTestItemFile(join(testItemsDir, 'TestItem.js'), 'TestItem');

      const hasItems = await loader.hasTestItems();
      expect(hasItems).toBe(true);
    });

    it('should return false when no items exist', async () => {
      const loader = new TestLoader(testBaseDir);

      const hasItems = await loader.hasTestItems();
      expect(hasItems).toBe(false);
    });

    it('should return false when directory does not exist', async () => {
      const nonExistentBaseDir = join(tmpdir(), 'non-existent-base');
      const loader = new TestLoader(nonExistentBaseDir);

      const hasItems = await loader.hasTestItems();
      expect(hasItems).toBe(false);
    });
  });

  describe('Recursive Loading', () => {
    it('should load items from root directory', async () => {
      const loader = new TestLoader(testBaseDir);

      await createTestItemFile(join(testItemsDir, 'RootItem.js'), 'RootItem');
      await createTestItemFile(join(testItemsDir, 'AnotherItem.js'), 'AnotherItem');

      const items = await loader.loadTestItems();
      expect(items).toHaveLength(2);

      const itemNames = items.map((item) => item.name);
      expect(itemNames).toContain('rootitem');
      expect(itemNames).toContain('anotheritem');
    });

    it('should load items from nested directories', async () => {
      const loader = new TestLoader(testBaseDir);

      const nestedDir = join(testItemsDir, 'nested');
      await fs.mkdir(nestedDir, { recursive: true });

      await createTestItemFile(join(testItemsDir, 'RootItem.js'), 'RootItem');
      await createTestItemFile(join(nestedDir, 'NestedItem.js'), 'NestedItem');

      const items = await loader.loadTestItems();
      expect(items).toHaveLength(2);

      const itemNames = items.map((item) => item.name);
      expect(itemNames).toContain('rootitem');
      expect(itemNames).toContain('nesteditem');
    });

    it('should load items from deeply nested directories', async () => {
      const loader = new TestLoader(testBaseDir);

      const deepDir = join(testItemsDir, 'level1', 'level2', 'level3');
      await fs.mkdir(deepDir, { recursive: true });

      await createTestItemFile(join(deepDir, 'DeepItem.js'), 'DeepItem');

      const items = await loader.loadTestItems();
      expect(items).toHaveLength(1);
      expect(items[0].name).toBe('deepitem');
    });

    it('should exclude files matching exclude patterns', async () => {
      const loader = new TestLoader(testBaseDir);

      await createTestItemFile(join(testItemsDir, 'ValidItem.js'), 'ValidItem');
      await fs.writeFile(join(testItemsDir, 'BaseTestItem.js'), 'module.exports = {};');
      await fs.writeFile(join(testItemsDir, 'TestItem.test.js'), 'module.exports = {};');
      await fs.writeFile(join(testItemsDir, 'TestItem.spec.js'), 'module.exports = {};');

      const items = await loader.loadTestItems();
      expect(items).toHaveLength(1);
      expect(items[0].name).toBe('validitem');
    });

    it('should handle invalid items gracefully', async () => {
      const loader = new TestLoader(testBaseDir);

      await createTestItemFile(join(testItemsDir, 'ValidItem.js'), 'ValidItem');
      await fs.writeFile(join(testItemsDir, 'InvalidItem.js'), 'module.exports = {};');

      const items = await loader.loadTestItems();
      expect(items).toHaveLength(1);
      expect(items[0].name).toBe('validitem');
    });

    it('should handle files with no exports', async () => {
      const loader = new TestLoader(testBaseDir);

      await createTestItemFile(join(testItemsDir, 'ValidItem.js'), 'ValidItem');
      await fs.writeFile(join(testItemsDir, 'NoExport.js'), 'const x = 1;');

      const items = await loader.loadTestItems();
      expect(items).toHaveLength(1);
      expect(items[0].name).toBe('validitem');
    });

    it('should handle module import errors gracefully', async () => {
      const loader = new TestLoader(testBaseDir);

      await createTestItemFile(join(testItemsDir, 'ValidItem.js'), 'ValidItem');
      await fs.writeFile(join(testItemsDir, 'SyntaxError.js'), 'this is not valid javascript');

      const items = await loader.loadTestItems();
      expect(items).toHaveLength(1);
      expect(items[0].name).toBe('validitem');
    });
  });

  describe('Multiple Export Patterns', () => {
    it('should handle default exports', async () => {
      const loader = new TestLoader(testBaseDir);

      const itemContent = `
class TestItem {
  constructor() {
    this.name = "defaultexport";
    this.type = "test";
  }
  validate() { return true; }
}
module.exports = TestItem;
`;
      await fs.writeFile(join(testItemsDir, 'DefaultExport.js'), itemContent);

      const items = await loader.loadTestItems();
      expect(items).toHaveLength(1);
      expect(items[0].name).toBe('defaultexport');
    });

    it('should handle function exports', async () => {
      const loader = new TestLoader(testBaseDir);

      const itemContent = `
function TestItem() {
  this.name = "functionexport";
  this.type = "test";
  this.validate = () => true;
}
module.exports = TestItem;
`;
      await fs.writeFile(join(testItemsDir, 'FunctionExport.js'), itemContent);

      const items = await loader.loadTestItems();
      expect(items).toHaveLength(1);
      expect(items[0].name).toBe('functionexport');
    });

    it('should handle single named export', async () => {
      const loader = new TestLoader(testBaseDir);

      const itemContent = `
class TestItem {
  constructor() {
    this.name = "namedexport";
    this.type = "test";
  }
  validate() { return true; }
}
module.exports = { TestItem };
`;
      await fs.writeFile(join(testItemsDir, 'NamedExport.js'), itemContent);

      const items = await loader.loadTestItems();
      expect(items).toHaveLength(1);
      expect(items[0].name).toBe('namedexport');
    });
  });
});
