const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const PluginAPI = require('../../../app/plugins/PluginAPI');

describe('PluginAPI', () => {
  let mockServices;
  let api;

  beforeEach(() => {
    mockServices = {
      eventBus: {
        on: () => () => {},
        emit: () => {}
      },
      config: {
        get: (key) => `value-${key}`,
        set: () => {}
      },
      logger: {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {}
      }
    };
  });

  describe('Permissions', () => {
    it('should allow access with correct permission', () => {
      api = new PluginAPI(mockServices, ['events:subscribe']);
      assert.doesNotThrow(() => {
        api.on('test', () => {});
      });
    });

    it('should deny access without permission', () => {
      api = new PluginAPI(mockServices, []);
      assert.throws(() => {
        api.on('test', () => {});
      }, /Permission denied/);
    });

    it('should allow all access with wildcard permission', () => {
      api = new PluginAPI(mockServices, ['*']);
      assert.doesNotThrow(() => {
        api.on('test', () => {});
        api.emit('test');
        api.getConfig('key');
        api.setConfig('key', 'value');
        api.log('info', 'message');
      });
    });
  });

  describe('Event Operations', () => {
    beforeEach(() => {
      api = new PluginAPI(mockServices, ['events:subscribe', 'events:emit']);
    });

    it('should subscribe to events', () => {
      let called = false;
      mockServices.eventBus.on = (event, handler) => {
        called = true;
        return () => {};
      };
      api.on('test', () => {});
      assert.strictEqual(called, true);
    });

    it('should emit events', () => {
      let emitted = false;
      mockServices.eventBus.emit = () => { emitted = true; };
      api.emit('test', {});
      assert.strictEqual(emitted, true);
    });

    it('should track subscriptions for cleanup', () => {
      let unsubscribed = false;
      mockServices.eventBus.on = () => () => { unsubscribed = true; };
      api.on('test', () => {});
      api.cleanup();
      assert.strictEqual(unsubscribed, true);
    });
  });

  describe('Config Operations', () => {
    beforeEach(() => {
      api = new PluginAPI(mockServices, ['config:read', 'config:write']);
    });

    it('should get config', () => {
      const value = api.getConfig('test');
      assert.strictEqual(value, 'value-test');
    });

    it('should set config', () => {
      let setKey, setValue;
      mockServices.config.set = (key, value) => {
        setKey = key;
        setValue = value;
      };
      api.setConfig('test', 'newvalue');
      assert.strictEqual(setKey, 'test');
      assert.strictEqual(setValue, 'newvalue');
    });
  });

  describe('Logging', () => {
    beforeEach(() => {
      api = new PluginAPI(mockServices, ['logging']);
    });

    it('should log messages', () => {
      let logged = false;
      mockServices.logger.info = () => { logged = true; };
      api.log('info', 'test message');
      assert.strictEqual(logged, true);
    });

    it('should fallback to console if logger method not available', () => {
      api = new PluginAPI({ eventBus: {}, config: {}, logger: {} }, ['logging']);
      assert.doesNotThrow(() => {
        api.log('info', 'test');
      });
    });
  });

  describe('Cleanup', () => {
    it('should unsubscribe all event handlers', () => {
      api = new PluginAPI(mockServices, ['events:subscribe']);
      let unsubscribeCount = 0;
      mockServices.eventBus.on = () => () => { unsubscribeCount++; };

      api.on('test1', () => {});
      api.on('test2', () => {});
      api.cleanup();

      assert.strictEqual(unsubscribeCount, 2);
    });
  });
});
