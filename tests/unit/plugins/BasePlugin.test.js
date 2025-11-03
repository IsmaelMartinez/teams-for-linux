const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const BasePlugin = require('../../../app/plugins/BasePlugin');

// Test plugin implementation
class TestPlugin extends BasePlugin {
  constructor(id, manifest, api) {
    super(id, manifest, api);
    this.activateCount = 0;
    this.deactivateCount = 0;
  }

  async onActivate() {
    this.activateCount++;
  }

  async onDeactivate() {
    this.deactivateCount++;
  }
}

describe('BasePlugin', () => {
  let manifest;
  let mockAPI;

  beforeEach(() => {
    manifest = {
      name: 'Test Plugin',
      version: '1.0.0'
    };
    mockAPI = {
      cleanup: () => {}
    };
  });

  describe('Instantiation', () => {
    it('should not allow direct instantiation', () => {
      assert.throws(() => {
        new BasePlugin('test', manifest, mockAPI);
      }, TypeError);
    });

    it('should allow subclass instantiation', () => {
      const plugin = new TestPlugin('test', manifest, mockAPI);
      assert.ok(plugin instanceof BasePlugin);
    });
  });

  describe('Properties', () => {
    it('should expose plugin ID', () => {
      const plugin = new TestPlugin('test-id', manifest, mockAPI);
      assert.strictEqual(plugin.id, 'test-id');
    });

    it('should expose manifest', () => {
      const plugin = new TestPlugin('test', manifest, mockAPI);
      assert.deepStrictEqual(plugin.manifest, manifest);
    });

    it('should expose API', () => {
      const plugin = new TestPlugin('test', manifest, mockAPI);
      assert.strictEqual(plugin.api, mockAPI);
    });

    it('should start inactive', () => {
      const plugin = new TestPlugin('test', manifest, mockAPI);
      assert.strictEqual(plugin.isActive, false);
    });
  });

  describe('Activation', () => {
    it('should activate plugin', async () => {
      const plugin = new TestPlugin('test', manifest, mockAPI);
      await plugin.activate();
      assert.strictEqual(plugin.isActive, true);
      assert.strictEqual(plugin.activateCount, 1);
    });

    it('should throw if already active', async () => {
      const plugin = new TestPlugin('test', manifest, mockAPI);
      await plugin.activate();
      await assert.rejects(
        plugin.activate(),
        /already active/
      );
    });
  });

  describe('Deactivation', () => {
    it('should deactivate plugin', async () => {
      const plugin = new TestPlugin('test', manifest, mockAPI);
      await plugin.activate();
      await plugin.deactivate();
      assert.strictEqual(plugin.isActive, false);
      assert.strictEqual(plugin.deactivateCount, 1);
    });

    it('should throw if not active', async () => {
      const plugin = new TestPlugin('test', manifest, mockAPI);
      await assert.rejects(
        plugin.deactivate(),
        /not active/
      );
    });
  });

  describe('Destruction', () => {
    it('should deactivate before destroying if active', async () => {
      const plugin = new TestPlugin('test', manifest, mockAPI);
      await plugin.activate();
      await plugin.destroy();
      assert.strictEqual(plugin.isActive, false);
      assert.strictEqual(plugin.deactivateCount, 1);
    });

    it('should cleanup API', async () => {
      let cleaned = false;
      mockAPI.cleanup = () => { cleaned = true; };
      const plugin = new TestPlugin('test', manifest, mockAPI);
      await plugin.destroy();
      assert.strictEqual(cleaned, true);
    });

    it('should not throw if API has no cleanup', async () => {
      const plugin = new TestPlugin('test', manifest, {});
      await assert.doesNotReject(plugin.destroy());
    });
  });

  describe('Abstract Methods', () => {
    class IncompletePlugin extends BasePlugin {}

    it('should throw if onActivate not implemented', async () => {
      const plugin = new IncompletePlugin('test', manifest, mockAPI);
      await assert.rejects(
        plugin.onActivate(),
        /must be implemented/
      );
    });

    it('should throw if onDeactivate not implemented', async () => {
      const plugin = new IncompletePlugin('test', manifest, mockAPI);
      await assert.rejects(
        plugin.onDeactivate(),
        /must be implemented/
      );
    });
  });
});
