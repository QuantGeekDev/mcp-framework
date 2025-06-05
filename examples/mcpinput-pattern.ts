import { MCPTool, McpInput } from '../src/index.js';
import { z } from 'zod';

// Define your schema using Zod with descriptions
const AddToolSchema = z.object({
  a: z.number().describe('First number to add'),
  b: z.number().describe('Second number to add'),
});

// Create the tool - no generic parameters needed!
class AddTool extends MCPTool {
  name = 'add';
  description = 'Add two numbers';
  schema = AddToolSchema;

  // McpInput<this> automatically infers types from schema
  async execute(input: McpInput<this>) {
    const result = input.a + input.b; // Full type safety!
    return `Result: ${result}`;
  }
}

// Alternative: You can also let TypeScript infer the parameter type
class SubtractTool extends MCPTool {
  name = 'subtract';
  description = 'Subtract two numbers';

  schema = z.object({
    x: z.number().describe('Number to subtract from'),
    y: z.number().describe('Number to subtract'),
  });

  // Parameter type is automatically inferred
  async execute(input) {
    const result = input.x - input.y; // Still type safe!
    return `Result: ${result}`;
  }
}

export { AddTool, SubtractTool };
export default AddTool;
