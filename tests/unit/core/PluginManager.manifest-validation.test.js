/**
 * PluginManager - Minimal Manifest Validation Tests
 * Tests essential manifest validation functionality
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const PluginManager = require('../../../app/core/PluginManager');
const BasePlugin = require('../../../app/plugins/BasePlugin');

// Test plugin
class TestPlugin extends BasePlugin {
  async onActivate() {}
  async onDeactivate() {}
}

describe('PluginManager - Manifest Validation', () => {
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

  describe('Basic Validation', () => {
    it('should accept valid manifest with all fields', async () => {
      const manifest = {
        name: 'Test Plugin',
        version: '1.0.0',
        id: 'core.test',
        description: 'Test plugin',
        permissions: ['events:subscribe']
      };
      await manager.loadPlugin('test', TestPlugin, manifest);
      assert.ok(manager.getPlugin('test'));
    });

    it('should require name field', async () => {
      const manifest = {
        version: '1.0.0'
      };
      await assert.rejects(
        manager.loadPlugin('test', TestPlugin, manifest),
        /missing required fields name/
      );
    });

    it('should require version field', async () => {
      const manifest = {
        name: 'Test'
      };
      await assert.rejects(
        manager.loadPlugin('test', TestPlugin, manifest),
        /missing required fields version/
      );
    });

    it('should accept valid permission formats', async () => {
      const manifest = {
        name: 'Test',
        version: '1.0.0',
        permissions: ['events:subscribe', 'config:read', 'logging']
      };
      await manager.loadPlugin('test', TestPlugin, manifest);
      assert.ok(manager.getPlugin('test'));
    });

    it('should validate ID format if provided', async () => {
      const manifest = {
        name: 'Test',
        version: '1.0.0',
        id: 'invalid id with spaces'
      };
      await assert.rejects(
        manager.loadPlugin('test', TestPlugin, manifest),
        /Invalid id format/
      );
    });
  });
});
