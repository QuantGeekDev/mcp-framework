import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { execSync } from 'child_process';
import { PromptLoader } from '../../src/loaders/promptLoader.js';

describe('PromptLoader Integration Tests', () => {
  let testBaseDir: string;
  let promptsDir: string;

  beforeEach(async () => {
    testBaseDir = join(tmpdir(), `prompt-loader-test-${Date.now()}-${Math.random()}`);
    promptsDir = join(testBaseDir, 'prompts');
    await fs.mkdir(promptsDir, { recursive: true });
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

  const createPromptFile = async (filePath: string, promptName: string) => {
    const promptContent = `
class ${promptName} {
  constructor() {
    this.name = "${promptName.toLowerCase()}";
  }

  get promptDefinition() {
    return {
      name: this.name,
      description: "Test prompt",
      arguments: []
    };
  }

  async getMessages(args) {
    return [{ role: "user", content: "Test message" }];
  }
}

module.exports = ${promptName};
`;
    await fs.writeFile(filePath, promptContent);
  };

  describe('Recursive Prompt Loading', () => {
    it('should detect prompts exist in root directory', async () => {
      const promptLoader = new PromptLoader(testBaseDir);

      await createPromptFile(join(promptsDir, 'RootPrompt.js'), 'RootPrompt');

      const hasPrompts = await promptLoader.hasPrompts();
      expect(hasPrompts).toBe(true);
    });

    it('should load prompts from root directory', async () => {
      const promptLoader = new PromptLoader(testBaseDir);

      await createPromptFile(join(promptsDir, 'RootPrompt.js'), 'RootPrompt');
      await createPromptFile(join(promptsDir, 'AnotherPrompt.js'), 'AnotherPrompt');

      const prompts = await promptLoader.loadPrompts();
      expect(prompts).toHaveLength(2);

      const promptNames = prompts.map((prompt) => prompt.name);
      expect(promptNames).toContain('rootprompt');
      expect(promptNames).toContain('anotherprompt');
    });

    it('should load prompts from nested directories', async () => {
      const promptLoader = new PromptLoader(testBaseDir);

      const nestedDir = join(promptsDir, 'category');
      await fs.mkdir(nestedDir, { recursive: true });

      await createPromptFile(join(promptsDir, 'RootPrompt.js'), 'RootPrompt');
      await createPromptFile(join(nestedDir, 'NestedPrompt.js'), 'NestedPrompt');

      const prompts = await promptLoader.loadPrompts();
      expect(prompts).toHaveLength(2);

      const promptNames = prompts.map((prompt) => prompt.name);
      expect(promptNames).toContain('rootprompt');
      expect(promptNames).toContain('nestedprompt');
    });

    it('should load prompts from deeply nested directories', async () => {
      const promptLoader = new PromptLoader(testBaseDir);

      const deepDir = join(promptsDir, 'category', 'subcategory', 'specific');
      await fs.mkdir(deepDir, { recursive: true });

      await createPromptFile(join(deepDir, 'DeepPrompt.js'), 'DeepPrompt');

      const prompts = await promptLoader.loadPrompts();
      expect(prompts).toHaveLength(1);
      expect(prompts[0].name).toBe('deepprompt');
    });

    it('should exclude files matching exclude patterns', async () => {
      const promptLoader = new PromptLoader(testBaseDir);

      await createPromptFile(join(promptsDir, 'ValidPrompt.js'), 'ValidPrompt');
      await fs.writeFile(join(promptsDir, 'BasePrompt.js'), 'module.exports = {};');
      await fs.writeFile(join(promptsDir, 'TestPrompt.test.js'), 'module.exports = {};');
      await fs.writeFile(join(promptsDir, 'TestPrompt.spec.js'), 'module.exports = {};');

      const prompts = await promptLoader.loadPrompts();
      expect(prompts).toHaveLength(1);
      expect(prompts[0].name).toBe('validprompt');
    });

    it('should handle invalid prompts gracefully', async () => {
      const promptLoader = new PromptLoader(testBaseDir);

      await createPromptFile(join(promptsDir, 'ValidPrompt.js'), 'ValidPrompt');
      await fs.writeFile(join(promptsDir, 'InvalidPrompt.js'), 'module.exports = {};');

      const prompts = await promptLoader.loadPrompts();
      expect(prompts).toHaveLength(1);
      expect(prompts[0].name).toBe('validprompt');
    });

    it('should return false when no prompts exist', async () => {
      const promptLoader = new PromptLoader(testBaseDir);

      const hasPrompts = await promptLoader.hasPrompts();
      expect(hasPrompts).toBe(false);
    });

    it('should return empty array when no valid prompts found', async () => {
      const promptLoader = new PromptLoader(testBaseDir);

      const prompts = await promptLoader.loadPrompts();
      expect(prompts).toHaveLength(0);
    });

    it('should validate prompt properties correctly', async () => {
      const promptLoader = new PromptLoader(testBaseDir);

      const validPromptContent = `
class ValidPrompt {
  constructor() {
    this.name = "validprompt";
  }

  get promptDefinition() {
    return {
      name: this.name,
      description: "Valid prompt",
      arguments: []
    };
  }

  async getMessages(args) {
    return [{ role: "user", content: "Valid message" }];
  }
}

module.exports = ValidPrompt;
`;

      const invalidPromptContent = `
class InvalidPrompt {
  constructor() {
    this.name = "invalidprompt";
  }
}

module.exports = InvalidPrompt;
`;

      await fs.writeFile(join(promptsDir, 'ValidPrompt.js'), validPromptContent);
      await fs.writeFile(join(promptsDir, 'InvalidPrompt.js'), invalidPromptContent);

      const prompts = await promptLoader.loadPrompts();
      expect(prompts).toHaveLength(1);
      expect(prompts[0].name).toBe('validprompt');
    });
  });

  describe('Directory Resolution', () => {
    it('should use provided basePath for prompts directory', () => {
      const promptLoader = new PromptLoader(testBaseDir);
      expect(promptLoader).toBeDefined();
    });

    it('should handle non-existent base directories gracefully', async () => {
      const nonExistentBaseDir = join(tmpdir(), 'non-existent-prompts');
      const promptLoader = new PromptLoader(nonExistentBaseDir);

      const hasPrompts = await promptLoader.hasPrompts();
      expect(hasPrompts).toBe(false);

      const prompts = await promptLoader.loadPrompts();
      expect(prompts).toHaveLength(0);
    });
  });
});
