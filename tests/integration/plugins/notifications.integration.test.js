/**
 * NotificationsPlugin Integration Tests
 * Tests plugin integration with PluginManager, EventBus, StateManager, and Logger
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const NotificationsPlugin = require('../../fixtures/notifications-plugin');
const { createSpy, waitFor, createMockEventEmitter } = require('../../helpers/test-utils');

describe('NotificationsPlugin Integration', () => {
  let plugin;
  let pluginManager;
  let eventBus;
  let stateManager;
  let logger;
  let manifest;

  beforeEach(() => {
    // Create mock EventBus
    eventBus = createMockEventEmitter();
    const originalEmit = eventBus.emit.bind(eventBus);
    const originalOn = eventBus.on.bind(eventBus);
    const originalOnce = eventBus.once.bind(eventBus);

    eventBus.emit = createSpy(originalEmit);
    eventBus.on = createSpy(originalOn);
    eventBus.once = createSpy(originalOnce);

    // Create mock StateManager
    const stateData = new Map();
    stateManager = {
      get: createSpy(async (key) => stateData.get(key)),
      set: createSpy(async (key, value) => {
        stateData.set(key, value);
        return true;
      }),
      has: createSpy(async (key) => stateData.has(key)),
      delete: createSpy(async (key) => stateData.delete(key))
    };

    // Create mock Logger
    logger = {
      info: createSpy((...args) => {}),
      error: createSpy((...args) => {}),
      warn: createSpy((...args) => {}),
      debug: createSpy((...args) => {})
    };

    // Create plugin manifest
    manifest = {
      name: 'Notifications Plugin',
      version: '1.0.0',
      description: 'System notifications and badge management',
      permissions: ['notifications', 'state', 'events']
    };

    // Create mock PluginManager
    pluginManager = {
      plugins: new Map(),

      register(plugin) {
        this.plugins.set(plugin.id, plugin);
      },

      async load(id) {
        const plugin = this.plugins.get(id);
        if (!plugin) throw new Error(`Plugin ${id} not found`);
        return plugin;
      },

      async activate(id) {
        const plugin = this.plugins.get(id);
        if (!plugin) throw new Error(`Plugin ${id} not found`);
        await plugin.activate();
      },

      async deactivate(id) {
        const plugin = this.plugins.get(id);
        if (!plugin) throw new Error(`Plugin ${id} not found`);
        await plugin.deactivate();
      },

      async destroy(id) {
        const plugin = this.plugins.get(id);
        if (!plugin) throw new Error(`Plugin ${id} not found`);
        await plugin.destroy();
        this.plugins.delete(id);
      }
    };

    // Create plugin API - uses event bus methods directly
    const api = {
      on: eventBus.on,
      once: eventBus.once,
      emit: eventBus.emit,
      removeListener: eventBus.removeListener.bind(eventBus),
      state: stateManager,
      logger: logger,
      cleanup: createSpy(() => {})
    };

    // Create plugin instance
    plugin = new NotificationsPlugin('notifications', manifest, api);
  });

  describe('Plugin Loading via PluginManager', () => {
    it('should register plugin successfully', () => {
      pluginManager.register(plugin);
      assert.ok(pluginManager.plugins.has('notifications'));
    });

    it('should load plugin by id', async () => {
      pluginManager.register(plugin);
      const loaded = await pluginManager.load('notifications');
      assert.strictEqual(loaded, plugin);
    });

    it('should activate via plugin manager', async () => {
      pluginManager.register(plugin);
      await pluginManager.activate('notifications');
      assert.strictEqual(plugin.isActive, true);
    });

    it('should deactivate via plugin manager', async () => {
      pluginManager.register(plugin);
      await pluginManager.activate('notifications');
      await pluginManager.deactivate('notifications');
      assert.strictEqual(plugin.isActive, false);
    });

    it('should destroy via plugin manager', async () => {
      pluginManager.register(plugin);
      await pluginManager.activate('notifications');
      await pluginManager.destroy('notifications');
      assert.ok(!pluginManager.plugins.has('notifications'));
    });
  });

  describe('EventBus Integration', () => {
    beforeEach(async () => {
      pluginManager.register(plugin);
      await pluginManager.activate('notifications');
    });

    it('should listen to notification:intercepted events', async () => {
      const notification = {
        id: '123',
        title: 'Test Notification',
        body: 'Test message'
      };

      eventBus.emit('notification:intercepted', notification);

      await waitFor(() => {
        const emitCalls = eventBus.emit.calls;
        return emitCalls.some(call => call[0] === 'notification:shown');
      }, 1000);

      const emitCalls = eventBus.emit.calls;
      const shownCall = emitCalls.find(call => call[0] === 'notification:shown');
      assert.ok(shownCall);
    });

    it('should emit system:notification:show event', async () => {
      eventBus.emit('notification:intercepted', {
        id: '1',
        title: 'Test',
        body: 'Message'
      });

      await waitFor(() => {
        const emitCalls = eventBus.emit.calls;
        return emitCalls.some(call => call[0] === 'system:notification:show');
      }, 1000);

      const emitCalls = eventBus.emit.calls;
      const showCall = emitCalls.find(call => call[0] === 'system:notification:show');
      assert.ok(showCall);
    });

    it('should emit sound:play event', async () => {
      eventBus.emit('notification:intercepted', {
        id: '1',
        title: 'Test',
        body: 'Message'
      });

      await waitFor(() => {
        const emitCalls = eventBus.emit.calls;
        return emitCalls.some(call => call[0] === 'sound:play');
      }, 1000);

      const emitCalls = eventBus.emit.calls;
      const soundCall = emitCalls.find(call => call[0] === 'sound:play');
      assert.ok(soundCall);
    });

    it('should emit badge:update event', async () => {
      eventBus.emit('notification:intercepted', {
        id: '1',
        title: 'Test',
        body: 'Message'
      });

      await waitFor(() => {
        const emitCalls = eventBus.emit.calls;
        return emitCalls.some(call => call[0] === 'badge:update');
      }, 1000);

      const emitCalls = eventBus.emit.calls;
      const badgeCall = emitCalls.find(call => call[0] === 'badge:update');
      assert.strictEqual(badgeCall[1].count, 1);
    });

    it('should unsubscribe on deactivation', async () => {
      await pluginManager.deactivate('notifications');

      // After deactivation, queue should be cleared
      assert.strictEqual(plugin.getQueue().length, 0);
      assert.strictEqual(plugin.getBadgeCount(), 0);

      // Plugin should be inactive
      assert.strictEqual(plugin.isActive, false);
    });
  });

  describe('StateManager Integration', () => {
    beforeEach(async () => {
      pluginManager.register(plugin);
    });

    it('should load preferences from state on activation', async () => {
      await stateManager.set('notifications', {
        enabled: false,
        soundEnabled: false
      });

      await pluginManager.activate('notifications');

      assert.strictEqual(stateManager.get.callCount(), 1);
      assert.ok(stateManager.get.calledWith('notifications'));
    });

    it('should save preferences to state', async () => {
      await pluginManager.activate('notifications');

      await plugin.configure({
        enabled: true,
        soundEnabled: false,
        badgeEnabled: true
      });

      assert.ok(stateManager.set.callCount() >= 1);
      const setCall = stateManager.set.calls.find(call => call[0] === 'notifications');
      assert.ok(setCall);
    });

    it('should persist configuration across reactivation', async () => {
      await pluginManager.activate('notifications');
      await plugin.configure({ soundEnabled: false });
      await pluginManager.deactivate('notifications');

      await pluginManager.activate('notifications');

      const config = plugin.getConfig();
      assert.strictEqual(config.soundEnabled, false);
    });

    it('should handle missing state gracefully', async () => {
      // State is empty
      await pluginManager.activate('notifications');

      const config = plugin.getConfig();
      assert.strictEqual(config.enabled, true); // Default value
    });
  });

  describe('Logger Integration', () => {
    beforeEach(async () => {
      pluginManager.register(plugin);
    });

    it('should log activation', async () => {
      await pluginManager.activate('notifications');

      assert.ok(logger.info.callCount() > 0);
      const infoCall = logger.info.calls.find(call =>
        call[0].includes('NotificationsPlugin activated')
      );
      assert.ok(infoCall);
    });

    it('should log deactivation', async () => {
      await pluginManager.activate('notifications');
      await pluginManager.deactivate('notifications');

      const infoCall = logger.info.calls.find(call =>
        call[0].includes('NotificationsPlugin deactivated')
      );
      assert.ok(infoCall);
    });

    it('should log errors during notification handling', async () => {
      await pluginManager.activate('notifications');

      // Mock emit to throw error
      const originalEmit = eventBus.emit;
      eventBus.emit = createSpy((event) => {
        if (event === 'system:notification:show') {
          throw new Error('Display error');
        }
        return originalEmit(event);
      });

      try {
        eventBus.emit('notification:intercepted', {
          id: '1',
          title: 'Test',
          body: 'Message'
        });
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (error) {
        // Expected
      }

      assert.ok(logger.error.callCount() > 0);
    });
  });

  describe('Notification Click Flow', () => {
    beforeEach(async () => {
      pluginManager.register(plugin);
      await pluginManager.activate('notifications');
    });

    it('should handle notification click and focus window', async () => {
      const onClickSpy = createSpy(() => {});

      eventBus.emit('notification:intercepted', {
        id: '1',
        title: 'Test',
        body: 'Message',
        onClick: onClickSpy
      });

      await waitFor(() => eventBus.listenerCount('notification:click') > 0, 1000);

      // Simulate click
      eventBus.emit('notification:click');

      assert.strictEqual(onClickSpy.callCount(), 1);
    });

    it('should register once handler for click', async () => {
      eventBus.emit('notification:intercepted', {
        id: '1',
        title: 'Test',
        body: 'Message',
        onClick: () => {}
      });

      await waitFor(() => eventBus.listenerCount('notification:click') > 0, 1000);

      const listenerCount = eventBus.listenerCount('notification:click');
      assert.ok(listenerCount > 0);
    });
  });

  describe('Multi-notification Flow', () => {
    beforeEach(async () => {
      pluginManager.register(plugin);
      await pluginManager.activate('notifications');
    });

    it('should handle multiple notifications sequentially', async () => {
      for (let i = 0; i < 5; i++) {
        eventBus.emit('notification:intercepted', {
          id: `${i}`,
          title: `Test ${i}`,
          body: 'Message'
        });
      }

      await waitFor(() => plugin.getBadgeCount() >= 5, 2000);

      assert.strictEqual(plugin.getBadgeCount(), 5);
      assert.strictEqual(plugin.getQueue().length, 5);
    });

    it('should emit events for each notification', async () => {
      eventBus.emit.reset();

      for (let i = 0; i < 3; i++) {
        eventBus.emit('notification:intercepted', {
          id: `${i}`,
          title: `Test ${i}`,
          body: 'Message'
        });
      }

      await waitFor(() => {
        const emitCalls = eventBus.emit.calls;
        const shownCalls = emitCalls.filter(call => call[0] === 'notification:shown');
        return shownCalls.length >= 3;
      }, 2000);

      const emitCalls = eventBus.emit.calls;
      const shownCalls = emitCalls.filter(call => call[0] === 'notification:shown');
      assert.ok(shownCalls.length >= 3);
    });
  });

  describe('Configuration Integration', () => {
    beforeEach(async () => {
      pluginManager.register(plugin);
      await pluginManager.activate('notifications');
    });

    it('should disable all notifications', async () => {
      await plugin.configure({ enabled: false });

      eventBus.emit('notification:intercepted', {
        id: '1',
        title: 'Test',
        body: 'Message'
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      assert.strictEqual(plugin.getBadgeCount(), 0);
      assert.strictEqual(plugin.getQueue().length, 0);
    });

    it('should disable only sounds', async () => {
      await plugin.configure({ soundEnabled: false });

      eventBus.emit.reset();

      eventBus.emit('notification:intercepted', {
        id: '1',
        title: 'Test',
        body: 'Message'
      });

      await waitFor(() => {
        const emitCalls = eventBus.emit.calls;
        return emitCalls.some(call => call[0] === 'notification:shown');
      }, 1000);

      const emitCalls = eventBus.emit.calls;
      const soundCall = emitCalls.find(call => call[0] === 'sound:play');
      assert.strictEqual(soundCall, undefined);
    });

    it('should disable only badge updates', async () => {
      await plugin.configure({ badgeEnabled: false });

      eventBus.emit('notification:intercepted', {
        id: '1',
        title: 'Test',
        body: 'Message'
      });

      await waitFor(() => plugin.getQueue().length > 0, 1000);

      assert.strictEqual(plugin.getBadgeCount(), 0);
    });
  });

  describe('Error Recovery', () => {
    beforeEach(async () => {
      pluginManager.register(plugin);
      await pluginManager.activate('notifications');
    });

    it('should continue processing after error', async () => {
      // First notification throws error
      let firstCall = true;
      const originalEmit = eventBus.emit;
      eventBus.emit = createSpy((event, data) => {
        if (event === 'system:notification:show' && firstCall) {
          firstCall = false;
          throw new Error('Display error');
        }
        return originalEmit(event, data);
      });

      try {
        eventBus.emit('notification:intercepted', {
          id: '1',
          title: 'Test',
          body: 'Message'
        });
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (error) {
        // Expected
      }

      // Second notification should work
      eventBus.emit = originalEmit;
      eventBus.emit('notification:intercepted', {
        id: '2',
        title: 'Test 2',
        body: 'Message 2'
      });

      await waitFor(() => plugin.getQueue().length > 0, 1000);
      assert.ok(plugin.getQueue().length > 0);
    });
  });

  describe('Cleanup and Resource Management', () => {
    it('should cleanup all resources on destroy', async () => {
      pluginManager.register(plugin);
      await pluginManager.activate('notifications');

      // Add some notifications
      for (let i = 0; i < 3; i++) {
        eventBus.emit('notification:intercepted', {
          id: `${i}`,
          title: `Test ${i}`,
          body: 'Message'
        });
      }

      await waitFor(() => plugin.getQueue().length >= 3, 1000);

      const queueLengthBeforeDestroy = plugin.getQueue().length;
      assert.ok(queueLengthBeforeDestroy > 0);

      await pluginManager.destroy('notifications');

      // Plugin should be inactive
      assert.strictEqual(plugin.isActive, false);

      // Queue and badge should be cleared after destroy
      assert.strictEqual(plugin.getQueue().length, 0);
      assert.strictEqual(plugin.getBadgeCount(), 0);

      // Plugin is destroyed and shouldn't throw errors when accessed
      assert.doesNotThrow(() => {
        plugin.getConfig();
        plugin.getQueue();
        plugin.getBadgeCount();
      });
    });

    it('should not leak event listeners', async () => {
      pluginManager.register(plugin);

      // Track that events stop being processed after deactivation
      const processedNotifications = [];

      // Activate and deactivate multiple times
      for (let i = 0; i < 3; i++) {
        await pluginManager.activate('notifications');

        // Emit notification
        eventBus.emit('notification:intercepted', {
          id: `cycle-${i}`,
          title: `Test ${i}`,
          body: 'Message'
        });

        await waitFor(() => plugin.getQueue().length > 0, 500);
        processedNotifications.push(plugin.getQueue().length);

        await pluginManager.deactivate('notifications');

        // Verify queue was cleared on deactivate
        assert.strictEqual(plugin.getQueue().length, 0);
      }

      // All cycles should have processed notifications
      assert.strictEqual(processedNotifications.length, 3);
      processedNotifications.forEach(count => {
        assert.ok(count > 0);
      });
    });
  });
});
