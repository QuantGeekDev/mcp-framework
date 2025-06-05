# MCP Framework Tools

The MCP Framework's `MCPTool` class provides an elegant way to create tools with Zod schema validation and automatic type inference.

## Defining Tools

Use Zod schemas to define your tool inputs with automatic TypeScript type inference:

```typescript
import { MCPTool, McpInput } from "mcp-framework";
import { z } from "zod";

const AddToolSchema = z.object({
  a: z.number().describe("First number to add"),
  b: z.number().describe("Second number to add"),
});

class AddTool extends MCPTool {
  name = "add";
  description = "Add two numbers together";
  schema = AddToolSchema;

  async execute(input: McpInput<this>) {
    const result = input.a + input.b;
    return `Result: ${result}`;
  }
}

export default AddTool;
```

## Key Benefits

1. **Single Source of Truth**: Define your schema once and get both TypeScript types and JSON schema
2. **Automatic Type Inference**: `McpInput<this>` automatically infers types from your schema
3. **Rich Validation**: Leverage all Zod constraints and modifiers
4. **Required Descriptions**: Framework enforces documentation for all fields
5. **Better IDE Support**: Full autocomplete and type checking

## Advanced Schema Features

The framework supports all Zod features:

```typescript
import { MCPTool, McpInput } from "mcp-framework";
import { z } from "zod";

const AdvancedSchema = z.object({
  // String constraints and formats
  email: z.string().email().describe("User email address"),
  name: z.string().min(2).max(50).describe("User name"),
  website: z.string().url().optional().describe("Optional website URL"),
  
  // Number constraints
  age: z.number().int().positive().max(120).describe("User age"),
  rating: z.number().min(1).max(5).describe("Rating from 1 to 5"),
  
  // Arrays and objects
  tags: z.array(z.string()).describe("List of tags"),
  metadata: z.object({
    priority: z.enum(['low', 'medium', 'high']).describe("Task priority"),
    dueDate: z.string().optional().describe("Due date in ISO format")
  }).describe("Additional metadata"),
  
  // Default values
  status: z.string().default('pending').describe("Current status"),
  
  // Unions and enums
  category: z.union([
    z.literal('personal'),
    z.literal('work'),
    z.literal('other')
  ]).describe("Category type")
});

class AdvancedTool extends MCPTool {
  name = "advanced_tool";
  description = "Tool demonstrating advanced Zod features";
  schema = AdvancedSchema;

  async execute(input: McpInput<this>) {
    // TypeScript automatically knows all the types!
    const { email, name, website, age, rating, tags, metadata, status, category } = input;
    
    // Full type safety and autocomplete
    console.log(input.name.toUpperCase()); // ✅ String methods
    console.log(input.age.toFixed(2));     // ✅ Number methods
    console.log(input.tags.length);       // ✅ Array methods
    console.log(input.website?.includes("https")); // ✅ Optional handling
    
    return `Processed user: ${name}`;
  }
}
```

## Complex Example

Here's a real-world example with complex validation:

```typescript
const FindProductsSchema = z.object({
  query: z.string().optional().describe("The search query string"),
  first: z
    .number()
    .int()
    .positive()
    .optional()
    .default(10)
    .describe("Number of products per page"),
  after: z
    .string()
    .optional()
    .describe("Cursor for pagination"),
  sortKey: z
    .enum(["RELEVANCE", "TITLE", "PRICE", "CREATED_AT"])
    .optional()
    .default("RELEVANCE")
    .describe("Sort by field"),
  reverse: z
    .boolean()
    .optional()
    .default(false)
    .describe("Reverse the sort order"),
});

class FindProductsTool extends MCPTool {
  name = "find_products";
  description = "Search for products in the catalog";
  schema = FindProductsSchema;

  async execute(input: McpInput<this>) {
    // TypeScript knows the exact types with defaults applied
    const { query, first, after, sortKey, reverse } = input;
    
    // Implementation with full type safety
    return { 
      products: [], 
      totalCount: 0,
      pagination: { first, after },
      sort: { sortKey, reverse }
    };
  }
}
```

## Supported Zod Features

MCPTool correctly maps the following Zod features to JSON Schema:

- **Basic Types**: `string()`, `number()`, `boolean()`, `array()`, `object()`
- **Modifiers**: `optional()`, `nullable()`, `default()`
- **String Constraints**: `min()`, `max()`, `email()`, `url()`, `uuid()`, `regex()`
- **Number Constraints**: `int()`, `positive()`, `negative()`, `min()`, `max()`
- **Enums**: `enum()`, `literal()`
- **Nested Objects**: Full support for nested object schemas
- **Arrays**: With item type constraints
- **Descriptions**: Using `.describe()` for documentation (required)

## Schema Validation

**All schema fields must have descriptions** using `.describe()`. This ensures your tools are well-documented and provides better user experience in MCP clients.

The framework validates descriptions at multiple levels:

### Build-time Validation
```bash
npm run build  # Automatically validates during compilation
```

### Development-time Validation
Use the `defineSchema` helper for immediate feedback:

```typescript
import { defineSchema } from "mcp-framework";

// This will throw an error immediately if descriptions are missing
const MySchema = defineSchema({
  name: z.string(),  // ❌ Error: Missing description
  age: z.number().describe("User age")  // ✅ Good
});
```

### Standalone Validation
```bash
mcp validate  # Check all tools for proper descriptions
```

### Runtime Validation
The server automatically validates tools on startup.

## Type Inference

The `McpInput<this>` type automatically infers the correct input type from your schema:

```typescript
class MyTool extends MCPTool {
  schema = z.object({
    name: z.string().describe("User name"),
    age: z.number().optional().describe("User age"),
    tags: z.array(z.string()).describe("User tags")
  });

  async execute(input: McpInput<this>) {
    // TypeScript automatically knows:
    // input.name is string
    // input.age is number | undefined  
    // input.tags is string[]
    
    console.log(input.name.toUpperCase()); // ✅ TypeScript validates this
    console.log(input.age?.toFixed(2));    // ✅ Handles optional correctly
    console.log(input.tags.length);       // ✅ Array methods available
  }
}
```

No manual type definitions needed - everything is inferred from your schema!

## Best Practices

1. **Always add descriptions**: Use `.describe()` on every field
2. **Use appropriate constraints**: Leverage Zod's validation features
3. **Consider defaults**: Use `.default()` for optional fields with sensible defaults
4. **Nest schemas**: Break complex objects into smaller, reusable schemas
5. **Use enums**: Prefer `z.enum()` over string unions for better validation

```typescript
// Good example following best practices
const UserSchema = z.object({
  email: z.string().email().describe("User's email address"),
  name: z.string().min(1).max(100).describe("User's display name"),
  role: z.enum(['admin', 'user', 'guest']).default('user').describe("User role"),
  preferences: z.object({
    theme: z.enum(['light', 'dark']).default('light').describe("UI theme"),
    notifications: z.boolean().default(true).describe("Enable notifications")
  }).describe("User preferences")
});
``` 
