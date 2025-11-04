/**
 * Sample Integration Test - Plugin Manager
 * Demonstrates integration testing between plugins and services
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { SamplePlugin, SampleService } from '../fixtures/sample-plugin.js';
import { createMockPluginManager, createPluginContext } from '../helpers/plugin-helpers.js';
import { assertLength, assertContains } from '../helpers/assertions.js';

describe('Plugin Manager Integration', () => {
  let pluginManager;
  let context;

  beforeEach(() => {
    pluginManager = createMockPluginManager();
    context = createPluginContext();
  });

  afterEach(async () => {
    await pluginManager.destroyAll();
    pluginManager = null;
    context = null;
  });

  describe('Plugin Registration', () => {
    it('should register a plugin', async () => {
      const plugin = new SamplePlugin({ name: 'test-plugin' });
      await pluginManager.register(plugin);

      const registered = pluginManager.get('test-plugin');
      assert.equal(registered, plugin);
    });

    it('should register multiple plugins', async () => {
      const plugin1 = new SamplePlugin({ name: 'plugin1' });
      const plugin2 = new SamplePlugin({ name: 'plugin2' });
      const plugin3 = new SamplePlugin({ name: 'plugin3' });

      await pluginManager.register(plugin1);
      await pluginManager.register(plugin2);
      await pluginManager.register(plugin3);

      const allPlugins = pluginManager.getAll();
      assertLength(allPlugins, 3);
    });

    it('should unregister a plugin', async () => {
      const plugin = new SamplePlugin({ name: 'test-plugin' });
      await pluginManager.register(plugin);
      await pluginManager.unregister('test-plugin');

      const registered = pluginManager.get('test-plugin');
      assert.equal(registered, undefined);
    });
  });

  describe('Plugin Initialization', () => {
    it('should initialize all plugins', async () => {
      const plugin1 = new SamplePlugin({ name: 'plugin1' });
      const plugin2 = new SamplePlugin({ name: 'plugin2' });

      await pluginManager.register(plugin1);
      await pluginManager.register(plugin2);
      await pluginManager.initializeAll(context);

      assert.equal(plugin1.lifecycle.initialized, true);
      assert.equal(plugin2.lifecycle.initialized, true);
    });

    it('should provide context to all plugins', async () => {
      const plugin1 = new SamplePlugin({ name: 'plugin1' });
      const plugin2 = new SamplePlugin({ name: 'plugin2' });

      await pluginManager.register(plugin1);
      await pluginManager.register(plugin2);
      await pluginManager.initializeAll(context);

      assert.equal(plugin1.context, context);
      assert.equal(plugin2.context, context);
    });
  });

  describe('Plugin Lifecycle Management', () => {
    it('should start all enabled plugins', async () => {
      const plugin1 = new SamplePlugin({ name: 'plugin1', enabled: true });
      const plugin2 = new SamplePlugin({ name: 'plugin2', enabled: true });
      const plugin3 = new SamplePlugin({ name: 'plugin3', enabled: false });

      await pluginManager.register(plugin1);
      await pluginManager.register(plugin2);
      await pluginManager.register(plugin3);

      await pluginManager.initializeAll(context);
      await pluginManager.startAll();

      assert.equal(plugin1.lifecycle.started, true);
      assert.equal(plugin2.lifecycle.started, true);
      assert.equal(plugin3.lifecycle.started, false);
    });

    it('should stop all started plugins', async () => {
      const plugin1 = new SamplePlugin({ name: 'plugin1' });
      const plugin2 = new SamplePlugin({ name: 'plugin2' });

      await pluginManager.register(plugin1);
      await pluginManager.register(plugin2);
      await pluginManager.initializeAll(context);
      await pluginManager.startAll();
      await pluginManager.stopAll();

      assert.equal(plugin1.lifecycle.stopped, true);
      assert.equal(plugin2.lifecycle.stopped, true);
    });

    it('should destroy all plugins', async () => {
      const plugin1 = new SamplePlugin({ name: 'plugin1' });
      const plugin2 = new SamplePlugin({ name: 'plugin2' });

      await pluginManager.register(plugin1);
      await pluginManager.register(plugin2);
      await pluginManager.initializeAll(context);
      await pluginManager.startAll();
      await pluginManager.stopAll();
      await pluginManager.destroyAll();

      assert.equal(plugin1.lifecycle.destroyed, true);
      assert.equal(plugin2.lifecycle.destroyed, true);
      assertLength(pluginManager.getAll(), 0);
    });
  });

  describe('Service Integration', () => {
    it('should register services in context', async () => {
      const service = new SampleService('test-service');
      context.registerService('test-service', service);

      const registered = context.getService('test-service');
      assert.equal(registered, service);
    });

    it('should allow plugins to access services', async () => {
      const service = new SampleService('storage-service');
      context.registerService('storage-service', service);

      const plugin = new SamplePlugin({ name: 'test-plugin' });
      await pluginManager.register(plugin);
      await pluginManager.initializeAll(context);

      const storageService = plugin.context.getService('storage-service');
      assert.equal(storageService, service);
    });

    it('should allow services to communicate through plugins', async () => {
      const storageService = new SampleService('storage');
      const loggerService = new SampleService('logger');

      context.registerService('storage', storageService);
      context.registerService('logger', loggerService);

      const plugin = new SamplePlugin({ name: 'coordinator' });
      await pluginManager.register(plugin);
      await pluginManager.initializeAll(context);

      // Plugin can access both services
      await storageService.set('key1', 'value1');
      const value = await storageService.get('key1');

      assert.equal(value, 'value1');
    });
  });

  describe('Error Handling', () => {
    it('should handle initialization errors gracefully', async () => {
      const errorPlugin = new SamplePlugin({
        name: 'error-plugin',
        data: { throwOnInit: true },
      });

      await pluginManager.register(errorPlugin);

      await assert.rejects(
        async () => await pluginManager.initializeAll(context),
        { message: 'Initialization failed' }
      );
    });

    it('should continue with other plugins if one fails to start', async () => {
      const goodPlugin = new SamplePlugin({ name: 'good-plugin' });
      const errorPlugin = new SamplePlugin({
        name: 'error-plugin',
        data: { throwOnStart: true },
      });

      await pluginManager.register(goodPlugin);
      await pluginManager.register(errorPlugin);
      await pluginManager.initializeAll(context);

      // Start all and catch errors
      try {
        await pluginManager.startAll();
      } catch (error) {
        // Expected
      }

      // Good plugin should still be started
      assert.equal(goodPlugin.lifecycle.started, true);
    });
  });

  describe('Plugin Data Sharing', () => {
    it('should allow plugins to share data through context', async () => {
      const plugin1 = new SamplePlugin({ name: 'producer' });
      const plugin2 = new SamplePlugin({ name: 'consumer' });

      await pluginManager.register(plugin1);
      await pluginManager.register(plugin2);
      await pluginManager.initializeAll(context);

      // Producer sets data
      plugin1.setData('shared', 'test-value');

      // Consumer can access through context
      const sharedData = plugin1.getData('shared');
      assert.equal(sharedData, 'test-value');
    });
  });
});
