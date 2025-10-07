import { MCPPrompt } from '../../src/prompts/BasePrompt.js';
import { z } from 'zod';

interface TestPromptWithDefaultsInput {
  message: string;
  count: number;
  enabled: boolean;
  tags: string[];
  metadata: Record<string, any>;
  optional?: string;
}

class TestPromptWithDefaults extends MCPPrompt<TestPromptWithDefaultsInput> {
  name = "test-prompt-with-defaults";
  description = "Test prompt with default values for parameterless execution";

  protected schema = {
    message: {
      type: z.string(),
      description: "Test message",
      default: "default message"
    },
    count: {
      type: z.number(),
      description: "Test count",
      default: 42
    },
    enabled: {
      type: z.boolean(),
      description: "Test boolean",
      default: true
    },
    tags: {
      type: z.array(z.string()),
      description: "Test array",
      default: ["default", "tag"]
    },
    metadata: {
      type: z.record(z.any()),
      description: "Test object",
      default: { key: "value" }
    },
    optional: {
      type: z.string().optional(),
      description: "Optional parameter",
      required: false
    }
  };

  async generateMessages(args: TestPromptWithDefaultsInput) {
    return [{
      role: "user",
      content: {
        type: "text",
        text: `Message: ${args.message}, Count: ${args.count}, Enabled: ${args.enabled}, Tags: ${args.tags.join(',')}, Optional: ${args.optional || 'not provided'}`
      }
    }];
  }
}

interface TestPromptWithoutDefaultsInput {
  message: string;
  optional?: boolean;
}

class TestPromptWithoutDefaults extends MCPPrompt<TestPromptWithoutDefaultsInput> {
  name = "test-prompt-without-defaults";
  description = "Test prompt without explicit defaults";

  protected schema = {
    message: {
      type: z.string(),
      description: "Test message"
    },
    optional: {
      type: z.boolean().optional(),
      description: "Optional parameter",
      required: false
    }
  };

  async generateMessages(args: TestPromptWithoutDefaultsInput) {
    return [{
      role: "user",
      content: {
        type: "text",
        text: `Message: ${args.message}, Optional: ${args.optional ?? 'not provided'}`
      }
    }];
  }
}

interface TestPromptAllOptionalInput {
  message?: string;
  count?: number;
}

class TestPromptAllOptional extends MCPPrompt<TestPromptAllOptionalInput> {
  name = "test-prompt-all-optional";
  description = "Test prompt with all optional parameters";

  protected schema = {
    message: {
      type: z.string().optional(),
      description: "Optional message",
      required: false
    },
    count: {
      type: z.number().optional(),
      description: "Optional count",
      required: false
    }
  };

  async generateMessages(args: TestPromptAllOptionalInput) {
    return [{
      role: "user",
      content: {
        type: "text",
        text: `Message: ${args.message || 'default'}, Count: ${args.count || 0}`
      }
    }];
  }
}

