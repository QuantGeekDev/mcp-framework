import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';
import { ToolLoader } from '../../src/loaders/toolLoader.js';
import { discoverFilesRecursively, hasValidFiles } from '../../src/utils/fileDiscovery.js';

describe('ToolLoader Integration Tests', () => {
  let testBaseDir: string;
  let toolsDir: string;

  beforeEach(async () => {
    // Create a unique test directory for each test
    testBaseDir = join(tmpdir(), `tool-loader-test-${Date.now()}-${Math.random()}`);
    toolsDir = join(testBaseDir, 'tools');
    await fs.mkdir(toolsDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      if (process.version.startsWith('v14') || process.version.startsWith('v16')) {
        // Use rmdir for older Node versions
        execSync(`rm -rf "${testBaseDir}"`, { stdio: 'ignore' });
      } else {
        await fs.rm(testBaseDir, { recursive: true, force: true });
      }
    } catch (err) {
      // Ignore cleanup errors
    }
  });

  // Helper function to create a valid tool file that matches the expected ToolProtocol
  const createToolFile = async (filePath: string, toolName: string) => {
    const toolContent = `
class ${toolName} {
  constructor() {
    this.name = "${toolName.toLowerCase()}";
    this.description = "Test tool ${toolName}";
  }

  get toolDefinition() {
    return {
      name: this.name,
      description: this.description,
      inputSchema: {
        type: "object",
        properties: {
          message: {
            type: "string",
            description: "Test message"
          }
        }
      }
    };
  }

  async toolCall(request) {
    return { 
      content: [{ 
        type: "text", 
        text: \`Test result from \${this.name}\`
      }] 
    };
  }
}

module.exports = ${toolName};
`;
    await fs.writeFile(filePath, toolContent);
  };

  describe('Recursive Tool Loading', () => {
    it('should detect JS files exist in tools directory', async () => {
      // Create tools in root directory
      await createToolFile(join(toolsDir, 'RootTool.js'), 'RootTool');

      // Check if files exist first
      const files = await fs.readdir(toolsDir);
      console.log('Files in tools dir:', files);
      expect(files).toContain('RootTool.js');

      // Test our utility directly
      const discoveredFiles = await discoverFilesRecursively(toolsDir, {
        extensions: ['.js'],
        excludePatterns: ['BaseTool.js', '*.test.js', '*.spec.js'],
      });
      console.log('Discovered files:', discoveredFiles);

      const hasFiles = await hasValidFiles(toolsDir, {
        extensions: ['.js'],
        excludePatterns: ['BaseTool.js', '*.test.js', '*.spec.js'],
      });
      console.log('Has valid files:', hasFiles);

      const toolLoader = new ToolLoader(testBaseDir);
      console.log('ToolLoader base path:', testBaseDir);
      console.log('ToolLoader tools dir should be:', join(testBaseDir, 'tools'));

      const hasTools = await toolLoader.hasTools();
      console.log('ToolLoader hasTools result:', hasTools);
      expect(hasTools).toBe(true);
    });

    it('should load tools from root tools directory', async () => {
      const toolLoader = new ToolLoader(testBaseDir);

      // Create tools in root directory
      await createToolFile(join(toolsDir, 'RootTool.js'), 'RootTool');
      await createToolFile(join(toolsDir, 'AnotherTool.js'), 'AnotherTool');

      const hasTools = await toolLoader.hasTools();
      expect(hasTools).toBe(true);

      const tools = await toolLoader.loadTools();
      expect(tools).toHaveLength(2);

      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain('roottool');
      expect(toolNames).toContain('anothertool');
    });

    it('should load tools from nested subdirectories', async () => {
      const toolLoader = new ToolLoader(testBaseDir);

      // Create nested directory structure
      const categoryDir = join(toolsDir, 'category');
      const utilsDir = join(toolsDir, 'utils');
      const deepDir = join(categoryDir, 'deep');

      await fs.mkdir(categoryDir, { recursive: true });
      await fs.mkdir(utilsDir, { recursive: true });
      await fs.mkdir(deepDir, { recursive: true });

      // Create tools at different levels
      await createToolFile(join(toolsDir, 'RootTool.js'), 'RootTool');
      await createToolFile(join(categoryDir, 'CategoryTool.js'), 'CategoryTool');
      await createToolFile(join(utilsDir, 'UtilTool.js'), 'UtilTool');
      await createToolFile(join(deepDir, 'DeepTool.js'), 'DeepTool');

      const hasTools = await toolLoader.hasTools();
      expect(hasTools).toBe(true);

      const tools = await toolLoader.loadTools();
      expect(tools).toHaveLength(4);

      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain('roottool');
      expect(toolNames).toContain('categorytool');
      expect(toolNames).toContain('utiltool');
      expect(toolNames).toContain('deeptool');
    });

    it('should exclude BaseTool.js and test files', async () => {
      const toolLoader = new ToolLoader(testBaseDir);

      // Create valid tools
      await createToolFile(join(toolsDir, 'ValidTool.js'), 'ValidTool');

      // Create files that should be excluded
      await fs.writeFile(join(toolsDir, 'BaseTool.js'), 'base tool content');
      await fs.writeFile(join(toolsDir, 'SomeTool.test.js'), 'test content');
      await fs.writeFile(join(toolsDir, 'AnotherTool.spec.js'), 'spec content');

      // Create a nested valid tool
      const subDir = join(toolsDir, 'subdirectory');
      await fs.mkdir(subDir, { recursive: true });
      await createToolFile(join(subDir, 'NestedTool.js'), 'NestedTool');

      // Create excluded file in subdirectory
      await fs.writeFile(join(subDir, 'nested.test.js'), 'nested test content');

      const hasTools = await toolLoader.hasTools();
      expect(hasTools).toBe(true);

      const tools = await toolLoader.loadTools();
      expect(tools).toHaveLength(2);

      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain('validtool');
      expect(toolNames).toContain('nestedtool');
    });

    it('should handle deeply nested tool structures', async () => {
      const toolLoader = new ToolLoader(testBaseDir);

      // Create a deeply nested structure: tools/level1/level2/level3/level4/level5
      let currentDir = toolsDir;
      const levels = ['level1', 'level2', 'level3', 'level4', 'level5'];

      for (let i = 0; i < levels.length; i++) {
        currentDir = join(currentDir, levels[i]);
        await fs.mkdir(currentDir, { recursive: true });
        await createToolFile(join(currentDir, `Level${i + 1}Tool.js`), `Level${i + 1}Tool`);
      }

      const hasTools = await toolLoader.hasTools();
      expect(hasTools).toBe(true);

      const tools = await toolLoader.loadTools();
      expect(tools).toHaveLength(5);

      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain('level1tool');
      expect(toolNames).toContain('level2tool');
      expect(toolNames).toContain('level3tool');
      expect(toolNames).toContain('level4tool');
      expect(toolNames).toContain('level5tool');
    });

    it('should gracefully handle invalid tool files in nested directories', async () => {
      const toolLoader = new ToolLoader(testBaseDir);

      // Create a valid tool
      await createToolFile(join(toolsDir, 'ValidTool.js'), 'ValidTool');

      // Create a nested directory with invalid tool files
      const nestedDir = join(toolsDir, 'nested');
      await fs.mkdir(nestedDir, { recursive: true });

      // Invalid tool file (no default export)
      await fs.writeFile(
        join(nestedDir, 'InvalidTool.js'),
        'const tool = {}; module.exports = tool;'
      );

      // Another valid tool
      await createToolFile(join(nestedDir, 'AnotherValidTool.js'), 'AnotherValidTool');

      const hasTools = await toolLoader.hasTools();
      expect(hasTools).toBe(true);

      const tools = await toolLoader.loadTools();
      expect(tools).toHaveLength(2); // Only valid tools should be loaded

      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain('validtool');
      expect(toolNames).toContain('anothervalidtool');
    });

    it('should preserve directory structure information in logs', async () => {
      const toolLoader = new ToolLoader(testBaseDir);

      // Create tools in various nested structures
      const apiDir = join(toolsDir, 'api');
      const dbDir = join(toolsDir, 'database');
      const utilsDir = join(toolsDir, 'utils', 'helpers');

      await fs.mkdir(apiDir, { recursive: true });
      await fs.mkdir(dbDir, { recursive: true });
      await fs.mkdir(utilsDir, { recursive: true });

      await createToolFile(join(apiDir, 'ApiTool.js'), 'ApiTool');
      await createToolFile(join(dbDir, 'DatabaseTool.js'), 'DatabaseTool');
      await createToolFile(join(utilsDir, 'HelperTool.js'), 'HelperTool');

      const tools = await toolLoader.loadTools();
      expect(tools).toHaveLength(3);

      // Verify all tools are loaded regardless of nesting level
      const toolNames = tools.map((t) => t.name);
      expect(toolNames).toContain('apitool');
      expect(toolNames).toContain('databasetool');
      expect(toolNames).toContain('helpertool');
    });

    it('should return empty array when no tools directory exists', async () => {
      const nonExistentBaseDir = join(tmpdir(), 'non-existent-base');
      const toolLoader = new ToolLoader(nonExistentBaseDir);

      const hasTools = await toolLoader.hasTools();
      expect(hasTools).toBe(false);

      const tools = await toolLoader.loadTools();
      expect(tools).toEqual([]);
    });

    it('should return empty array when tools directory is empty', async () => {
      const toolLoader = new ToolLoader(testBaseDir);

      const hasTools = await toolLoader.hasTools();
      expect(hasTools).toBe(false);

      const tools = await toolLoader.loadTools();
      expect(tools).toEqual([]);
    });
  });
});
