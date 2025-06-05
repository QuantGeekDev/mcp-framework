# MCP Framework Tests

This directory contains unit tests for the MCP Framework.

## Structure

Tests are organized to mirror the source code structure:

```
tests/
├── tools/
│   └── BaseTool.test.ts
├── resources/
├── prompts/
└── ...
```

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test tests/tools/BaseTool.test.ts
```

## Writing Tests

1. **Naming Convention**: Test files should be named `[ComponentName].test.ts`
2. **Location**: Place test files in a directory structure that mirrors `src/`
3. **Imports**: Use `.js` extensions for local imports (ESM compatibility)
4. **Test Structure**: Use `describe` blocks to group related tests

### Example Test Structure

```typescript
import { describe, it, expect, beforeEach } from '@jest/globals';
import { MyClass } from '../../src/path/to/MyClass.js';

describe('MyClass', () => {
  let instance: MyClass;

  beforeEach(() => {
    instance = new MyClass();
  });

  describe('methodName', () => {
    it('should do something specific', () => {
      // Test implementation
    });
  });
});
```

## Testing Abstract Classes

When testing abstract classes like `BaseTool`, create a concrete implementation:

```typescript
class TestTool extends MCPTool<TestInput> {
  // Implement abstract properties and methods
}
```

## Jest Configuration

The Jest configuration (`jest.config.js`) is set up for:
- TypeScript with ES modules
- Node.js environment
- Coverage reporting
- Proper path resolution for `.js` imports

## Coverage

Coverage reports are generated in the `coverage/` directory and include:
- All TypeScript files in `src/`
- Exclusions: CLI tools, type definitions, and index files 
