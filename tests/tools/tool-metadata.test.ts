import { describe, it, expect, jest } from '@jest/globals';
import { z } from 'zod';
import { MCPTool } from '../../src/tools/BaseTool.js';

// Mock the Server class
jest.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: jest.fn().mockImplementation(() => ({
    createMessage: jest.fn(),
  })),
}));

const schema = z.object({ input: z.string().describe('test input') });

class BasicTool extends MCPTool {
  name = 'basic_tool';
  description = 'A basic tool';
  schema = schema;
  async execute() { return 'ok'; }
}

class ToolWithTitle extends MCPTool {
  name = 'titled_tool';
  description = 'A titled tool';
  title = 'My Display Title';
  schema = schema;
  async execute() { return 'ok'; }
}

class ToolWithIcons extends MCPTool {
  name = 'icon_tool';
  description = 'A tool with icons';
  icons = [{ src: 'https://example.com/icon.png', mimeType: 'image/png', sizes: ['48x48'] }];
  schema = schema;
  async execute() { return 'ok'; }
}

class ToolWithEmptyIcons extends MCPTool {
  name = 'empty_icon_tool';
  description = 'A tool with empty icons';
  icons = [] as any[];
  schema = schema;
  async execute() { return 'ok'; }
}

class ToolWithPricing extends MCPTool {
  name = 'priced_tool';
  description = 'A tool with pricing';
  pricing = { perCall: 0.001, freeTier: 100 };
  schema = schema;
  async execute() { return 'ok'; }
}

class ToolWithPartialPricing extends MCPTool {
  name = 'partial_priced_tool';
  description = 'A tool with partial pricing';
  pricing = { perCall: 0.005 };
  schema = schema;
  async execute() { return 'ok'; }
}

describe('Tool Metadata', () => {
  describe('title', () => {
    it('should include title in toolDefinition when set', () => {
      const tool = new ToolWithTitle();
      expect(tool.toolDefinition.title).toBe('My Display Title');
    });

    it('should not include title key when not set', () => {
      const tool = new BasicTool();
      expect('title' in tool.toolDefinition).toBe(false);
    });
  });

  describe('icons', () => {
    it('should include icons in toolDefinition when set', () => {
      const tool = new ToolWithIcons();
      expect(tool.toolDefinition.icons).toHaveLength(1);
      expect(tool.toolDefinition.icons![0].src).toBe('https://example.com/icon.png');
    });

    it('should not include icons when empty array', () => {
      const tool = new ToolWithEmptyIcons();
      expect('icons' in tool.toolDefinition).toBe(false);
    });

    it('should not include icons key when not set', () => {
      const tool = new BasicTool();
      expect('icons' in tool.toolDefinition).toBe(false);
    });
  });

  describe('pricing', () => {
    it('should include pricing in toolDefinition when set', () => {
      const tool = new ToolWithPricing();
      expect(tool.toolDefinition.pricing).toEqual({ perCall: 0.001, freeTier: 100 });
    });

    it('should include partial pricing in toolDefinition', () => {
      const tool = new ToolWithPartialPricing();
      expect(tool.toolDefinition.pricing).toEqual({ perCall: 0.005 });
    });

    it('should not include pricing key when not set', () => {
      const tool = new BasicTool();
      expect('pricing' in tool.toolDefinition).toBe(false);
    });
  });
});
