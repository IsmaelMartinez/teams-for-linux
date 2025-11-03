/**
 * Example: Plugin Unit Test Template
 *
 * Demonstrates how to write unit tests for individual plugin features
 * using the plugin-test-utils framework
 */

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  createMockPluginEnvironment,
  createMockManifest,
  assertPluginState,
  createPluginUnitTest
} from '../helpers/plugin-test-utils.js';

// Example Plugin Class (this would be imported from your actual plugin)
class ExamplePlugin {
  constructor(id, manifest, api) {
    this.id = id;
    this.manifest = manifest;
    this.api = api;
    this.isActive = false;
    this.logger = api.getLogger(id);
    this.eventBus = api.getEventBus();
  }

  async activate() {
    this.logger.info('Activating plugin');
    this.isActive = true;

    // Subscribe to events
    this.unsubscribe = this.eventBus.on('test-event', (data) => {
      this.handleEvent(data);
    });

    // Set initial state
    this.api.setState('plugin-active', true);
  }

  async deactivate() {
    this.logger.info('Deactivating plugin');
    this.isActive = false;

    // Unsubscribe from events
    if (this.unsubscribe) {
      this.unsubscribe();
    }

    // Clear state
    this.api.setState('plugin-active', false);
  }

  async destroy() {
    this.logger.info('Destroying plugin');
  }

  handleEvent(data) {
    this.logger.debug('Handling event', data);
  }

  // Custom method to test
  async performAction(input) {
    if (!this.isActive) {
      throw new Error('Plugin is not active');
    }
    return `Processed: ${input}`;
  }
}

// Manual Unit Tests
describe('ExamplePlugin - Manual Tests', () => {
  it('should construct with valid parameters', () => {
    const env = createMockPluginEnvironment();
    const manifest = createMockManifest({ id: 'example-plugin' });

    const plugin = new ExamplePlugin('example-plugin', manifest, env.api);

    assert.strictEqual(plugin.id, 'example-plugin');
    assert.strictEqual(plugin.isActive, false);
    assert.ok(plugin.logger);
    assert.ok(plugin.eventBus);

    env.cleanup();
  });

  it('should activate and set up event listeners', async () => {
    const env = createMockPluginEnvironment();
    const manifest = createMockManifest();

    const plugin = new ExamplePlugin('example-plugin', manifest, env.api);
    await plugin.activate();

    // Assert plugin state
    assertPluginState(plugin, { isActive: true });

    // Check logger was called
    assert.ok(env.logger.info.callCount() > 0);
    assert.ok(env.logger.info.calledWith('[example-plugin]', 'Activating plugin'));

    // Check event subscription
    assert.strictEqual(env.eventBus.on.callCount(), 1);

    // Check state was set
    assert.strictEqual(env.api.getState('plugin-active'), true);

    await plugin.deactivate();
    env.cleanup();
  });

  it('should deactivate and clean up resources', async () => {
    const env = createMockPluginEnvironment();
    const manifest = createMockManifest();

    const plugin = new ExamplePlugin('example-plugin', manifest, env.api);

    await plugin.activate();
    await plugin.deactivate();

    assertPluginState(plugin, { isActive: false });
    assert.strictEqual(env.api.getState('plugin-active'), false);

    env.cleanup();
  });

  it('should handle events correctly', async () => {
    const env = createMockPluginEnvironment();
    const manifest = createMockManifest();

    const plugin = new ExamplePlugin('example-plugin', manifest, env.api);
    await plugin.activate();

    // Emit test event
    env.eventBus.emit('test-event', { test: 'data' });

    // Wait a bit for async handling
    await new Promise(resolve => setTimeout(resolve, 10));

    // Check logger was called in handler
    assert.ok(env.logger.debug.callCount() > 0);

    await plugin.deactivate();
    env.cleanup();
  });

  it('should throw error when performing action while inactive', async () => {
    const env = createMockPluginEnvironment();
    const manifest = createMockManifest();

    const plugin = new ExamplePlugin('example-plugin', manifest, env.api);

    await assert.rejects(
      async () => await plugin.performAction('test'),
      { message: 'Plugin is not active' }
    );

    env.cleanup();
  });

  it('should process action when active', async () => {
    const env = createMockPluginEnvironment();
    const manifest = createMockManifest();

    const plugin = new ExamplePlugin('example-plugin', manifest, env.api);
    await plugin.activate();

    const result = await plugin.performAction('test input');
    assert.strictEqual(result, 'Processed: test input');

    await plugin.deactivate();
    env.cleanup();
  });

  it('should wait for and respond to events', async () => {
    const env = createMockPluginEnvironment();
    const manifest = createMockManifest();

    const plugin = new ExamplePlugin('example-plugin', manifest, env.api);
    await plugin.activate();

    // Set up a promise to wait for event
    const eventPromise = env.eventBus.waitForEvent('plugin-event');

    // Trigger the event
    setTimeout(() => {
      env.eventBus.emit('plugin-event', { data: 'test' });
    }, 50);

    // Wait for event
    const eventData = await eventPromise;
    assert.deepStrictEqual(eventData, { data: 'test' });

    await plugin.deactivate();
    env.cleanup();
  });
});

