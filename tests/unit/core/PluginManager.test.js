const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const PluginManager = require('../../../app/core/PluginManager');
const BasePlugin = require('../../../app/plugins/BasePlugin');

// Test plugin
class TestPlugin extends BasePlugin {
  async onActivate() {}
  async onDeactivate() {}
}

describe('PluginManager', () => {
  let manager;
  let mockServices;

  beforeEach(() => {
    mockServices = {
      eventBus: {
        on: () => () => {},
        emit: () => {}
      },
      config: {
        get: () => {},
        set: () => {}
      },
      logger: console
    };
    manager = new PluginManager(mockServices);
  });

  describe('Plugin Loading', () => {
    it('should load plugin', async () => {
      const manifest = { name: 'Test', version: '1.0.0' };
      await manager.loadPlugin('test', TestPlugin, manifest);
      const plugin = manager.getPlugin('test');
      assert.ok(plugin instanceof TestPlugin);
    });

    it('should throw if plugin already loaded', async () => {
      const manifest = { name: 'Test', version: '1.0.0' };
      await manager.loadPlugin('test', TestPlugin, manifest);
      await assert.rejects(
        manager.loadPlugin('test', TestPlugin, manifest),
        /already loaded/
      );
    });

    it('should validate manifest', async () => {
      await assert.rejects(
        manager.loadPlugin('test', TestPlugin, {}),
        /Invalid manifest/
      );
    });

    it('should validate version format', async () => {
      const manifest = { name: 'Test', version: 'invalid' };
      await assert.rejects(
        manager.loadPlugin('test', TestPlugin, manifest),
        /Invalid version format/
      );
    });

    it('should verify plugin extends BasePlugin', async () => {
      class InvalidPlugin {}
      const manifest = { name: 'Test', version: '1.0.0' };
      await assert.rejects(
        manager.loadPlugin('test', InvalidPlugin, manifest),
        /must extend BasePlugin/
      );
    });
  });

  describe('Plugin Activation', () => {
    beforeEach(async () => {
      const manifest = { name: 'Test', version: '1.0.0' };
      await manager.loadPlugin('test', TestPlugin, manifest);
    });

    it('should activate plugin', async () => {
      await manager.activatePlugin('test');
      const plugin = manager.getPlugin('test');
      assert.strictEqual(plugin.isActive, true);
    });

    it('should throw if plugin not loaded', async () => {
      await assert.rejects(
        manager.activatePlugin('nonexistent'),
        /not loaded/
      );
    });

    it('should throw if already active', async () => {
      await manager.activatePlugin('test');
      await assert.rejects(
        manager.activatePlugin('test'),
        /already active/
      );
    });

    it('should activate dependencies first', async () => {
      const depManifest = { name: 'Dependency', version: '1.0.0' };
      const pluginManifest = {
        name: 'Plugin',
        version: '1.0.0',
        dependencies: ['dep']
      };

      await manager.loadPlugin('dep', TestPlugin, depManifest);
      await manager.loadPlugin('plugin', TestPlugin, pluginManifest);
      await manager.activatePlugin('plugin');

      const dep = manager.getPlugin('dep');
      assert.strictEqual(dep.isActive, true);
    });

    it('should throw if dependency missing', async () => {
      const manifest = {
        name: 'Plugin',
        version: '1.0.0',
        dependencies: ['missing']
      };

      await manager.loadPlugin('plugin', TestPlugin, manifest);
      await assert.rejects(
        manager.activatePlugin('plugin'),
        /Missing dependency/
      );
    });
  });

  describe('Plugin Deactivation', () => {
    beforeEach(async () => {
      const manifest = { name: 'Test', version: '1.0.0' };
      await manager.loadPlugin('test', TestPlugin, manifest);
      await manager.activatePlugin('test');
    });

    it('should deactivate plugin', async () => {
      await manager.deactivatePlugin('test');
      const plugin = manager.getPlugin('test');
      assert.strictEqual(plugin.isActive, false);
    });

    it('should throw if plugin not loaded', async () => {
      await assert.rejects(
        manager.deactivatePlugin('nonexistent'),
        /not loaded/
      );
    });

    it('should throw if not active', async () => {
      await manager.deactivatePlugin('test');
      await assert.rejects(
        manager.deactivatePlugin('test'),
        /not active/
      );
    });
  });

  describe('Plugin Unloading', () => {
    beforeEach(async () => {
      const manifest = { name: 'Test', version: '1.0.0' };
      await manager.loadPlugin('test', TestPlugin, manifest);
    });

    it('should unload plugin', async () => {
      await manager.unloadPlugin('test');
      const plugin = manager.getPlugin('test');
      assert.strictEqual(plugin, undefined);
    });

    it('should deactivate before unloading if active', async () => {
      await manager.activatePlugin('test');
      await manager.unloadPlugin('test');
      const plugin = manager.getPlugin('test');
      assert.strictEqual(plugin, undefined);
    });

    it('should throw if plugin not loaded', async () => {
      await assert.rejects(
        manager.unloadPlugin('nonexistent'),
        /not loaded/
      );
    });
  });

  describe('Plugin Queries', () => {
    it('should get all plugins', async () => {
      const manifest1 = { name: 'Test1', version: '1.0.0' };
      const manifest2 = { name: 'Test2', version: '1.0.0' };
      await manager.loadPlugin('test1', TestPlugin, manifest1);
      await manager.loadPlugin('test2', TestPlugin, manifest2);

      const plugins = manager.getPlugins();
      assert.strictEqual(plugins.length, 2);
    });

    it('should get active plugins only', async () => {
      const manifest1 = { name: 'Test1', version: '1.0.0' };
      const manifest2 = { name: 'Test2', version: '1.0.0' };
      await manager.loadPlugin('test1', TestPlugin, manifest1);
      await manager.loadPlugin('test2', TestPlugin, manifest2);
      await manager.activatePlugin('test1');

      const activePlugins = manager.getActivePlugins();
      assert.strictEqual(activePlugins.length, 1);
      assert.strictEqual(activePlugins[0].id, 'test1');
    });
  });

  describe('State Persistence', () => {
    it('should get plugin state', async () => {
      const manifest = { name: 'Test', version: '1.0.0' };
      await manager.loadPlugin('test', TestPlugin, manifest);
      await manager.activatePlugin('test');

      const state = manager.getState();
      assert.ok(state.test);
      assert.strictEqual(state.test.active, true);
    });

    it('should restore plugin state', () => {
      const state = {
        test: { active: true, activatedAt: Date.now() }
      };
      manager.restoreState(state);
      const restoredState = manager.getState();
      assert.deepStrictEqual(restoredState, state);
    });
  });
});
