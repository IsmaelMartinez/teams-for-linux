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

  describe('ID Validation', () => {
    it('should accept valid plugin ID', async () => {
      const manifest = {
        name: 'Test',
        version: '1.0.0',
        id: 'core.notifications'
      };
      await manager.loadPlugin('test', TestPlugin, manifest);
      assert.ok(manager.getPlugin('test'));
    });

    it('should reject invalid ID format (spaces)', async () => {
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

    it('should reject invalid ID format (special chars)', async () => {
      const manifest = {
        name: 'Test',
        version: '1.0.0',
        id: 'invalid@id!'
      };
      await assert.rejects(
        manager.loadPlugin('test', TestPlugin, manifest),
        /Invalid id format/
      );
    });

    it('should reject empty ID', async () => {
      const manifest = {
        name: 'Test',
        version: '1.0.0',
        id: ''
      };
      await assert.rejects(
        manager.loadPlugin('test', TestPlugin, manifest),
        /id must be a non-empty string/
      );
    });
  });

  describe('Description Validation', () => {
    it('should accept valid description', async () => {
      const manifest = {
        name: 'Test',
        version: '1.0.0',
        description: 'A test plugin for validation'
      };
      await manager.loadPlugin('test', TestPlugin, manifest);
      assert.ok(manager.getPlugin('test'));
    });

    it('should reject empty description', async () => {
      const manifest = {
        name: 'Test',
        version: '1.0.0',
        description: ''
      };
      await assert.rejects(
        manager.loadPlugin('test', TestPlugin, manifest),
        /description must be a non-empty string/
      );
    });

    it('should reject description that is too long', async () => {
      const manifest = {
        name: 'Test',
        version: '1.0.0',
        description: 'a'.repeat(501)
      };
      await assert.rejects(
        manager.loadPlugin('test', TestPlugin, manifest),
        /description too long/
      );
    });
  });

  describe('Permissions Validation', () => {
    it('should accept valid permissions', async () => {
      const manifest = {
        name: 'Test',
        version: '1.0.0',
        permissions: ['events:emit', 'config:read', 'logging']
      };
      await manager.loadPlugin('test', TestPlugin, manifest);
      assert.ok(manager.getPlugin('test'));
    });

    it('should accept wildcard permission', async () => {
      const manifest = {
        name: 'Test',
        version: '1.0.0',
        permissions: ['*']
      };
      await manager.loadPlugin('test', TestPlugin, manifest);
      assert.ok(manager.getPlugin('test'));
    });

    it('should reject non-array permissions', async () => {
      const manifest = {
        name: 'Test',
        version: '1.0.0',
        permissions: 'events:emit'
      };
      await assert.rejects(
        manager.loadPlugin('test', TestPlugin, manifest),
        /permissions must be an array/
      );
    });

    it('should reject invalid permission format', async () => {
      const manifest = {
        name: 'Test',
        version: '1.0.0',
        permissions: ['invalid@permission!']
      };
      await assert.rejects(
        manager.loadPlugin('test', TestPlugin, manifest),
        /Invalid permission format/
      );
    });

    it('should reject non-string permission', async () => {
      const manifest = {
        name: 'Test',
        version: '1.0.0',
        permissions: [123]
      };
      await assert.rejects(
        manager.loadPlugin('test', TestPlugin, manifest),
        /Permission at index 0 must be a string/
      );
    });
  });

  describe('Dependencies Validation', () => {
    it('should accept valid dependencies', async () => {
      const manifest = {
        name: 'Test',
        version: '1.0.0',
        dependencies: ['core.auth', 'core.storage']
      };
      await manager.loadPlugin('test', TestPlugin, manifest);
      assert.ok(manager.getPlugin('test'));
    });

    it('should reject non-array dependencies', async () => {
      const manifest = {
        name: 'Test',
        version: '1.0.0',
        dependencies: 'core.auth'
      };
      await assert.rejects(
        manager.loadPlugin('test', TestPlugin, manifest),
        /dependencies must be an array/
      );
    });

    it('should reject empty dependency string', async () => {
      const manifest = {
        name: 'Test',
        version: '1.0.0',
        dependencies: ['core.auth', '']
      };
      await assert.rejects(
        manager.loadPlugin('test', TestPlugin, manifest),
        /Dependency at index 1 must be a non-empty string/
      );
    });
  });

  describe('Entry Points Validation', () => {
    it('should accept valid entry points', async () => {
      const manifest = {
        name: 'Test',
        version: '1.0.0',
        entryPoints: {
          main: './index.js',
          preload: './preload.js'
        }
      };
      await manager.loadPlugin('test', TestPlugin, manifest);
      assert.ok(manager.getPlugin('test'));
    });

    it('should reject non-object entryPoints', async () => {
      const manifest = {
        name: 'Test',
        version: '1.0.0',
        entryPoints: './index.js'
      };
      await assert.rejects(
        manager.loadPlugin('test', TestPlugin, manifest),
        /entryPoints must be an object/
      );
    });

    it('should reject invalid entry point name', async () => {
      const manifest = {
        name: 'Test',
        version: '1.0.0',
        entryPoints: {
          invalid: './index.js'
        }
      };
      await assert.rejects(
        manager.loadPlugin('test', TestPlugin, manifest),
        /Invalid entry point: invalid/
      );
    });

    it('should reject entry point without relative path', async () => {
      const manifest = {
        name: 'Test',
        version: '1.0.0',
        entryPoints: {
          main: 'index.js'
        }
      };
      await assert.rejects(
        manager.loadPlugin('test', TestPlugin, manifest),
        /must be a relative path/
      );
    });

    it('should reject entry point without .js extension', async () => {
      const manifest = {
        name: 'Test',
        version: '1.0.0',
        entryPoints: {
          main: './index.ts'
        }
      };
      await assert.rejects(
        manager.loadPlugin('test', TestPlugin, manifest),
        /must be a JavaScript file/
      );
    });
  });

  describe('Metadata Validation', () => {
    it('should accept valid metadata', async () => {
      const manifest = {
        name: 'Test',
        version: '1.0.0',
        author: 'Test Author',
        license: 'MIT',
        repository: 'https://github.com/user/repo'
      };
      await manager.loadPlugin('test', TestPlugin, manifest);
      assert.ok(manager.getPlugin('test'));
    });

    it('should accept repository as object', async () => {
      const manifest = {
        name: 'Test',
        version: '1.0.0',
        repository: {
          type: 'git',
          url: 'https://github.com/user/repo'
        }
      };
      await manager.loadPlugin('test', TestPlugin, manifest);
      assert.ok(manager.getPlugin('test'));
    });

    it('should reject invalid author type', async () => {
      const manifest = {
        name: 'Test',
        version: '1.0.0',
        author: 123
      };
      await assert.rejects(
        manager.loadPlugin('test', TestPlugin, manifest),
        /author must be a string/
      );
    });

    it('should reject invalid license type', async () => {
      const manifest = {
        name: 'Test',
        version: '1.0.0',
        license: true
      };
      await assert.rejects(
        manager.loadPlugin('test', TestPlugin, manifest),
        /license must be a string/
      );
    });

    it('should reject repository object without url', async () => {
      const manifest = {
        name: 'Test',
        version: '1.0.0',
        repository: { type: 'git' }
      };
      await assert.rejects(
        manager.loadPlugin('test', TestPlugin, manifest),
        /repository object must contain a url field/
      );
    });
  });

  describe('Complete Manifest', () => {
    it('should accept complete valid manifest', async () => {
      const manifest = {
        id: 'core.notifications',
        name: 'Notifications Plugin',
        version: '1.0.0',
        description: 'Handles Teams notifications',
        author: 'Teams for Linux',
        license: 'MIT',
        repository: 'https://github.com/IsmaelMartinez/teams-for-linux',
        permissions: [
          'notifications:show',
          'events:emit',
          'config:read'
        ],
        dependencies: [],
        entryPoints: {
          main: './index.js',
          preload: './preload.js'
        }
      };
      await manager.loadPlugin('test', TestPlugin, manifest);
      const plugin = manager.getPlugin('test');
      assert.ok(plugin);
      assert.strictEqual(plugin.manifest.id, 'core.notifications');
    });
  });
});
