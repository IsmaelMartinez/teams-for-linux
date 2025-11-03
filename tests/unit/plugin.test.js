/**
 * Sample Unit Test - Plugin Lifecycle
 * Demonstrates plugin testing patterns with mocks and helpers
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { SamplePlugin } from '../fixtures/sample-plugin.js';
import { createPluginContext, testPluginLifecycle, assertPluginState } from '../helpers/plugin-helpers.js';
import { assertValidPlugin } from '../helpers/assertions.js';

describe('Plugin Lifecycle', () => {
  let plugin;
  let context;

  beforeEach(() => {
    context = createPluginContext();
    plugin = new SamplePlugin({
      name: 'test-plugin',
      version: '1.0.0',
    });
  });

  afterEach(() => {
    plugin = null;
    context = null;
  });

  describe('Plugin Structure', () => {
    it('should have valid plugin structure', () => {
      assertValidPlugin(plugin);
    });

    it('should have correct name and version', () => {
      assert.equal(plugin.name, 'test-plugin');
      assert.equal(plugin.version, '1.0.0');
    });

    it('should be enabled by default', () => {
      assert.equal(plugin.enabled, true);
    });
  });

  describe('Initialization', () => {
    it('should initialize successfully', async () => {
      await plugin.initialize(context);
      assert.equal(plugin.lifecycle.initialized, true);
      assert.equal(plugin.context, context);
    });

    it('should handle initialization errors', async () => {
      const errorPlugin = new SamplePlugin({
        data: { throwOnInit: true },
      });

      await assert.rejects(
        async () => await errorPlugin.initialize(context),
        { message: 'Initialization failed' }
      );
    });

    it('should not be started before initialization', () => {
      assert.equal(plugin.lifecycle.started, false);
    });
  });

  describe('Start', () => {
    it('should start successfully after initialization', async () => {
      await plugin.initialize(context);
      await plugin.start();
      assert.equal(plugin.lifecycle.started, true);
    });

    it('should throw if started before initialization', async () => {
      await assert.rejects(
        async () => await plugin.start(),
        { message: 'Plugin must be initialized before starting' }
      );
    });

    it('should handle start errors', async () => {
      const errorPlugin = new SamplePlugin({
        data: { throwOnStart: true },
      });

      await errorPlugin.initialize(context);
      await assert.rejects(
        async () => await errorPlugin.start(),
        { message: 'Start failed' }
      );
    });
  });

  describe('Stop', () => {
    it('should stop successfully after start', async () => {
      await plugin.initialize(context);
      await plugin.start();
      await plugin.stop();
      assert.equal(plugin.lifecycle.stopped, true);
    });

    it('should throw if stopped before start', async () => {
      await plugin.initialize(context);
      await assert.rejects(
        async () => await plugin.stop(),
        { message: 'Plugin must be started before stopping' }
      );
    });
  });

  describe('Destroy', () => {
    it('should destroy successfully', async () => {
      await plugin.initialize(context);
      await plugin.start();
      await plugin.stop();
      await plugin.destroy();
      assert.equal(plugin.lifecycle.destroyed, true);
      assert.equal(plugin.context, null);
    });
  });

  describe('Complete Lifecycle', () => {
    it('should complete full lifecycle without errors', async () => {
      const results = await testPluginLifecycle(plugin, context);

      assert.equal(results.initialize.success, true);
      assert.equal(results.start.success, true);
      assert.equal(results.stop.success, true);
      assert.equal(results.destroy.success, true);
    });

    it('should have correct state after full lifecycle', async () => {
      await plugin.initialize(context);
      await plugin.start();
      await plugin.stop();
      await plugin.destroy();

      assertPluginState(plugin, {
        initialized: true,
        started: true,
        stopped: true,
        destroyed: true,
      });
    });
  });

  describe('Data Management', () => {
    it('should store and retrieve data', async () => {
      await plugin.initialize(context);
      plugin.setData('key1', 'value1');
      assert.equal(plugin.getData('key1'), 'value1');
    });

    it('should handle undefined data', () => {
      assert.equal(plugin.getData('nonexistent'), undefined);
    });
  });
});
