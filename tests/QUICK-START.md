# Plugin Testing Quick Start Guide

Get started with plugin testing in 5 minutes.

## 1. Validate Setup

Run the validation script to ensure everything is working:

```bash
node tests/helpers/validate-plugin-utils.js
```

You should see all tests pass (12/12).

## 2. Your First Plugin Test

Create a test file: `tests/unit/my-plugin.test.js`

```javascript
import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  createMockPluginEnvironment,
  createMockManifest
} from '../helpers/plugin-test-utils.js';

// Import your plugin
import MyPlugin from '../../src/plugins/MyPlugin.js';

describe('MyPlugin', () => {
  it('should activate successfully', async () => {
    // 1. Create test environment
    const env = createMockPluginEnvironment();
    const manifest = createMockManifest({ id: 'my-plugin' });

    // 2. Create plugin instance
    const plugin = new MyPlugin('my-plugin', manifest, env.api);

    // 3. Test activation
    await plugin.activate();
    assert.strictEqual(plugin.isActive, true);

    // 4. Cleanup
    await plugin.deactivate();
    await plugin.destroy();
    env.cleanup();
  });
});
```

## 3. Run Your Test

```bash
# Run your test
node --test tests/unit/my-plugin.test.js

# Run with watch mode
node --test --watch tests/unit/my-plugin.test.js
```

## 4. Add More Tests

### Test Event Handling

```javascript
it('should handle events', async () => {
  const env = createMockPluginEnvironment();
  const manifest = createMockManifest();
  const plugin = new MyPlugin('test', manifest, env.api);

  await plugin.activate();

  // Wait for event
  const eventPromise = env.eventBus.waitForEvent('plugin-ready', 1000);

  // Trigger something that emits the event
  env.eventBus.emit('initialize');

  // Wait for the event
  await eventPromise; // Will timeout if event not emitted

  await plugin.deactivate();
  env.cleanup();
});
```

### Test State Management

```javascript
it('should manage state', async () => {
  const env = createMockPluginEnvironment();
  const manifest = createMockManifest();
  const plugin = new MyPlugin('test', manifest, env.api);

  await plugin.activate();

  // Set some state
  env.api.setState('counter', 0);

  // Plugin should modify state
  plugin.incrementCounter();

  // Verify state changed
  assert.strictEqual(env.api.getState('counter'), 1);

  await plugin.deactivate();
  env.cleanup();
});
```

### Test IPC Communication

```javascript
import { createMockIPC } from '../helpers/plugin-test-utils.js';

it('should send IPC messages', async () => {
  const env = createMockPluginEnvironment();
  const ipc = createMockIPC();
  env.api.ipc = ipc;

  // Set up response handler
  ipc.handle('get-data', () => ({ result: 'success' }));

  const manifest = createMockManifest();
  const plugin = new MyPlugin('test', manifest, env.api);

  await plugin.activate();

  // Plugin sends IPC message
  const result = await plugin.requestData();

  // Verify result
  assert.deepStrictEqual(result, { result: 'success' });

  // Check IPC was called
  assert.strictEqual(ipc.invoke.callCount(), 1);

  await plugin.deactivate();
  ipc.reset();
  env.cleanup();
});
```

## 5. Using Test Templates

Make testing even faster with templates:

```javascript
import { createPluginUnitTest } from '../helpers/plugin-test-utils.js';

describe('MyPlugin - Templates', () => {
  it('should pass basic functionality test',
    createPluginUnitTest('basic test', MyPlugin, {
      manifest: { id: 'my-plugin', name: 'My Plugin' },
      test: async (plugin, env) => {
        await plugin.activate();

        // Your test logic here
        assert.strictEqual(plugin.isActive, true);

        // Test a feature
        const result = await plugin.doSomething();
        assert.ok(result);
      }
    })
  );
});
```

## 6. Test Full Lifecycle

