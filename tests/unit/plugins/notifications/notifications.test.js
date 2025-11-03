/**
 * NotificationsPlugin Unit Tests
 * Comprehensive testing of notification plugin functionality
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const NotificationsPlugin = require('../../../fixtures/notifications-plugin');
const { createSpy, waitFor, createDeferred } = require('../../../helpers/test-utils');

describe('NotificationsPlugin', () => {
  let plugin;
  let mockAPI;
  let manifest;
  let eventHandlers;

  beforeEach(() => {
    eventHandlers = new Map();

    manifest = {
      name: 'Notifications Plugin',
      version: '1.0.0',
      description: 'System notifications and badge management'
    };

    mockAPI = {
      on: createSpy((event, handler) => {
        if (!eventHandlers.has(event)) {
          eventHandlers.set(event, []);
        }
        eventHandlers.get(event).push(handler);
        // Return unsubscribe function
        return () => {
          const handlers = eventHandlers.get(event);
          const index = handlers.indexOf(handler);
          if (index !== -1) {
            handlers.splice(index, 1);
          }
        };
      }),
      once: createSpy((event, handler) => {
        if (!eventHandlers.has(event)) {
          eventHandlers.set(event, []);
        }
        eventHandlers.get(event).push({ handler, once: true });
      }),
      emit: createSpy((event, data) => {
        if (!eventHandlers.has(event)) return;
        const handlers = eventHandlers.get(event);
        handlers.forEach((item) => {
          const fn = typeof item === 'function' ? item : item.handler;
          fn(data);
        });
        // Remove once handlers
        const remaining = handlers.filter(item => !(typeof item === 'object' && item.once));
        eventHandlers.set(event, remaining);
      }),
      state: {
        get: createSpy(async (key) => {
          if (key === 'notifications') {
            return { enabled: true, soundEnabled: true };
          }
          return null;
        }),
        set: createSpy(async (key, value) => {
          return true;
        })
      },
      logger: {
        info: createSpy(() => {}),
        error: createSpy(() => {}),
        warn: createSpy(() => {}),
        debug: createSpy(() => {})
      },
      cleanup: createSpy(() => {})
    };

    plugin = new NotificationsPlugin('notifications', manifest, mockAPI);
  });

  // Helper function to emit events
  const emitEvent = (event, data) => {
    if (!eventHandlers.has(event)) return;
    const handlers = eventHandlers.get(event);
    handlers.forEach((item) => {
      const fn = typeof item === 'function' ? item : item.handler;
      fn(data);
    });
  };

  describe('Lifecycle', () => {
    it('should start inactive', () => {
      assert.strictEqual(plugin.isActive, false);
    });

    it('should activate successfully', async () => {
      await plugin.activate();
      assert.strictEqual(plugin.isActive, true);
      assert.strictEqual(mockAPI.logger.info.callCount(), 1);
      assert.ok(mockAPI.logger.info.calledWith('NotificationsPlugin activated'));
    });

    it('should load preferences on activation', async () => {
      await plugin.activate();
      assert.strictEqual(mockAPI.state.get.callCount(), 1);
      assert.ok(mockAPI.state.get.calledWith('notifications'));
    });

    it('should subscribe to notification:intercepted event', async () => {
      await plugin.activate();
      assert.strictEqual(mockAPI.on.callCount(), 1);
      const onCall = mockAPI.on.calls[0];
      assert.strictEqual(onCall[0], 'notification:intercepted');
      assert.strictEqual(typeof onCall[1], 'function');
    });

    it('should deactivate and cleanup listeners', async () => {
      await plugin.activate();
      const listenerCount = eventHandlers.get('notification:intercepted').length;

      await plugin.deactivate();

      assert.strictEqual(plugin.isActive, false);
      assert.strictEqual(mockAPI.logger.info.callCount(), 2);
    });

    it('should clear notification queue on deactivate', async () => {
      await plugin.activate();

      // Add notification to queue
      emitEvent('notification:intercepted', {
        id: '1',
        title: 'Test',
        body: 'Message'
      });

      // Wait for notification to be processed
      await waitFor(() => plugin.getQueue().length > 0, 500);

      await plugin.deactivate();
      assert.strictEqual(plugin.getQueue().length, 0);
      assert.strictEqual(plugin.getBadgeCount(), 0);
    });

    it('should destroy and release resources', async () => {
      await plugin.activate();
      await plugin.destroy();

      assert.strictEqual(plugin.isActive, false);
      assert.strictEqual(mockAPI.cleanup.callCount(), 1);
    });

    it('should handle destroy when not active', async () => {
      await plugin.destroy();
      assert.strictEqual(plugin.isActive, false);
    });

    it('should throw if already active', async () => {
      await plugin.activate();
      await assert.rejects(
        plugin.activate(),
        /already active/
      );
    });

    it('should throw if deactivating when not active', async () => {
      await assert.rejects(
        plugin.deactivate(),
        /not active/
      );
    });
  });

  describe('Notification Display', () => {
    beforeEach(async () => {
      await plugin.activate();
    });

    it('should show system notification when intercepted', async () => {
      const notification = {
        id: '123',
        title: 'Test Notification',
        body: 'Test message',
        icon: '/icon.png'
      };

      emitEvent('notification:intercepted', notification);

      await waitFor(() => mockAPI.emit.callCount() > 1);

      const emitCalls = mockAPI.emit.calls;
      const showCall = emitCalls.find(call => call[0] === 'system:notification:show');

      assert.ok(showCall);
      assert.strictEqual(showCall[1].title, 'Test Notification');
      assert.strictEqual(showCall[1].body, 'Test message');
    });

    it('should not show when notifications disabled', async () => {
      await plugin.configure({ enabled: false });

      emitEvent('notification:intercepted', {
        id: '1',
        title: 'Test',
        body: 'Message'
      });

      // Wait a bit to ensure no notification is shown
      await new Promise(resolve => setTimeout(resolve, 50));

      const emitCalls = mockAPI.emit.calls;
      const showCall = emitCalls.find(call => call[0] === 'system:notification:show');

      assert.strictEqual(showCall, undefined);
    });

    it('should emit notification:shown event', async () => {
      const notification = {
        id: '123',
        title: 'Test',
        body: 'Message'
      };

      emitEvent('notification:intercepted', notification);

      await waitFor(() => {
        const emitCalls = mockAPI.emit.calls;
        return emitCalls.some(call => call[0] === 'notification:shown');
      });

      const emitCalls = mockAPI.emit.calls;
      const shownCall = emitCalls.find(call => call[0] === 'notification:shown');

      assert.ok(shownCall);
      assert.strictEqual(shownCall[1].id, '123');
      assert.ok(shownCall[1].timestamp);
    });

    it('should add notification to queue', async () => {
      const notification = {
        id: '1',
        title: 'Test',
        body: 'Message'
      };

      emitEvent('notification:intercepted', notification);

      await waitFor(() => plugin.getQueue().length > 0);

      const queue = plugin.getQueue();
      assert.strictEqual(queue.length, 1);
      assert.strictEqual(queue[0].id, '1');
    });

    it('should respect max queue size', async () => {
      await plugin.configure({ maxQueueSize: 3 });

      for (let i = 0; i < 5; i++) {
        emitEvent('notification:intercepted', {
          id: `${i}`,
          title: `Test ${i}`,
          body: 'Message'
        });
      }

      await waitFor(() => plugin.getQueue().length >= 3);

      const queue = plugin.getQueue();
      assert.strictEqual(queue.length, 3);
      assert.strictEqual(queue[0].id, '2'); // First two removed
    });

    it('should handle notification with onClick callback', async () => {
      const onClick = createSpy(() => {});

      emitEvent('notification:intercepted', {
        id: '1',
        title: 'Test',
        body: 'Message',
        onClick
      });

      await waitFor(() => mockAPI.once.callCount() > 0);

      const onceCall = mockAPI.once.calls[0];
      assert.strictEqual(onceCall[0], 'notification:click');
      assert.strictEqual(typeof onceCall[1], 'function');
    });

    it('should use default values for missing notification data', async () => {
      emitEvent('notification:intercepted', { id: '1' });

      await waitFor(() => {
        const emitCalls = mockAPI.emit.calls;
        return emitCalls.some(call => call[0] === 'system:notification:show');
      });

      const emitCalls = mockAPI.emit.calls;
      const showCall = emitCalls.find(call => call[0] === 'system:notification:show');

      assert.strictEqual(showCall[1].title, 'Notification');
      assert.strictEqual(showCall[1].body, '');
    });
  });

  describe('Sound Management', () => {
    beforeEach(async () => {
      await plugin.activate();
    });

    it('should play sound when enabled', async () => {
      emitEvent('notification:intercepted', {
        id: '1',
        title: 'Test',
        body: 'Message'
      });

      await waitFor(() => {
        const emitCalls = mockAPI.emit.calls;
        return emitCalls.some(call => call[0] === 'sound:play');
      });

      const emitCalls = mockAPI.emit.calls;
      const soundCall = emitCalls.find(call => call[0] === 'sound:play');

      assert.ok(soundCall);
      assert.strictEqual(soundCall[1].file, 'default');
    });

    it('should not play sound when disabled', async () => {
      await plugin.configure({ soundEnabled: false });

      emitEvent('notification:intercepted', {
        id: '1',
        title: 'Test',
        body: 'Message'
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      const emitCalls = mockAPI.emit.calls;
      const soundCall = emitCalls.find(call => call[0] === 'sound:play');

      assert.strictEqual(soundCall, undefined);
    });

    it('should play custom sound if specified', async () => {
      emitEvent('notification:intercepted', {
        id: '1',
        title: 'Test',
        body: 'Message',
        sound: 'custom-sound.mp3'
      });

      await waitFor(() => {
        const emitCalls = mockAPI.emit.calls;
        return emitCalls.some(call => call[0] === 'sound:play');
      });

      const emitCalls = mockAPI.emit.calls;
      const soundCall = emitCalls.find(call => call[0] === 'sound:play');

      assert.strictEqual(soundCall[1].file, 'custom-sound.mp3');
    });
  });

  describe('Badge Count', () => {
    beforeEach(async () => {
      await plugin.activate();
    });

    it('should update badge count on notification', async () => {
      emitEvent('notification:intercepted', {
        id: '1',
        title: 'Test',
        body: 'Message'
      });

      await waitFor(() => plugin.getBadgeCount() > 0);

      assert.strictEqual(plugin.getBadgeCount(), 1);
    });

    it('should emit badge-updated event', async () => {
      emitEvent('notification:intercepted', {
        id: '1',
        title: 'Test',
        body: 'Message'
      });

      await waitFor(() => {
        const emitCalls = mockAPI.emit.calls;
        return emitCalls.some(call => call[0] === 'badge:update');
      });

      const emitCalls = mockAPI.emit.calls;
      const badgeCall = emitCalls.find(call => call[0] === 'badge:update');

      assert.ok(badgeCall);
      assert.strictEqual(badgeCall[1].count, 1);
    });

    it('should increment badge count for multiple notifications', async () => {
      for (let i = 0; i < 5; i++) {
        emitEvent('notification:intercepted', {
          id: `${i}`,
          title: `Test ${i}`,
          body: 'Message'
        });
      }

      await waitFor(() => plugin.getBadgeCount() >= 5);

      assert.strictEqual(plugin.getBadgeCount(), 5);
    });

    it('should not update badge when disabled', async () => {
      await plugin.configure({ badgeEnabled: false });

      emitEvent('notification:intercepted', {
        id: '1',
        title: 'Test',
        body: 'Message'
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      assert.strictEqual(plugin.getBadgeCount(), 0);
    });

    it('should clear badge count', async () => {
      emitEvent('notification:intercepted', {
        id: '1',
        title: 'Test',
        body: 'Message'
      });

      await waitFor(() => plugin.getBadgeCount() > 0);

      await plugin.clearBadge();

      assert.strictEqual(plugin.getBadgeCount(), 0);
    });
  });

  describe('Configuration Handling', () => {
    beforeEach(async () => {
      await plugin.activate();
    });

    it('should update configuration', async () => {
      const newConfig = {
        enabled: false,
        soundEnabled: false,
        badgeEnabled: false
      };

      await plugin.configure(newConfig);

      const config = plugin.getConfig();
      assert.strictEqual(config.enabled, false);
      assert.strictEqual(config.soundEnabled, false);
      assert.strictEqual(config.badgeEnabled, false);
    });

    it('should persist configuration', async () => {
      const newConfig = { enabled: false };

      await plugin.configure(newConfig);

      assert.strictEqual(mockAPI.state.set.callCount(), 1);
      const setCall = mockAPI.state.set.calls[0];
      assert.strictEqual(setCall[0], 'notifications');
      assert.ok(typeof setCall[1] === 'object');
    });

    it('should merge configuration partially', async () => {
      await plugin.configure({ soundEnabled: false });

      const config = plugin.getConfig();
      assert.strictEqual(config.enabled, true); // Original value
      assert.strictEqual(config.soundEnabled, false); // Updated value
    });

    it('should return immutable config copy', async () => {
      const config1 = plugin.getConfig();
      config1.enabled = false;

      const config2 = plugin.getConfig();
      assert.strictEqual(config2.enabled, true);
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      await plugin.activate();
    });

    it('should handle errors during notification display', async () => {
      // Mock API to throw error
      mockAPI.emit = createSpy(() => {
        throw new Error('Display error');
      });

      // The error is thrown inside the event handler
      // We need to catch it via the logger
      emitEvent('notification:intercepted', {
        id: '1',
        title: 'Test',
        body: 'Message'
      });

      // Wait for error to be logged
      await waitFor(() => mockAPI.logger.error.callCount() > 0, 500);

      assert.ok(mockAPI.logger.error.callCount() > 0);
    });

    it('should log errors with context', async () => {
      mockAPI.emit = createSpy((event) => {
        if (event === 'system:notification:show') {
          throw new Error('Display error');
        }
      });

      emitEvent('notification:intercepted', {
        id: '1',
        title: 'Test',
        body: 'Message'
      });

      // Wait for error to be logged
      await waitFor(() => mockAPI.logger.error.callCount() > 0, 500);

      const errorCalls = mockAPI.logger.error.calls;
      assert.ok(errorCalls.length > 0);
      assert.ok(errorCalls[0][0].includes('notification'));
    });
  });

  describe('Queue Management', () => {
    beforeEach(async () => {
      await plugin.activate();
    });

    it('should return queue copy', async () => {
      emitEvent('notification:intercepted', {
        id: '1',
        title: 'Test',
        body: 'Message'
      });

      await waitFor(() => plugin.getQueue().length > 0);

      const queue1 = plugin.getQueue();
      queue1.push({ id: '999' });

      const queue2 = plugin.getQueue();
      assert.strictEqual(queue2.length, 1);
    });

    it('should clear queue', async () => {
      for (let i = 0; i < 3; i++) {
        emitEvent('notification:intercepted', {
          id: `${i}`,
          title: `Test ${i}`,
          body: 'Message'
        });
      }

      await waitFor(() => plugin.getQueue().length >= 3);

      plugin.clearQueue();

      assert.strictEqual(plugin.getQueue().length, 0);
    });
  });

  describe('BasePlugin Compliance', () => {
    it('should extend BasePlugin', () => {
      const BasePlugin = require('../../../../app/plugins/BasePlugin');
      assert.ok(plugin instanceof BasePlugin);
    });

    it('should expose correct properties', () => {
      assert.strictEqual(plugin.id, 'notifications');
      assert.deepStrictEqual(plugin.manifest, manifest);
      assert.strictEqual(plugin.api, mockAPI);
    });

    it('should follow lifecycle contract', async () => {
      assert.strictEqual(plugin.isActive, false);

      await plugin.activate();
      assert.strictEqual(plugin.isActive, true);

      await plugin.deactivate();
      assert.strictEqual(plugin.isActive, false);
    });
  });
});
