import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { discoverFilesRecursively, hasValidFiles } from '../../src/utils/fileDiscovery.js';

describe('File Discovery Utilities', () => {
  let testDir: string;

  beforeEach(async () => {
    // Create a unique test directory for each test
    testDir = join(tmpdir(), `file-discovery-test-${Date.now()}-${Math.random()}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (err) {
      // Ignore cleanup errors
    }
  });

  describe('discoverFilesRecursively', () => {
    it('should discover files in root directory only', async () => {
      // Create test files in root
      await fs.writeFile(join(testDir, 'tool1.js'), 'export default class Tool1 {}');
      await fs.writeFile(join(testDir, 'tool2.js'), 'export default class Tool2 {}');
      await fs.writeFile(join(testDir, 'README.md'), 'Some readme');

      const files = await discoverFilesRecursively(testDir, {
        extensions: ['.js'],
      });

      expect(files).toHaveLength(2);
      expect(files).toContain('tool1.js');
      expect(files).toContain('tool2.js');
      expect(files).not.toContain('README.md');
    });

    it('should discover files recursively in subdirectories', async () => {
      // Create nested directory structure
      const categoryDir = join(testDir, 'category');
      const subCategoryDir = join(categoryDir, 'sub-category');

      await fs.mkdir(categoryDir, { recursive: true });
      await fs.mkdir(subCategoryDir, { recursive: true });

      // Create files at different levels
      await fs.writeFile(join(testDir, 'rootTool.js'), 'export default class RootTool {}');
      await fs.writeFile(
        join(categoryDir, 'categoryTool.js'),
        'export default class CategoryTool {}'
      );
      await fs.writeFile(join(subCategoryDir, 'deepTool.js'), 'export default class DeepTool {}');

      const files = await discoverFilesRecursively(testDir, {
        extensions: ['.js'],
      });

      expect(files).toHaveLength(3);
      expect(files).toContain('rootTool.js');
      expect(files).toContain(join('category', 'categoryTool.js'));
      expect(files).toContain(join('category', 'sub-category', 'deepTool.js'));
    });

    it('should respect exclude patterns', async () => {
      // Create test files with different patterns
      await fs.writeFile(join(testDir, 'validTool.js'), 'export default class ValidTool {}');
      await fs.writeFile(join(testDir, 'BaseTool.js'), 'export default class BaseTool {}');
      await fs.writeFile(join(testDir, 'tool.test.js'), 'test file');
      await fs.writeFile(join(testDir, 'another.spec.js'), 'spec file');

      const files = await discoverFilesRecursively(testDir, {
        extensions: ['.js'],
        excludePatterns: ['BaseTool.js', '*.test.js', '*.spec.js'],
      });

      expect(files).toHaveLength(1);
      expect(files).toContain('validTool.js');
      expect(files).not.toContain('BaseTool.js');
      expect(files).not.toContain('tool.test.js');
      expect(files).not.toContain('another.spec.js');
    });

    it('should handle multiple file extensions', async () => {
      await fs.writeFile(join(testDir, 'tool.js'), 'js file');
      await fs.writeFile(join(testDir, 'tool.ts'), 'ts file');
      await fs.writeFile(join(testDir, 'tool.py'), 'python file');

      const files = await discoverFilesRecursively(testDir, {
        extensions: ['.js', '.ts'],
      });

      expect(files).toHaveLength(2);
      expect(files).toContain('tool.js');
      expect(files).toContain('tool.ts');
      expect(files).not.toContain('tool.py');
    });

    it('should return empty array for non-existent directory', async () => {
      const nonExistentDir = join(testDir, 'does-not-exist');

      const files = await discoverFilesRecursively(nonExistentDir);

      expect(files).toEqual([]);
    });

    it('should return empty array for file path instead of directory', async () => {
      const filePath = join(testDir, 'file.js');
      await fs.writeFile(filePath, 'some content');

      const files = await discoverFilesRecursively(filePath);

      expect(files).toEqual([]);
    });

    it('should handle deeply nested structures', async () => {
      // Create a 5-level deep structure
      let currentDir = testDir;
      const levels = ['level1', 'level2', 'level3', 'level4', 'level5'];

      for (const level of levels) {
        currentDir = join(currentDir, level);
        await fs.mkdir(currentDir, { recursive: true });
        await fs.writeFile(
          join(currentDir, `${level}Tool.js`),
          `export default class ${level}Tool {}`
        );
      }

      const files = await discoverFilesRecursively(testDir, {
        extensions: ['.js'],
      });

      expect(files).toHaveLength(5);
      expect(files).toContain(join('level1', 'level1Tool.js'));
      expect(files).toContain(join('level1', 'level2', 'level2Tool.js'));
      expect(files).toContain(join('level1', 'level2', 'level3', 'level3Tool.js'));
      expect(files).toContain(join('level1', 'level2', 'level3', 'level4', 'level4Tool.js'));
      expect(files).toContain(
        join('level1', 'level2', 'level3', 'level4', 'level5', 'level5Tool.js')
      );
    });

    it('should include directories when requested', async () => {
      const subDir = join(testDir, 'subdirectory');
      await fs.mkdir(subDir, { recursive: true });
      await fs.writeFile(join(subDir, 'tool.js'), 'export default class Tool {}');

      const files = await discoverFilesRecursively(testDir, {
        extensions: ['.js'],
        includeDirectories: true,
      });

      expect(files).toContain('subdirectory');
      expect(files).toContain(join('subdirectory', 'tool.js'));
    });
  });

  describe('hasValidFiles', () => {
    it('should return true when valid files exist', async () => {
      await fs.writeFile(join(testDir, 'tool.js'), 'export default class Tool {}');

      const hasFiles = await hasValidFiles(testDir, {
        extensions: ['.js'],
      });

      expect(hasFiles).toBe(true);
    });

    it('should return true when valid files exist in subdirectories', async () => {
      const subDir = join(testDir, 'subdir');
      await fs.mkdir(subDir, { recursive: true });
      await fs.writeFile(join(subDir, 'tool.js'), 'export default class Tool {}');

      const hasFiles = await hasValidFiles(testDir, {
        extensions: ['.js'],
      });

      expect(hasFiles).toBe(true);
    });

    it('should return false when no valid files exist', async () => {
      await fs.writeFile(join(testDir, 'README.md'), 'readme');

      const hasFiles = await hasValidFiles(testDir, {
        extensions: ['.js'],
      });

      expect(hasFiles).toBe(false);
    });

    it('should return false when all files are excluded', async () => {
      await fs.writeFile(join(testDir, 'BaseTool.js'), 'base tool');
      await fs.writeFile(join(testDir, 'tool.test.js'), 'test file');

      const hasFiles = await hasValidFiles(testDir, {
        extensions: ['.js'],
        excludePatterns: ['BaseTool.js', '*.test.js'],
      });

      expect(hasFiles).toBe(false);
    });

    it('should return false for non-existent directory', async () => {
      const nonExistentDir = join(testDir, 'does-not-exist');

      const hasFiles = await hasValidFiles(nonExistentDir);

      expect(hasFiles).toBe(false);
    });
  });
});
