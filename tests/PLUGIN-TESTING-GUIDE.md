# Plugin Testing Framework Guide

Comprehensive guide for testing plugins using the plugin testing framework.

## Table of Contents

- [Overview](#overview)
- [Core Utilities](#core-utilities)
- [Quick Start](#quick-start)
- [Testing Patterns](#testing-patterns)
- [Examples](#examples)
- [Best Practices](#best-practices)

## Overview

The plugin testing framework provides a complete suite of utilities for testing plugin functionality, lifecycle, and IPC communication. It's built on Node.js native test runner (`node:test`) and includes:

- **Mock PluginAPI**: Complete mock implementation of the PluginAPI interface
- **Mock EventBus**: Event bus with call tracking and history
- **Mock Logger**: Logger with call tracking and filtering
- **Mock IPC**: IPC communication with invocation tracking
- **Mock Electron APIs**: Mocks for Notification, app, ipcRenderer, etc.
- **Lifecycle Helpers**: Utilities for testing plugin activation/deactivation
- **Test Templates**: Reusable test patterns for common scenarios

## Core Utilities

### Import Utilities

```javascript
import {
  createMockPluginEnvironment,
  createMockPluginAPI,
  createMockEventBus,
  createMockLogger,
  createMockIPC,
  createMockManifest,
  testPluginLifecycle,
  testPluginCycles,
  assertPluginState,
  waitForPluginState,
  createPluginUnitTest,
  createPluginIntegrationTest,
  createPluginIPCTest
} from './helpers/plugin-test-utils.js';
```

### Mock Environment

The `createMockPluginEnvironment()` creates a complete test environment:

```javascript
const env = createMockPluginEnvironment();

// Access components
env.api          // Mock PluginAPI
env.eventBus     // Mock EventBus
env.logger       // Mock Logger
env.state        // State Map
env.electron     // Mock Electron APIs

// Cleanup after tests
env.cleanup();   // Clear history/logs but keep structure
env.reset();     // Full reset of all mocks
```

### Mock PluginAPI

Complete mock of the PluginAPI interface with tracking:

```javascript
const api = createMockPluginAPI();

// Event Bus
const eventBus = api.getEventBus();

// Logger with namespace
const logger = api.getLogger('my-plugin');

// State management
api.setState('key', 'value');
api.getState('key');
api.deleteState('key');
api.clearState();

// Configuration
api.setConfig('key', 'value');
api.getConfig('key', 'default');

// Electron APIs
api.getElectron();
api.getApp();
api.getNotification();

// IPC
api.ipc.send('channel', data);
api.ipc.invoke('channel', data);
api.ipc.on('channel', handler);
api.ipc.off('channel', handler);

// Test utilities
api._getState();          // Access internal state
api._getSubscribers();    // Access IPC subscribers
api._reset();            // Reset all state
```

### Mock EventBus

Event bus with complete tracking:

```javascript
const eventBus = createMockEventBus();

// Standard methods
eventBus.on('event', handler);
eventBus.once('event', handler);
eventBus.emit('event', data);
eventBus.off('event', handler);

// Test utilities
eventBus.getEventHistory();           // All emitted events
eventBus.getEventCount('event');      // Count for specific event
eventBus.waitForEvent('event', 5000); // Wait for event with timeout
eventBus.clearHistory();             // Clear event history
```

### Mock Logger

Logger with call tracking:

```javascript
const logger = createMockLogger();

// Standard logging
logger.info('message', data);
logger.warn('message', data);
logger.error('message', data);
logger.debug('message', data);

// Test utilities
logger.getLogs('info');              // Get all info logs
logger.getLogs();                    // Get all logs by level
logger.hasLogged('info', 'message'); // Check if logged
logger.clearLogs();                  // Clear log history
```

### Mock IPC

IPC communication with invocation tracking:

```javascript
const ipc = createMockIPC();

// Standard IPC
ipc.send('channel', data);
ipc.invoke('channel', data);
ipc.on('channel', handler);
ipc.off('channel', handler);

// Test utilities
ipc.handle('channel', handler);      // Set up response handler
ipc.trigger('channel', data);        // Trigger channel manually
ipc.getInvocations('channel');       // Get invocations for channel
ipc.clearInvocations();             // Clear invocation history
ipc.reset();                        // Full reset
```

## Quick Start

### Basic Unit Test

```javascript
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { createMockPluginEnvironment, createMockManifest } from './helpers/plugin-test-utils.js';

describe('MyPlugin', () => {
  it('should activate successfully', async () => {
    const env = createMockPluginEnvironment();
    const manifest = createMockManifest({ id: 'my-plugin' });

    const plugin = new MyPlugin('my-plugin', manifest, env.api);
    await plugin.activate();

    assert.strictEqual(plugin.isActive, true);

    await plugin.deactivate();
    await plugin.destroy();
    env.cleanup();
  });
});
```

### Using Test Templates

```javascript
import { createPluginUnitTest } from './helpers/plugin-test-utils.js';

describe('MyPlugin - Template Tests', () => {
  it('should handle state correctly',
    createPluginUnitTest('state management', MyPlugin, {
      manifest: { id: 'my-plugin' },
      test: async (plugin, env) => {
        await plugin.activate();

        // Your test logic here
        env.api.setState('test', 'value');
        assert.strictEqual(env.api.getState('test'), 'value');
      }
    })
  );
});
```

## Testing Patterns

### 1. Lifecycle Testing

Test plugin activation, deactivation, and destruction:

```javascript
import { testPluginLifecycle } from './helpers/plugin-test-utils.js';

const results = await testPluginLifecycle(MyPlugin, manifest, api);

assert.strictEqual(results.construct.success, true);
assert.strictEqual(results.activate.success, true);
assert.strictEqual(results.deactivate.success, true);
assert.strictEqual(results.destroy.success, true);
```

### 2. Multiple Cycles

Test that plugin can be activated/deactivated multiple times:

```javascript
import { testPluginCycles } from './helpers/plugin-test-utils.js';

await testPluginCycles(plugin, 3); // Test 3 cycles
```

### 3. Event Testing

Test event emission and handling:

```javascript
const env = createMockPluginEnvironment();
const plugin = new MyPlugin('test', manifest, env.api);

await plugin.activate();

// Wait for event
const eventPromise = env.eventBus.waitForEvent('plugin-ready');
env.eventBus.emit('initialize');
await eventPromise;

// Check event history
const events = env.eventBus.getEventHistory();
assert.strictEqual(events.length, 2);
```

### 4. State Management

Test plugin state operations:

```javascript
const env = createMockPluginEnvironment();
const plugin = new MyPlugin('test', manifest, env.api);

await plugin.activate();

// Set state
env.api.setState('counter', 0);

// Plugin modifies state
plugin.incrementCounter();

// Verify state
assert.strictEqual(env.api.getState('counter'), 1);
```

### 5. Logger Verification

Test that plugin logs correctly:

```javascript
const env = createMockPluginEnvironment();
const plugin = new MyPlugin('test', manifest, env.api);

await plugin.activate();

// Check logs
assert.ok(env.logger.info.callCount() > 0);
assert.ok(env.logger.hasLogged('info', '[test]', 'Plugin activated'));

const errorLogs = env.logger.getLogs('error');
assert.strictEqual(errorLogs.length, 0);
```

### 6. IPC Communication

Test IPC send/invoke patterns:

```javascript
const env = createMockPluginEnvironment();
const ipc = createMockIPC();
env.api.ipc = ipc;

// Set up handler
ipc.handle('get-data', (request) => {
  return { data: 'response' };
});

const plugin = new MyPlugin('test', manifest, env.api);
await plugin.activate();

// Test invoke
const result = await plugin.requestData();
assert.deepStrictEqual(result, { data: 'response' });

// Check invocations
const invocations = ipc.getInvocations('get-data');
assert.strictEqual(invocations.length, 1);
```

### 7. Error Handling

Test plugin error conditions:

```javascript
const env = createMockPluginEnvironment();
const plugin = new MyPlugin('test', manifest, env.api);

// Test activation error
env.api.getEventBus = () => {
  throw new Error('EventBus unavailable');
};

await assert.rejects(
  async () => await plugin.activate(),
  { message: 'EventBus unavailable' }
);
```

### 8. Performance Testing

Measure plugin performance:

```javascript
import { measurePluginPerformance } from './helpers/plugin-test-utils.js';

const metrics = await measurePluginPerformance(MyPlugin, manifest, api);

assert.ok(metrics.construct < 50, 'Construction too slow');
assert.ok(metrics.activate < 100, 'Activation too slow');
assert.ok(metrics.total < 300, 'Total lifecycle too slow');
```

### 9. Batch Testing

Test multiple plugins at once:

```javascript
import { batchTestPlugins } from './helpers/plugin-test-utils.js';

const results = await batchTestPlugins([
  { name: 'plugin-1', PluginClass: Plugin1, manifest: manifest1 },
  { name: 'plugin-2', PluginClass: Plugin2, manifest: manifest2 }
]);

Object.keys(results).forEach(name => {
  assert.strictEqual(results[name].activate.success, true);
});
```

## Examples

Complete example test files are available in `tests/examples/`:

1. **plugin-unit-test.example.js** - Unit testing patterns
2. **plugin-integration-test.example.js** - Integration and lifecycle tests
3. **plugin-ipc-test.example.js** - IPC communication tests

### Running Examples

```bash
# Run a specific example
node --test tests/examples/plugin-unit-test.example.js

# Run all examples
node --test tests/examples/*.example.js

# Run with watch mode
node --test --watch tests/examples/
```

## Best Practices

### 1. Always Clean Up

```javascript
// Good
const env = createMockPluginEnvironment();
try {
  // Test logic
} finally {
  env.cleanup();
}

// Better - let test framework handle it
it('test name', async () => {
  const env = createMockPluginEnvironment();
  // Test logic
  env.cleanup(); // Test runner will catch errors before this
});
```

### 2. Use Appropriate Assertions

```javascript
// Use assertPluginState for state checks
assertPluginState(plugin, {
  isActive: true,
  isReady: true
});

// Use waitForPluginState for async state changes
await waitForPluginState(plugin, 'isReady', true, 5000);
```

### 3. Test Isolation

```javascript
// Each test should be independent
describe('MyPlugin', () => {
  it('test 1', async () => {
    const env = createMockPluginEnvironment(); // New environment
    // Test logic
    env.cleanup();
  });

  it('test 2', async () => {
    const env = createMockPluginEnvironment(); // Fresh environment
    // Test logic
    env.cleanup();
  });
});
```

### 4. Mock External Dependencies

```javascript
const env = createMockPluginEnvironment();

// Mock filesystem
env.api.fs = {
  readFile: async () => 'mock content',
  writeFile: async () => {}
};

// Mock network
env.api.http = {
  get: async () => ({ data: 'mock' })
};
```

### 5. Test Edge Cases

```javascript
// Test with null/undefined
await assert.rejects(
  () => new MyPlugin('test', null, api),
  { name: 'TypeError' }
);

// Test with invalid data
env.api.setState('config', 'invalid-json-string');
await assert.rejects(
  () => plugin.loadConfig(),
  { message: /invalid/i }
);

// Test boundary values
env.api.setState('retry-count', 999999);
```

### 6. Use Descriptive Test Names

```javascript
// Good
it('should retry failed requests up to 3 times before throwing', async () => {

// Bad
it('should work', async () => {
```

### 7. Group Related Tests

```javascript
describe('MyPlugin', () => {
  describe('Lifecycle', () => {
    it('should activate');
    it('should deactivate');
  });

  describe('Event Handling', () => {
    it('should handle custom events');
    it('should emit status events');
  });

  describe('Error Conditions', () => {
    it('should handle activation errors');
    it('should handle invalid state');
  });
});
```

### 8. Performance Budgets

```javascript
const metrics = await measurePluginPerformance(MyPlugin, manifest, api);

// Define budgets
const budgets = {
  construct: 50,    // 50ms
  activate: 100,    // 100ms
  deactivate: 50,   // 50ms
  total: 300       // 300ms
};

Object.keys(budgets).forEach(key => {
  assert.ok(
    metrics[key] < budgets[key],
    `${key} exceeded budget: ${metrics[key]}ms > ${budgets[key]}ms`
  );
});
```

## Troubleshooting

### Mock Not Working

If mocks aren't tracking calls:

```javascript
// Check that you're using the mock, not the real API
const env = createMockPluginEnvironment();
const plugin = new MyPlugin('test', manifest, env.api); // Use env.api

// Verify mock is working
assert.ok(env.logger.info.callCount !== undefined, 'Using wrong logger');
```

### Events Not Firing

If events aren't being captured:

```javascript
// Make sure you're using the mock event bus
const env = createMockPluginEnvironment();
const eventBus = env.api.getEventBus(); // Get from API

// Not this:
// const eventBus = createMockEventBus(); // Wrong - separate instance
```

### State Not Persisting

If state isn't persisting between calls:

```javascript
// Use the same environment
const env = createMockPluginEnvironment();
const plugin = new MyPlugin('test', manifest, env.api);

env.api.setState('key', 'value');
assert.strictEqual(env.api.getState('key'), 'value'); // Works

// Not this:
// const api2 = createMockPluginAPI(); // Wrong - new instance
// assert.strictEqual(api2.getState('key'), 'value'); // Fails
```

## Additional Resources

- [Node.js Test Runner](https://nodejs.org/api/test.html)
- [Node.js Assertions](https://nodejs.org/api/assert.html)
- [Plugin Architecture Documentation](../../docs-site/docs/development/adr/)
- [General Test Utilities](./helpers/test-utils.js)
- [Electron Mocks](./helpers/electron-mocks.js)

## Contributing

When adding new test utilities:

1. Add to `plugin-test-utils.js`
2. Document the utility in this guide
3. Create an example in `tests/examples/`
4. Ensure it integrates with existing utilities
5. Add JSDoc comments for IntelliSense support