```javascript
import { testPluginLifecycle } from '../helpers/plugin-test-utils.js';

it('should complete full lifecycle', async () => {
  const env = createMockPluginEnvironment();
  const manifest = createMockManifest();

  const results = await testPluginLifecycle(MyPlugin, manifest, env.api);

  // Check all lifecycle stages passed
  assert.strictEqual(results.construct.success, true);
  assert.strictEqual(results.activate.success, true);
  assert.strictEqual(results.deactivate.success, true);
  assert.strictEqual(results.destroy.success, true);

  env.cleanup();
});
```

## 7. Check Examples

Browse complete examples in `tests/examples/`:

```bash
# Run all examples
node --test tests/examples/*.example.js

# Run specific example
node --test tests/examples/plugin-unit-test.example.js
```

## Common Patterns Cheat Sheet

### Setup and Cleanup
```javascript
const env = createMockPluginEnvironment();
try {
  // Test logic
} finally {
  env.cleanup();
}
```

### Assert Plugin State
```javascript
import { assertPluginState } from '../helpers/plugin-test-utils.js';

assertPluginState(plugin, {
  isActive: true,
  isReady: true
});
```

### Wait for State Change
```javascript
import { waitForPluginState } from '../helpers/plugin-test-utils.js';

await waitForPluginState(plugin, 'isReady', true, 5000);
```

### Check Logger
```javascript
// Check logs
const logs = env.logger.getLogs('info');
assert.ok(logs.length > 0);

// Check specific log
assert.ok(env.logger.info.callCount() > 0);
```

### Verify Events
```javascript
// Check event was emitted
const count = env.eventBus.getEventCount('my-event');
assert.strictEqual(count, 1);

// Get event history
const history = env.eventBus.getEventHistory();
```

### Track IPC Calls
```javascript
// Get invocations
const invocations = ipc.getInvocations('channel-name');
assert.strictEqual(invocations.length, 1);
```

## Testing Best Practices

1. **One test, one behavior**: Each test should verify one specific behavior
2. **Descriptive names**: Test names should explain what and why
3. **Clean up**: Always call `env.cleanup()` after tests
4. **Isolation**: Each test should be independent
5. **Fast**: Keep tests fast by using mocks
6. **Assertions**: Use clear, specific assertions

## Debugging Tests

### Enable detailed output
```bash
node --test --test-reporter=spec tests/unit/my-plugin.test.js
```

### Check mock state
```javascript
// During test, log mock state
console.log('Event history:', env.eventBus.getEventHistory());
console.log('Logger calls:', env.logger.getLogs());
console.log('IPC calls:', ipc.getInvocations());
```

### Use console.log in tests
```javascript
it('debugging test', async () => {
  const env = createMockPluginEnvironment();
  console.log('Environment created');

  const plugin = new MyPlugin('test', createMockManifest(), env.api);
  console.log('Plugin created');

  await plugin.activate();
  console.log('Plugin activated, state:', plugin);

  env.cleanup();
});
```

## Next Steps

1. ✅ Run validation: `node tests/helpers/validate-plugin-utils.js`
2. ✅ Review examples: `tests/examples/`
3. ✅ Read full guide: `tests/PLUGIN-TESTING-GUIDE.md`
4. ✅ Write your tests!
5. ✅ Run tests: `node --test`

## Need Help?

- **Full Guide**: See `tests/PLUGIN-TESTING-GUIDE.md`
- **Examples**: Check `tests/examples/`
- **Summary**: Read `tests/PLUGIN-TEST-FRAMEWORK-SUMMARY.md`
- **Utilities**: Browse `tests/helpers/plugin-test-utils.js`

## Common Issues

### Import errors
Make sure package.json has `"type": "module"` or use `.mjs` extensions.

### Async issues
Always use `await` with async plugin methods:
```javascript
await plugin.activate();  // ✓ Correct
plugin.activate();        // ✗ Wrong
```

### Mock not working
Ensure you're using the mock from env:
```javascript
const env = createMockPluginEnvironment();
const plugin = new MyPlugin('test', manifest, env.api);  // ✓ Use env.api
```

### Event not captured
Make sure you're using the same event bus:
```javascript
const eventBus = env.api.getEventBus();  // ✓ Get from API
```

---

Happy testing! 🚀