describe('Parameterless Prompt Execution', () => {
  describe('Prompts with explicit defaults', () => {
    let prompt: TestPromptWithDefaults;

    beforeEach(() => {
      prompt = new TestPromptWithDefaults();
    });

    it('should execute prompt with no arguments using defaults', async () => {
      const result = await prompt.getMessages();
      expect(result).toHaveLength(1);
      expect(result[0].content.text).toContain('Message: default message');
      expect(result[0].content.text).toContain('Count: 42');
      expect(result[0].content.text).toContain('Enabled: true');
      expect(result[0].content.text).toContain('Tags: default,tag');
      expect(result[0].content.text).toContain('Optional: not provided');
    });

    it('should execute prompt with empty object using defaults', async () => {
      const result = await prompt.getMessages({});
      expect(result).toHaveLength(1);
      expect(result[0].content.text).toContain('Message: default message');
      expect(result[0].content.text).toContain('Count: 42');
      expect(result[0].content.text).toContain('Enabled: true');
    });

    it('should execute prompt with partial arguments, using defaults for missing', async () => {
      const result = await prompt.getMessages({ message: "custom message" });
      expect(result).toHaveLength(1);
      expect(result[0].content.text).toContain('Message: custom message');
      expect(result[0].content.text).toContain('Count: 42'); // default
      expect(result[0].content.text).toContain('Enabled: true'); // default
    });

    it('should execute prompt with all arguments provided', async () => {
      const result = await prompt.getMessages({
        message: "custom message",
        count: 100,
        enabled: false,
        tags: ["custom", "tags"],
        metadata: { custom: "data" },
        optional: "provided"
      });
      expect(result).toHaveLength(1);
      expect(result[0].content.text).toContain('Message: custom message');
      expect(result[0].content.text).toContain('Count: 100');
      expect(result[0].content.text).toContain('Enabled: false');
      expect(result[0].content.text).toContain('Tags: custom,tags');
      expect(result[0].content.text).toContain('Optional: provided');
    });
  });

  describe('Prompts without explicit defaults', () => {
    let prompt: TestPromptWithoutDefaults;

    beforeEach(() => {
      prompt = new TestPromptWithoutDefaults();
    });

    it('should execute prompt with no arguments using sensible defaults', async () => {
      const result = await prompt.getMessages();
      expect(result).toHaveLength(1);
      expect(result[0].content.text).toContain('Message: '); // empty string default
      expect(result[0].content.text).toContain('Optional: not provided');
    });

    it('should execute prompt with empty object using sensible defaults', async () => {
      const result = await prompt.getMessages({});
      expect(result).toHaveLength(1);
      expect(result[0].content.text).toContain('Message: '); // empty string default
    });

    it('should execute prompt with provided arguments', async () => {
      const result = await prompt.getMessages({
        message: "custom message",
        optional: true
      });
      expect(result).toHaveLength(1);
      expect(result[0].content.text).toContain('Message: custom message');
      expect(result[0].content.text).toContain('Optional: true');
    });
  });

  describe('Prompts with all optional parameters', () => {
    let prompt: TestPromptAllOptional;

    beforeEach(() => {
      prompt = new TestPromptAllOptional();
    });

    it('should execute prompt with no arguments', async () => {
      const result = await prompt.getMessages();
      expect(result).toHaveLength(1);
      expect(result[0].content.text).toContain('Message: default');
      expect(result[0].content.text).toContain('Count: 0');
    });

    it('should execute prompt with empty object', async () => {
      const result = await prompt.getMessages({});
      expect(result).toHaveLength(1);
      expect(result[0].content.text).toContain('Message: default');
      expect(result[0].content.text).toContain('Count: 0');
    });

    it('should execute prompt with partial arguments', async () => {
      const result = await prompt.getMessages({ message: "custom" });
      expect(result).toHaveLength(1);
      expect(result[0].content.text).toContain('Message: custom');
      expect(result[0].content.text).toContain('Count: 0'); // not provided, uses default in generateMessages
    });
  });

  describe('Prompt definition with defaults', () => {
    it('should include default information in prompt definition', () => {
      const prompt = new TestPromptWithDefaults();
      const definition = prompt.promptDefinition;
      
      expect(definition.name).toBe('test-prompt-with-defaults');
      expect(definition.description).toBe('Test prompt with default values for parameterless execution');
      expect(definition.arguments).toHaveLength(6);
      
      // Check that required field is marked correctly based on defaults
      const messageArg = definition.arguments?.find(arg => arg.name === 'message');
      expect(messageArg?.required).toBe(false); // Should be false because it has a default
      
      const optionalArg = definition.arguments?.find(arg => arg.name === 'optional');
      expect(optionalArg?.required).toBe(false); // Explicitly optional
    });
  });

  describe('Error handling', () => {
    it('should handle invalid argument types gracefully', async () => {
      const prompt = new TestPromptWithDefaults();
      
      // This should still work because validation will use defaults for invalid types
      await expect(prompt.getMessages({ count: "invalid" })).rejects.toThrow();
    });
  });
});