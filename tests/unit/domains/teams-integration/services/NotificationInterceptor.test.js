/**
 * NotificationInterceptor Service Tests
 *
 * Comprehensive test suite for notification interception, bridging,
 * and lifecycle management.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { createSpy, createMockEventEmitter, suppressConsole } from '../../../../helpers/test-utils.js';

const require = createRequire(import.meta.url);

// Mock Electron Notification API
class MockNotification extends EventEmitter {
  static isSupported() {
    return MockNotification._supported;
  }

  constructor(options) {
    super();
    this.options = options;
    this._shown = false;
    this._closed = false;
    MockNotification._instances.push(this);
  }

  show() {
    this._shown = true;
    // Simulate async notification display
    process.nextTick(() => {
      if (MockNotification._shouldFail) {
        this.emit('failed', new Error('Notification display failed'));
      }
    });
  }

  close() {
    this._closed = true;
    this.emit('close');
  }

  static _reset() {
    this._supported = true;
    this._instances = [];
    this._shouldFail = false;
  }

  static _instances = [];
  static _supported = true;
  static _shouldFail = false;
}

// Mock the electron module in require.cache
require.cache[require.resolve('electron')] = {
  id: require.resolve('electron'),
  filename: require.resolve('electron'),
  loaded: true,
  exports: {
    Notification: MockNotification
  }
};

// Import the NotificationInterceptor
const NotificationInterceptor = require('../../../../../app/domains/teams-integration/services/NotificationInterceptor.js');

describe('NotificationInterceptor', () => {
  let interceptor;
  let mockConfig;
  let mockEventBus;

  beforeEach(() => {
    // Reset Electron mock
    MockNotification._reset();

    // Create mock config
    mockConfig = {
      get: createSpy((key, defaultValue) => defaultValue),
      set: createSpy()
    };

    // Create mock event bus
    mockEventBus = createMockEventEmitter();

    // Track emitted events
    mockEventBus._emittedEvents = [];
    const originalEmit = mockEventBus.emit.bind(mockEventBus);
    mockEventBus.emit = (event, data) => {
      mockEventBus._emittedEvents.push({ event, data });
      return originalEmit(event, data);
    };
  });

  afterEach(() => {
    if (interceptor) {
      interceptor.destroy();
    }
  });

  describe('Constructor and Initialization', () => {
    it('should initialize with valid config and event bus', () => {
      interceptor = new NotificationInterceptor(mockConfig, mockEventBus);

      assert.ok(interceptor);
      assert.strictEqual(typeof interceptor.interceptNotification, 'function');
      assert.strictEqual(typeof interceptor.showSystemNotification, 'function');
    });

    it('should load sound settings from config', () => {
      mockConfig.get = createSpy((key, defaultValue) => {
        if (key === 'notifications.soundEnabled') return false;
        return defaultValue;
      });

      interceptor = new NotificationInterceptor(mockConfig, mockEventBus);

      assert.ok(mockConfig.get.calledWith('notifications.soundEnabled', true));
      assert.strictEqual(interceptor._soundEnabled, false);
    });

    it('should emit initialized event on successful initialization', () => {
      interceptor = new NotificationInterceptor(mockConfig, mockEventBus);

      const initEvent = mockEventBus._emittedEvents.find(e => e.event === 'notification:initialized');
      assert.ok(initEvent);
      assert.strictEqual(initEvent.data.supported, true);
    });

    it('should handle unsupported platform gracefully', async () => {
      MockNotification._supported = false;

      await suppressConsole(() => {
        interceptor = new NotificationInterceptor(mockConfig, mockEventBus);
      });

      assert.strictEqual(interceptor.checkPermission(), 'denied');
      assert.strictEqual(interceptor._initialized, false);
    });

    it('should initialize only once', () => {
      interceptor = new NotificationInterceptor(mockConfig, mockEventBus);

      const initialEventCount = mockEventBus._emittedEvents.length;
      interceptor._initialize();

      assert.strictEqual(mockEventBus._emittedEvents.length, initialEventCount);
    });
  });

  describe('Notification Interception', () => {
    beforeEach(() => {
      interceptor = new NotificationInterceptor(mockConfig, mockEventBus);
      mockEventBus._emittedEvents = [];
    });

    it('should intercept and show notification', () => {
      const notification = {
        title: 'Test Notification',
        body: 'This is a test',
        icon: 'icon.png'
      };

      const id = interceptor.interceptNotification(notification);

      assert.ok(id);
      assert.ok(id.startsWith('notification_'));

      const interceptedEvent = mockEventBus._emittedEvents.find(
        e => e.event === 'notification:intercepted'
      );
      assert.ok(interceptedEvent);
      assert.strictEqual(interceptedEvent.data.title, 'Test Notification');
      assert.strictEqual(interceptedEvent.data.body, 'This is a test');
    });

    it('should use default title when not provided', () => {
      const notification = { body: 'Test body' };

      const id = interceptor.interceptNotification(notification);

      const shownEvent = mockEventBus._emittedEvents.find(
        e => e.event === 'notification:shown'
      );
      assert.strictEqual(shownEvent.data.notification.title, 'Microsoft Teams');
    });

    it('should include custom data in intercepted notification', () => {
      const notification = {
        title: 'Custom',
        body: 'Test',
        data: { userId: '123', action: 'message' }
      };

      interceptor.interceptNotification(notification);

      const interceptedEvent = mockEventBus._emittedEvents.find(
        e => e.event === 'notification:intercepted'
      );
      assert.deepStrictEqual(interceptedEvent.data.data, { userId: '123', action: 'message' });
    });

    it('should fail when not initialized', async () => {
      MockNotification._supported = false;
      interceptor = await suppressConsole(() =>
        new NotificationInterceptor(mockConfig, mockEventBus)
      );
      mockEventBus._emittedEvents = [];

      const result = interceptor.interceptNotification({ title: 'Test' });

      assert.strictEqual(result, null);
      const failedEvent = mockEventBus._emittedEvents.find(
        e => e.event === 'notification:failed'
      );
      assert.ok(failedEvent);
      assert.ok(failedEvent.data.error.includes('not initialized'));
    });

    it('should fail when permission is denied', () => {
      interceptor._permission = 'denied';

      const result = interceptor.interceptNotification({ title: 'Test' });

      assert.strictEqual(result, null);
      const failedEvent = mockEventBus._emittedEvents.find(
        e => e.event === 'notification:failed'
      );
      assert.ok(failedEvent);
    });
  });

  describe('System Notification Bridge', () => {
    beforeEach(() => {
      interceptor = new NotificationInterceptor(mockConfig, mockEventBus);
      mockEventBus._emittedEvents = [];
    });

    it('should create and show system notification', () => {
      const options = {
        id: 'test-id',
        title: 'System Test',
        body: 'System notification',
        timestamp: Date.now()
      };

      interceptor.showSystemNotification(options);

      assert.strictEqual(MockNotification._instances.length, 1);
      const notification = MockNotification._instances[0];
      assert.strictEqual(notification.options.title, 'System Test');
      assert.strictEqual(notification.options.body, 'System notification');
      assert.strictEqual(notification._shown, true);
    });

    it('should apply sound settings to notification', () => {
      interceptor._soundEnabled = false;

      const options = {
        id: 'test-id',
        title: 'Silent',
        body: 'Should be silent',
        timestamp: Date.now()
      };

      interceptor.showSystemNotification(options);

      const notification = MockNotification._instances[0];
      assert.strictEqual(notification.options.silent, true);
    });

    it('should store notification reference', () => {
      const options = {
        id: 'test-123',
        title: 'Store Test',
        body: 'Test',
        data: { custom: 'data' },
        tag: 'test-tag',
        timestamp: Date.now()
      };

      interceptor.showSystemNotification(options);

      assert.strictEqual(interceptor.getActiveCount(), 1);
      const stored = interceptor._notifications.get('test-123');
      assert.ok(stored);
      assert.deepStrictEqual(stored.data, { custom: 'data' });
      assert.strictEqual(stored.tag, 'test-tag');
    });

    it('should handle notification display failure', (t, done) => {
      MockNotification._shouldFail = true;

      const options = {
        id: 'fail-test',
        title: 'Fail',
        body: 'Will fail',
        timestamp: Date.now()
      };

      mockEventBus.on('notification:failed', (data) => {
        assert.strictEqual(data.id, 'fail-test');
        assert.ok(data.error);
        done();
      });

      interceptor.showSystemNotification(options);
    });

    it('should emit notification:shown event', () => {
      const options = {
        id: 'shown-test',
        title: 'Event Test',
        body: 'Test',
        timestamp: Date.now()
      };

      interceptor.showSystemNotification(options);

      const shownEvent = mockEventBus._emittedEvents.find(
        e => e.event === 'notification:shown'
      );
      assert.ok(shownEvent);
      assert.strictEqual(shownEvent.data.id, 'shown-test');
    });
  });

  describe('Sound Management', () => {
    beforeEach(() => {
      interceptor = new NotificationInterceptor(mockConfig, mockEventBus);
      mockEventBus._emittedEvents = [];
    });

    it('should enable sound', () => {
      interceptor.setSoundEnabled(true);

      assert.strictEqual(interceptor._soundEnabled, true);
      assert.ok(mockConfig.set.calledWith('notifications.soundEnabled', true));
    });

    it('should disable sound', () => {
      interceptor.setSoundEnabled(false);

      assert.strictEqual(interceptor._soundEnabled, false);
      assert.ok(mockConfig.set.calledWith('notifications.soundEnabled', false));
    });

    it('should emit sound-toggled event', () => {
      interceptor.setSoundEnabled(false);

      const toggledEvent = mockEventBus._emittedEvents.find(
        e => e.event === 'notification:sound-toggled'
      );
      assert.ok(toggledEvent);
      assert.strictEqual(toggledEvent.data.enabled, false);
    });

    it('should play sound when enabled', () => {
      interceptor._soundEnabled = true;

      interceptor.handleSound({ volume: 0.5 });

      const soundEvent = mockEventBus._emittedEvents.find(
        e => e.event === 'notification:sound-played'
      );
      assert.ok(soundEvent);
      assert.deepStrictEqual(soundEvent.data, { volume: 0.5 });
    });

    it('should not play sound when disabled', () => {
      interceptor._soundEnabled = false;

      interceptor.handleSound({ volume: 0.5 });

      const soundEvent = mockEventBus._emittedEvents.find(
        e => e.event === 'notification:sound-played'
      );
      assert.strictEqual(soundEvent, undefined);
    });

    it('should respect per-notification sound override', () => {
      interceptor._soundEnabled = true;

      const options = {
        id: 'sound-override',
        title: 'Test',
        body: 'Test',
        sound: false,
        timestamp: Date.now()
      };

      interceptor.showSystemNotification(options);

      const soundEvent = mockEventBus._emittedEvents.find(
        e => e.event === 'notification:sound-played'
      );
      assert.strictEqual(soundEvent, undefined);
    });
  });

  describe('Permission Handling', () => {
    beforeEach(() => {
      interceptor = new NotificationInterceptor(mockConfig, mockEventBus);
    });

    it('should check permission', () => {
      const permission = interceptor.checkPermission();
      assert.strictEqual(permission, 'granted');
    });

    it('should request and grant permission when supported', async () => {
      const permission = await interceptor.requestPermission();

      assert.strictEqual(permission, 'granted');
      const event = mockEventBus._emittedEvents.find(
        e => e.event === 'notification:permission-changed'
      );
      assert.ok(event);
      assert.strictEqual(event.data.permission, 'granted');
    });

    it('should deny permission when not supported', async () => {
      MockNotification._supported = false;

      const permission = await interceptor.requestPermission();

      assert.strictEqual(permission, 'denied');
    });
  });

  describe('Badge Count Updates', () => {
    beforeEach(() => {
      interceptor = new NotificationInterceptor(mockConfig, mockEventBus);
      mockEventBus._emittedEvents = [];
    });

    it('should increment badge count on notification', () => {
      const options = {
        id: 'badge-1',
        title: 'Test',
        body: 'Test',
        timestamp: Date.now()
      };

      interceptor.showSystemNotification(options);

      assert.strictEqual(interceptor.getBadgeCount(), 1);
      const badgeEvent = mockEventBus._emittedEvents.find(
        e => e.event === 'notification:badge-updated'
      );
      assert.ok(badgeEvent);
      assert.strictEqual(badgeEvent.data.count, 1);
    });

    it('should decrement badge count on notification click', () => {
      const options = {
        id: 'badge-click',
        title: 'Test',
        body: 'Test',
        timestamp: Date.now()
      };

      interceptor.showSystemNotification(options);
      mockEventBus._emittedEvents = [];

      const notification = MockNotification._instances[0];
      notification.emit('click');

      assert.strictEqual(interceptor.getBadgeCount(), 0);
      const badgeEvent = mockEventBus._emittedEvents.find(
        e => e.event === 'notification:badge-updated'
      );
      assert.strictEqual(badgeEvent.data.count, 0);
    });

    it('should decrement badge count on notification close', () => {
      const options = {
        id: 'badge-close',
        title: 'Test',
        body: 'Test',
        timestamp: Date.now()
      };

      interceptor.showSystemNotification(options);
      mockEventBus._emittedEvents = [];

      const notification = MockNotification._instances[0];
      notification.emit('close');

      assert.strictEqual(interceptor.getBadgeCount(), 0);
    });

    it('should update badge count manually', () => {
      interceptor.updateBadgeCount(5);

      assert.strictEqual(interceptor.getBadgeCount(), 5);
      const badgeEvent = mockEventBus._emittedEvents.find(
        e => e.event === 'notification:badge-updated'
      );
      assert.strictEqual(badgeEvent.data.count, 5);
    });

    it('should not allow negative badge count', () => {
      interceptor.updateBadgeCount(-5);

      assert.strictEqual(interceptor.getBadgeCount(), 0);
    });

    it('should handle multiple notifications with badge count', () => {
      for (let i = 1; i <= 3; i++) {
        interceptor.showSystemNotification({
          id: `badge-${i}`,
          title: 'Test',
          body: 'Test',
          timestamp: Date.now()
        });
      }

      assert.strictEqual(interceptor.getBadgeCount(), 3);
      assert.strictEqual(interceptor.getActiveCount(), 3);
    });
  });

  describe('Notification Tracking and Lifecycle', () => {
    beforeEach(() => {
      interceptor = new NotificationInterceptor(mockConfig, mockEventBus);
      mockEventBus._emittedEvents = [];
    });

    it('should track active notifications', () => {
      const options = {
        id: 'track-1',
        title: 'Test',
        body: 'Test',
        timestamp: Date.now()
      };

      interceptor.showSystemNotification(options);

      assert.strictEqual(interceptor.getActiveCount(), 1);
    });

    it('should emit clicked event with data on notification click', () => {
      const options = {
        id: 'click-test',
        title: 'Test',
        body: 'Test',
        data: { action: 'open', url: 'https://example.com' },
        tag: 'test-tag',
        timestamp: Date.now()
      };

      interceptor.showSystemNotification(options);
      mockEventBus._emittedEvents = [];

      const notification = MockNotification._instances[0];
      notification.emit('click');

      const clickEvent = mockEventBus._emittedEvents.find(
        e => e.event === 'notification:clicked'
      );
      assert.ok(clickEvent);
      assert.strictEqual(clickEvent.data.id, 'click-test');
      assert.deepStrictEqual(clickEvent.data.data, { action: 'open', url: 'https://example.com' });
      assert.strictEqual(clickEvent.data.tag, 'test-tag');
    });

    it('should emit closed event on notification close', () => {
      const options = {
        id: 'close-test',
        title: 'Test',
        body: 'Test',
        timestamp: Date.now()
      };

      interceptor.showSystemNotification(options);
      mockEventBus._emittedEvents = [];

      const notification = MockNotification._instances[0];
      notification.emit('close');

      const closeEvent = mockEventBus._emittedEvents.find(
        e => e.event === 'notification:closed'
      );
      assert.ok(closeEvent);
      assert.strictEqual(closeEvent.data.id, 'close-test');
    });

    it('should remove notification from tracking on click', () => {
      const options = {
        id: 'remove-test',
        title: 'Test',
        body: 'Test',
        timestamp: Date.now()
      };

      interceptor.showSystemNotification(options);
      assert.strictEqual(interceptor.getActiveCount(), 1);

      const notification = MockNotification._instances[0];
      notification.emit('click');

      assert.strictEqual(interceptor.getActiveCount(), 0);
    });

    it('should clear all notifications', () => {
      for (let i = 1; i <= 3; i++) {
        interceptor.showSystemNotification({
          id: `clear-${i}`,
          title: 'Test',
          body: 'Test',
          timestamp: Date.now()
        });
      }

      assert.strictEqual(interceptor.getActiveCount(), 3);

      interceptor.clearAll();

      assert.strictEqual(interceptor.getActiveCount(), 0);
      assert.strictEqual(interceptor.getBadgeCount(), 0);

      const clearEvent = mockEventBus._emittedEvents.find(
        e => e.event === 'notification:all-cleared'
      );
      assert.ok(clearEvent);
    });

    it('should handle errors when closing notifications during clearAll', async () => {
      const options = {
        id: 'error-test',
        title: 'Test',
        body: 'Test',
        timestamp: Date.now()
      };

      interceptor.showSystemNotification(options);

      // Make close throw an error
      const notification = MockNotification._instances[0];
      notification.close = () => {
        throw new Error('Close failed');
      };

      // Should not throw
      await suppressConsole(() => {
        interceptor.clearAll();
      });

      assert.strictEqual(interceptor.getActiveCount(), 0);
    });
  });

  describe('Edge Cases', () => {
    beforeEach(() => {
      interceptor = new NotificationInterceptor(mockConfig, mockEventBus);
      mockEventBus._emittedEvents = [];
    });

    it('should handle null notification object', () => {
      // The implementation doesn't handle null, it will throw TypeError
      assert.throws(() => {
        interceptor.interceptNotification(null);
      }, TypeError);
    });

    it('should handle empty notification object', () => {
      const id = interceptor.interceptNotification({});

      assert.ok(id);
      const shownEvent = mockEventBus._emittedEvents.find(
        e => e.event === 'notification:shown'
      );
      assert.strictEqual(shownEvent.data.notification.title, 'Microsoft Teams');
      assert.strictEqual(shownEvent.data.notification.body, '');
    });

    it('should handle notification with invalid icon', () => {
      const options = {
        id: 'icon-test',
        title: 'Test',
        body: 'Test',
        icon: 'invalid-icon-path',
        timestamp: Date.now()
      };

      interceptor.showSystemNotification(options);

      const notification = MockNotification._instances[0];
      assert.ok(notification);
    });

    it('should handle missing event bus gracefully', () => {
      interceptor = new NotificationInterceptor(mockConfig, null);

      // Should not throw
      const id = interceptor.interceptNotification({
        title: 'Test',
        body: 'Test'
      });

      assert.ok(id);
    });

    it('should generate unique notification IDs', () => {
      const ids = new Set();

      for (let i = 0; i < 100; i++) {
        const id = interceptor._generateId();
        ids.add(id);
      }

      assert.strictEqual(ids.size, 100);
    });

    it('should handle notification click for non-existent notification', () => {
      // Should not throw
      interceptor._handleNotificationClick('non-existent-id');

      const clickEvent = mockEventBus._emittedEvents.find(
        e => e.event === 'notification:clicked'
      );
      assert.strictEqual(clickEvent, undefined);
    });

    it('should handle notification close for non-existent notification', () => {
      // Should not throw
      interceptor._handleNotificationClose('non-existent-id');

      const closeEvent = mockEventBus._emittedEvents.find(
        e => e.event === 'notification:closed'
      );
      assert.strictEqual(closeEvent, undefined);
    });

    it('should properly destroy and cleanup', () => {
      for (let i = 1; i <= 3; i++) {
        interceptor.showSystemNotification({
          id: `destroy-${i}`,
          title: 'Test',
          body: 'Test',
          timestamp: Date.now()
        });
      }

      interceptor.destroy();

      assert.strictEqual(interceptor.getActiveCount(), 0);
      assert.strictEqual(interceptor._eventBus, null);
      assert.strictEqual(interceptor._config, null);
      assert.strictEqual(interceptor._initialized, false);
    });
  });

  describe('Icon Resolution', () => {
    beforeEach(() => {
      interceptor = new NotificationInterceptor(mockConfig, mockEventBus);
    });

    it('should return null for null icon path', () => {
      const result = interceptor._resolveIcon(null);
      assert.strictEqual(result, null);
    });

    it('should return URL as-is for http URL', () => {
      const url = 'http://example.com/icon.png';
      const result = interceptor._resolveIcon(url);
      assert.strictEqual(result, url);
    });

    it('should return URL as-is for https URL', () => {
      const url = 'https://example.com/icon.png';
      const result = interceptor._resolveIcon(url);
      assert.strictEqual(result, url);
    });

    it('should return absolute path as-is', () => {
      const absolutePath = '/absolute/path/to/icon.png';
      const result = interceptor._resolveIcon(absolutePath);
      assert.strictEqual(result, absolutePath);
    });

    it('should resolve relative path', () => {
      const relativePath = 'assets/icon.png';
      const result = interceptor._resolveIcon(relativePath);
      assert.ok(result.includes('assets/icon.png'));
      assert.ok(!result.startsWith('http'));
    });
  });
});
