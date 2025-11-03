/**
 * Example: Plugin Integration Test Template
 *
 * Demonstrates how to write integration tests for plugin lifecycle
 * and interactions with the plugin system
 */

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  createMockPluginEnvironment,
  createMockManifest,
  testPluginLifecycle,
  testPluginCycles,
  createPluginIntegrationTest,
  batchTestPlugins,
  measurePluginPerformance
} from '../helpers/plugin-test-utils.js';

// Example Plugin for integration testing
class IntegrationTestPlugin {
  constructor(id, manifest, api) {
    this.id = id;
    this.manifest = manifest;
    this.api = api;
    this.isActive = false;
    this.logger = api.getLogger(id);
    this.eventBus = api.getEventBus();
    this.initializationOrder = [];
  }

  async activate() {
    this.initializationOrder.push('activate-start');
    this.logger.info('Activating plugin');

    // Simulate async initialization
    await this._loadResources();
    await this._registerHandlers();

    this.isActive = true;
    this.initializationOrder.push('activate-end');
    this.eventBus.emit('plugin-activated', { pluginId: this.id });
  }

  async deactivate() {
    this.initializationOrder.push('deactivate-start');
    this.logger.info('Deactivating plugin');

    // Cleanup
    await this._unregisterHandlers();
    await this._unloadResources();

    this.isActive = false;
    this.initializationOrder.push('deactivate-end');
    this.eventBus.emit('plugin-deactivated', { pluginId: this.id });
  }

  async destroy() {
    this.initializationOrder.push('destroy');
    this.logger.info('Destroying plugin');
  }

