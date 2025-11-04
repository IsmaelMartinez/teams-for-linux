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

  describe('Event Operations', () => {
    beforeEach(() => {
      api = new PluginAPI(mockServices);
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
      api = new PluginAPI(mockServices);
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
      api = new PluginAPI(mockServices);
    });

    it('should log messages', () => {
      let logged = false;
      mockServices.logger.info = () => { logged = true; };
      api.log('info', 'test message');
      assert.strictEqual(logged, true);
    });

    it('should fallback to console if logger method not available', () => {
      api = new PluginAPI({ eventBus: {}, config: {}, logger: {} });
      assert.doesNotThrow(() => {
        api.log('info', 'test');
      });
    });
  });

  describe('Cleanup', () => {
    it('should unsubscribe all event handlers', () => {
      api = new PluginAPI(mockServices);
      let unsubscribeCount = 0;
      mockServices.eventBus.on = () => () => { unsubscribeCount++; };

      api.on('test1', () => {});
      api.on('test2', () => {});
      api.cleanup();

      assert.strictEqual(unsubscribeCount, 2);
    });
  });
});
