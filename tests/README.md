# Testing Infrastructure for Teams for Linux 3.0

## Overview

This testing infrastructure uses Node.js 22's native test runner for unit and integration tests, plus Playwright for E2E tests. The setup provides comprehensive testing capabilities with zero external dependencies for unit/integration testing.

## Test Directory Structure

```
tests/
├── unit/              # Unit tests (isolated component testing)
├── integration/       # Integration tests (component interaction)
├── e2e/              # End-to-end tests (Playwright)
├── helpers/          # Testing utilities and mocks
│   ├── electron-mocks.js    # Electron API mocks
│   ├── plugin-helpers.js    # Plugin testing utilities
│   └── assertions.js        # Custom assertion helpers
└── fixtures/         # Test data and sample implementations
    ├── sample-plugin.js     # Sample plugin for testing
    └── sample-data.js       # Test data fixtures
```

## Running Tests

### All Tests
```bash
npm test                    # Run all unit and integration tests
npm run test:all           # Run unit, integration, and E2E tests
```

### Unit Tests
```bash
npm run test:unit          # Run only unit tests
```

### Integration Tests
```bash
npm run test:integration   # Run only integration tests
```

### E2E Tests
```bash
npm run test:e2e           # Run Playwright E2E tests
```

### Coverage
```bash
npm run test:coverage      # Run tests with coverage report
```

### Watch Mode
```bash
npm run test:watch         # Run tests in watch mode (re-run on changes)
```

## Test Execution Order

For CI/CD pipelines, tests should run in this order:
1. **Unit Tests** - Fast, isolated tests (~seconds)
2. **Integration Tests** - Component interaction tests (~seconds to minutes)
3. **E2E Tests** - Full application tests (~minutes)

## Writing Tests

### Unit Test Example

```javascript
import { describe, it, beforeEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { SamplePlugin } from '../fixtures/sample-plugin.js';

describe('Plugin', () => {
  let plugin;

  beforeEach(() => {
    plugin = new SamplePlugin({ name: 'test' });
  });

  it('should initialize', async () => {
    await plugin.initialize({});
    assert.equal(plugin.lifecycle.initialized, true);
  });
});
```

### Integration Test Example

```javascript
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { createMockPluginManager } from '../helpers/plugin-helpers.js';

describe('Plugin Manager Integration', () => {
  it('should register and initialize plugins', async () => {
    const manager = createMockPluginManager();
    const plugin = new SamplePlugin({ name: 'test' });

    await manager.register(plugin);
    await manager.initializeAll({});

    assert.equal(plugin.lifecycle.initialized, true);
  });
});
```

## Available Test Helpers

### Electron Mocks (`electron-mocks.js`)

Mock implementations of Electron APIs for unit testing:

```javascript
import { MockBrowserWindow, mockApp, mockIpcMain } from '../helpers/electron-mocks.js';

// Create mock window
const window = new MockBrowserWindow({ width: 800, height: 600 });
await window.loadURL('https://teams.microsoft.com');

// Use mock app
const userDataPath = mockApp.getPath('userData');

// Mock IPC communication
mockIpcMain.handle('get-data', async () => {
  return { data: 'test' };
});
```

### Plugin Helpers (`plugin-helpers.js`)

Utilities for testing plugins:

```javascript
import {
  createPluginContext,
  createMockPlugin,
  testPluginLifecycle,
  assertPluginState
} from '../helpers/plugin-helpers.js';

// Create context
const context = createPluginContext();

// Test complete lifecycle
const results = await testPluginLifecycle(plugin, context);

// Assert plugin state
assertPluginState(plugin, {
  initialized: true,
  started: true,
  stopped: false,
});
```

### Custom Assertions (`assertions.js`)

Domain-specific assertions:

```javascript
import {
  assertValidPlugin,
  assertEventually,
  assertContains,
  assertExecutionTime
} from '../helpers/assertions.js';

// Validate plugin structure
assertValidPlugin(plugin);

// Wait for async condition
await assertEventually(() => plugin.isReady(), 5000);

// Check collection membership
assertContains([1, 2, 3], 2);

// Verify performance
await assertExecutionTime(async () => {
  await plugin.initialize();
}, 100); // Should complete in < 100ms
```

## Test Fixtures

### Sample Plugin (`fixtures/sample-plugin.js`)

Reusable plugin implementation for testing:

```javascript
import { SamplePlugin, SampleService } from '../fixtures/sample-plugin.js';

const plugin = new SamplePlugin({
  name: 'test-plugin',
  version: '1.0.0',
  enabled: true,
  data: { customConfig: 'value' }
});
```

### Sample Data (`fixtures/sample-data.js`)

Pre-configured test data:

```javascript
import { sampleConfigs, samplePlugins, sampleEvents } from '../fixtures/sample-data.js';

const config = sampleConfigs.complete;
const plugins = samplePlugins;
```

## Coverage Configuration

Coverage is collected using Node.js's built-in coverage tool:

```bash
npm run test:coverage
```

### Coverage Thresholds

Current thresholds (will increase over time):

- **Statements**: 50% → Target: 85%
- **Branches**: 50% → Target: 85%
- **Functions**: 50% → Target: 85%
- **Lines**: 50% → Target: 85%

Coverage reports are generated in:
- Console output (summary)
- `.coverage/` directory (detailed HTML reports)

## Best Practices

### 1. Test Isolation
- Each test should be independent
- Use `beforeEach` to set up fresh state
- Clean up in `afterEach`

```javascript
describe('Component', () => {
  let component;

  beforeEach(() => {
    component = new Component();
  });

  afterEach(() => {
    component = null;
  });
});
```

### 2. Descriptive Test Names
Use clear, descriptive test names that explain what is being tested:

```javascript
// ✅ Good
it('should initialize plugin with valid configuration', async () => {});

// ❌ Bad
it('test1', async () => {});
```

### 3. Arrange-Act-Assert Pattern
Structure tests clearly:

```javascript
it('should process data correctly', async () => {
  // Arrange
  const input = { value: 10 };
  const processor = new DataProcessor();

  // Act
  const result = await processor.process(input);

  // Assert
  assert.equal(result.value, 20);
});
```

### 4. Mock External Dependencies
Keep tests fast and isolated:

```javascript
import { createElectronMock } from '../helpers/electron-mocks.js';

const electron = createElectronMock();
const window = new electron.BrowserWindow();
```

### 5. Test Error Cases
Always test both success and failure paths:

```javascript
it('should handle initialization errors', async () => {
  const plugin = new SamplePlugin({
    data: { throwOnInit: true }
  });

  await assert.rejects(
    async () => await plugin.initialize({}),
    { message: 'Initialization failed' }
  );
});
```

### 6. Use Helper Functions
Leverage provided helpers for common patterns:

```javascript
import { testPluginLifecycle } from '../helpers/plugin-helpers.js';

const results = await testPluginLifecycle(plugin, context);
assert.equal(results.initialize.success, true);
```

## Testing Strategy

### Unit Tests (tests/unit/)
- Test individual components in isolation
- Mock all external dependencies
- Fast execution (< 1 second per test)
- High coverage of edge cases

**What to test:**
- Individual classes/modules
- Pure functions
- Domain logic
- Error handling
- Edge cases

### Integration Tests (tests/integration/)
- Test component interactions
- Use real implementations where possible
- Mock only external systems (filesystem, network)
- Moderate execution time (< 5 seconds per test)

**What to test:**
- Plugin + Service interactions
- Event flow between components
- Data persistence
- Configuration loading

### E2E Tests (tests/e2e/)
- Test complete user workflows
- Use real Electron app
- Slowest execution (10-30 seconds per test)
- Focus on critical paths

**What to test:**
- Application launch
- User authentication flow
- Core features
- Window management

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Install dependencies
        run: npm ci

      - name: Run unit tests
        run: npm run test:unit

      - name: Run integration tests
        run: npm run test:integration

      - name: Run E2E tests
        run: npm run test:e2e

      - name: Generate coverage
        run: npm run test:coverage
```

## Troubleshooting

### Tests Failing Locally

1. **Ensure Node.js 22+ is installed:**
   ```bash
   node --version  # Should be v22.0.0 or higher
   ```

2. **Clean install dependencies:**
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

3. **Run tests with verbose output:**
   ```bash
   node --test --test-reporter=spec tests/unit/**/*.test.js
   ```

### E2E Tests Failing

1. **Check Electron installation:**
   ```bash
   npm ls electron
   ```

2. **Run with debug output:**
   ```bash
   DEBUG=pw:api npm run test:e2e
   ```

3. **Ensure no other instances are running:**
   ```bash
   pkill -f teams-for-linux
   ```

## Contributing Tests

When contributing new tests:

1. **Choose the right test type**
   - Unit: Testing isolated logic
   - Integration: Testing component interactions
   - E2E: Testing user workflows

2. **Follow naming conventions**
   - Unit tests: `component-name.test.js`
   - Integration tests: `feature-name.test.js`
   - E2E tests: `workflow-name.spec.js`

3. **Add test documentation**
   - Describe what is being tested
   - Explain any complex setup
   - Document expected behavior

4. **Ensure tests pass locally**
   ```bash
   npm run test:all
   ```

5. **Maintain coverage**
   ```bash
   npm run test:coverage
   ```

## Additional Resources

- [Node.js Test Runner Documentation](https://nodejs.org/api/test.html)
- [Playwright Documentation](https://playwright.dev/)
- [Test-Driven Development Guide](../docs/tdd-guide.md)

## Support

For questions or issues with tests:
1. Check existing tests for examples
2. Review this documentation
3. Open an issue with `[Testing]` prefix
4. Contact the development team

---

**Version:** 1.0.0
**Last Updated:** 2025-11-03
**Node.js Version:** 22.19.0