  async _loadResources() {
    this.initializationOrder.push('load-resources');
    // Simulate resource loading
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  async _registerHandlers() {
    this.initializationOrder.push('register-handlers');
    // Simulate handler registration
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  async _unregisterHandlers() {
    this.initializationOrder.push('unregister-handlers');
  }

  async _unloadResources() {
    this.initializationOrder.push('unload-resources');
  }
}

// Full Lifecycle Tests
describe('Plugin Integration - Full Lifecycle', () => {
  it('should complete full lifecycle successfully', async () => {
    const env = createMockPluginEnvironment();
    const manifest = createMockManifest({ id: 'integration-test' });

    const results = await testPluginLifecycle(IntegrationTestPlugin, manifest, env.api);

    // All lifecycle methods should succeed
    assert.strictEqual(results.construct.success, true, 'Construction failed');
    assert.strictEqual(results.activate.success, true, 'Activation failed');
    assert.strictEqual(results.deactivate.success, true, 'Deactivation failed');
    assert.strictEqual(results.destroy.success, true, 'Destruction failed');

    // No errors should be recorded
    assert.strictEqual(results.construct.error, null);
    assert.strictEqual(results.activate.error, null);
    assert.strictEqual(results.deactivate.error, null);
    assert.strictEqual(results.destroy.error, null);

    env.cleanup();
  });

  it('should maintain proper initialization order', async () => {
    const env = createMockPluginEnvironment();
    const manifest = createMockManifest();

    const plugin = new IntegrationTestPlugin('test-plugin', manifest, env.api);

    await plugin.activate();
    await plugin.deactivate();
    await plugin.destroy();

    const expectedOrder = [
      'activate-start',
      'load-resources',
      'register-handlers',
      'activate-end',
      'deactivate-start',
      'unregister-handlers',
      'unload-resources',
      'deactivate-end',
      'destroy'
    ];

    assert.deepStrictEqual(plugin.initializationOrder, expectedOrder);

    env.cleanup();
  });

  it('should handle multiple activation cycles', async () => {
    const env = createMockPluginEnvironment();
    const manifest = createMockManifest();

    const plugin = new IntegrationTestPlugin('test-plugin', manifest, env.api);

    await testPluginCycles(plugin, 3);

    // Check that all cycles completed
    const activations = plugin.initializationOrder.filter(x => x === 'activate-end');
    const deactivations = plugin.initializationOrder.filter(x => x === 'deactivate-end');

    assert.strictEqual(activations.length, 3);
    assert.strictEqual(deactivations.length, 3);

    await plugin.destroy();
    env.cleanup();
  });

  it('should emit lifecycle events', async () => {
    const env = createMockPluginEnvironment();
    const manifest = createMockManifest();

    const plugin = new IntegrationTestPlugin('test-plugin', manifest, env.api);

    // Wait for activation event
    const activationPromise = env.eventBus.waitForEvent('plugin-activated');
    await plugin.activate();
    const activationData = await activationPromise;

    assert.deepStrictEqual(activationData, { pluginId: 'test-plugin' });

    // Wait for deactivation event
    const deactivationPromise = env.eventBus.waitForEvent('plugin-deactivated');
    await plugin.deactivate();
    const deactivationData = await deactivationPromise;

    assert.deepStrictEqual(deactivationData, { pluginId: 'test-plugin' });

    await plugin.destroy();
    env.cleanup();
  });
});

// Multi-Plugin Integration Tests
describe('Plugin Integration - Multi-Plugin', () => {
  it('should manage multiple plugins independently', async () => {
    const env = createMockPluginEnvironment();

    const plugins = [
      new IntegrationTestPlugin('plugin-1', createMockManifest({ id: 'plugin-1' }), env.api),
      new IntegrationTestPlugin('plugin-2', createMockManifest({ id: 'plugin-2' }), env.api),
      new IntegrationTestPlugin('plugin-3', createMockManifest({ id: 'plugin-3' }), env.api)
    ];

    // Activate all plugins
    await Promise.all(plugins.map(p => p.activate()));

    // Verify all are active
    plugins.forEach(p => {
      assert.strictEqual(p.isActive, true);
    });

    // Deactivate plugin-2 only
    await plugins[1].deactivate();

    assert.strictEqual(plugins[0].isActive, true);
    assert.strictEqual(plugins[1].isActive, false);
    assert.strictEqual(plugins[2].isActive, true);

    // Cleanup
    await Promise.all(plugins.map(p => {
      if (p.isActive) return p.deactivate().then(() => p.destroy());
      return p.destroy();
    }));

    env.cleanup();
  });

  it('should handle plugin dependencies', async () => {
    const env = createMockPluginEnvironment();

    class DependentPlugin extends IntegrationTestPlugin {
      async activate() {
        // Check if dependency is active
        const depState = this.api.getState('plugin-1-active');
        if (!depState) {
          throw new Error('Dependency plugin-1 is not active');
        }
        await super.activate();
      }
    }

    const plugin1 = new IntegrationTestPlugin('plugin-1', createMockManifest(), env.api);
    const plugin2 = new DependentPlugin('plugin-2', createMockManifest(), env.api);

    // Activate dependency first
    await plugin1.activate();
    env.api.setState('plugin-1-active', true);

    // Now dependent plugin should activate successfully
    await plugin2.activate();
    assert.strictEqual(plugin2.isActive, true);

    // Cleanup
    await plugin2.deactivate();
    await plugin1.deactivate();
    await plugin2.destroy();
    await plugin1.destroy();

    env.cleanup();
  });

  it('should use batch testing for multiple plugins', async () => {
    const plugins = [
      { name: 'plugin-1', PluginClass: IntegrationTestPlugin, manifest: createMockManifest({ id: 'plugin-1' }) },
      { name: 'plugin-2', PluginClass: IntegrationTestPlugin, manifest: createMockManifest({ id: 'plugin-2' }) },
      { name: 'plugin-3', PluginClass: IntegrationTestPlugin, manifest: createMockManifest({ id: 'plugin-3' }) }
    ];

    const results = await batchTestPlugins(plugins);

    // All plugins should pass all lifecycle tests
    Object.keys(results).forEach(name => {
      assert.strictEqual(results[name].construct.success, true, `${name} construction failed`);
      assert.strictEqual(results[name].activate.success, true, `${name} activation failed`);
      assert.strictEqual(results[name].deactivate.success, true, `${name} deactivation failed`);
      assert.strictEqual(results[name].destroy.success, true, `${name} destruction failed`);
    });
  });
});

// Performance Integration Tests
describe('Plugin Integration - Performance', () => {
  it('should complete lifecycle within performance budget', async () => {
    const env = createMockPluginEnvironment();
    const manifest = createMockManifest();

    const metrics = await measurePluginPerformance(IntegrationTestPlugin, manifest, env.api);

    // Define performance budgets (in milliseconds)
    assert.ok(metrics.construct < 50, `Construction took ${metrics.construct}ms (budget: 50ms)`);
    assert.ok(metrics.activate < 100, `Activation took ${metrics.activate}ms (budget: 100ms)`);
    assert.ok(metrics.deactivate < 100, `Deactivation took ${metrics.deactivate}ms (budget: 100ms)`);
    assert.ok(metrics.destroy < 50, `Destruction took ${metrics.destroy}ms (budget: 50ms)`);
    assert.ok(metrics.total < 300, `Total took ${metrics.total}ms (budget: 300ms)`);

    env.cleanup();
  });

  it('should handle high-frequency state changes', async () => {
    const env = createMockPluginEnvironment();
    const manifest = createMockManifest();

    const plugin = new IntegrationTestPlugin('perf-test', manifest, env.api);
    await plugin.activate();

    const start = performance.now();

    // Perform many state operations
    for (let i = 0; i < 1000; i++) {
      env.api.setState(`key-${i}`, `value-${i}`);
    }

    const duration = performance.now() - start;

    // Should complete within reasonable time
    assert.ok(duration < 100, `State operations took ${duration}ms`);

    await plugin.deactivate();
    await plugin.destroy();
    env.cleanup();
  });

  it('should handle high-frequency event emissions', async () => {
    const env = createMockPluginEnvironment();
    const manifest = createMockManifest();

    const plugin = new IntegrationTestPlugin('perf-test', manifest, env.api);
    await plugin.activate();

    let eventCount = 0;
    env.eventBus.on('test-event', () => eventCount++);

    const start = performance.now();

    // Emit many events
    for (let i = 0; i < 1000; i++) {
      env.eventBus.emit('test-event', { index: i });
    }

    const duration = performance.now() - start;

    assert.strictEqual(eventCount, 1000);
    assert.ok(duration < 100, `Event emissions took ${duration}ms`);

    await plugin.deactivate();
    await plugin.destroy();
    env.cleanup();
  });
});

// Using Test Template
describe('Plugin Integration - Template Tests', () => {
  it('should pass integration test template',
    createPluginIntegrationTest('full lifecycle', IntegrationTestPlugin)
  );
});

// Error Recovery Integration Tests
describe('Plugin Integration - Error Recovery', () => {
  it('should recover from activation failure', async () => {
    const env = createMockPluginEnvironment();
    const manifest = createMockManifest();

    class FailingPlugin extends IntegrationTestPlugin {
      constructor(id, manifest, api) {
        super(id, manifest, api);
        this.shouldFail = true;
      }

      async activate() {
        if (this.shouldFail) {
          throw new Error('Simulated activation failure');
        }
        await super.activate();
      }
    }

    const plugin = new FailingPlugin('failing-plugin', manifest, env.api);

    // First activation should fail
    await assert.rejects(
      async () => await plugin.activate(),
      { message: 'Simulated activation failure' }
    );

    assert.strictEqual(plugin.isActive, false);

    // Fix the issue and retry
    plugin.shouldFail = false;
    await plugin.activate();

    assert.strictEqual(plugin.isActive, true);

    await plugin.deactivate();
    await plugin.destroy();
    env.cleanup();
  });

  it('should clean up properly after partial activation', async () => {
    const env = createMockPluginEnvironment();
    const manifest = createMockManifest();

    class PartiallyFailingPlugin extends IntegrationTestPlugin {
      async activate() {
        this.initializationOrder.push('activate-start');
        await this._loadResources(); // This succeeds
        throw new Error('Activation failed after resource loading');
      }
    }

    const plugin = new PartiallyFailingPlugin('partial-fail', manifest, env.api);

    await assert.rejects(
      async () => await plugin.activate(),
      { message: 'Activation failed after resource loading' }
    );

    // Plugin should not be active
    assert.strictEqual(plugin.isActive, false);

    // But resources should have been loaded
    assert.ok(plugin.initializationOrder.includes('load-resources'));

    env.cleanup();
  });
});