// Using Test Templates
describe('ExamplePlugin - Template Tests', () => {
  it('should pass unit test template',
    createPluginUnitTest('basic functionality', ExamplePlugin, {
      manifest: { id: 'example-plugin', name: 'Example' },
      test: async (plugin, env) => {
        await plugin.activate();
        assertPluginState(plugin, { isActive: true });

        const result = await plugin.performAction('test');
        assert.strictEqual(result, 'Processed: test');
      }
    })
  );

  it('should handle multiple event emissions',
    createPluginUnitTest('event handling', ExamplePlugin, {
      test: async (plugin, env) => {
        await plugin.activate();

        // Emit multiple events
        env.eventBus.emit('test-event', { id: 1 });
        env.eventBus.emit('test-event', { id: 2 });
        env.eventBus.emit('test-event', { id: 3 });

        // Check event history
        const history = env.eventBus.getEventHistory();
        const testEvents = history.filter(e => e.event === 'test-event');
        assert.strictEqual(testEvents.length, 3);
      }
    })
  );

  it('should manage state correctly',
    createPluginUnitTest('state management', ExamplePlugin, {
      test: async (plugin, env) => {
        await plugin.activate();

        // Test state operations
        env.api.setState('test-key', 'test-value');
        assert.strictEqual(env.api.getState('test-key'), 'test-value');

        env.api.deleteState('test-key');
        assert.strictEqual(env.api.getState('test-key'), undefined);
      }
    })
  );

  it('should track logger calls',
    createPluginUnitTest('logging', ExamplePlugin, {
      test: async (plugin, env) => {
        await plugin.activate();

        // Verify logger calls
        assert.ok(env.logger.info.callCount() > 0);

        // Get all log calls
        const logs = env.logger.getLogs('info');
        assert.ok(logs.length > 0);

        // Check specific log message
        assert.ok(env.logger.hasLogged('info', '[example-plugin]', 'Activating plugin'));
      }
    })
  );
});

// Testing Error Conditions
describe('ExamplePlugin - Error Handling', () => {
  it('should handle activation errors gracefully', async () => {
    const env = createMockPluginEnvironment();
    const manifest = createMockManifest();

    // Simulate error condition
    env.api.getEventBus = () => {
      throw new Error('EventBus unavailable');
    };

    const plugin = new ExamplePlugin('example-plugin', manifest, env.api);

    await assert.rejects(
      async () => await plugin.activate(),
      { message: 'EventBus unavailable' }
    );

    env.cleanup();
  });

  it('should handle null manifest', () => {
    const env = createMockPluginEnvironment();

    assert.throws(
      () => new ExamplePlugin('example-plugin', null, env.api),
      { name: 'TypeError' }
    );

    env.cleanup();
  });
});

// Testing Async Behavior
describe('ExamplePlugin - Async Operations', () => {
  it('should handle concurrent operations', async () => {
    const env = createMockPluginEnvironment();
    const manifest = createMockManifest();

    const plugin = new ExamplePlugin('example-plugin', manifest, env.api);
    await plugin.activate();

    // Perform concurrent operations
    const results = await Promise.all([
      plugin.performAction('input1'),
      plugin.performAction('input2'),
      plugin.performAction('input3')
    ]);

    assert.strictEqual(results.length, 3);
    assert.strictEqual(results[0], 'Processed: input1');
    assert.strictEqual(results[1], 'Processed: input2');
    assert.strictEqual(results[2], 'Processed: input3');

    await plugin.deactivate();
    env.cleanup();
  });

  it('should handle rapid activate/deactivate cycles', async () => {
    const env = createMockPluginEnvironment();
    const manifest = createMockManifest();

    const plugin = new ExamplePlugin('example-plugin', manifest, env.api);

    // Rapid cycles
    for (let i = 0; i < 5; i++) {
      await plugin.activate();
      assert.strictEqual(plugin.isActive, true);

      await plugin.deactivate();
      assert.strictEqual(plugin.isActive, false);
    }

    env.cleanup();
  });
});
