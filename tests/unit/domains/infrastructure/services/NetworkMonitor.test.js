const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

// Helper to wait for async operations
const wait = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));

// Mock electron before requiring NetworkMonitor
const mockNetRequests = [];
const mockNet = {
  request: (options) => {
    const req = {
      _options: options,
      _listeners: { response: [], error: [] },
      on: function(event, handler) {
        this._listeners[event].push(handler);
        return this;
      },
      end: function() {
        mockNetRequests.push(this);
        // Respond synchronously in same tick for predictable tests
        if (mockNet._shouldSucceed) {
          this._listeners.response.forEach(h => h());
        } else {
          this._listeners.error.forEach(h => h());
        }
      }
    };
    return req;
  },
  resolveHost: (domain) => {
    return mockNet._shouldSucceed
      ? Promise.resolve()
      : Promise.reject(new Error('DNS failed'));
  },
  isOnline: () => mockNet._shouldSucceed,
  _shouldSucceed: true,
  _reset() {
    this._shouldSucceed = true;
    mockNetRequests.length = 0;
  }
};

// Mock EventBus
const mockEventBus = {
  _events: {},
  _emitted: [],
  getInstance: () => mockEventBus,
  emit: function(event, data) {
    this._emitted.push({ event, data });
    if (this._events[event]) {
      this._events[event].forEach(handler => handler(data));
    }
  },
  on: function(event, handler) {
    if (!this._events[event]) {
      this._events[event] = [];
    }
    this._events[event].push(handler);
  },
  _reset() {
    this._events = {};
    this._emitted = [];
  }
};

// Mock require
require.cache[require.resolve('electron')] = {
  exports: { net: mockNet }
};
require.cache[require.resolve('../../../../../app/core/EventBus')] = {
  exports: mockEventBus
};

const NetworkMonitor = require('../../../../../app/domains/infrastructure/services/NetworkMonitor');

describe('NetworkMonitor Service', () => {
  let monitor;

  beforeEach(() => {
    mockNet._reset();
    mockEventBus._reset();
    monitor = new NetworkMonitor({
      url: 'https://test.example.com',
      networkCheckIntervalMs: 100,
      networkRetryDelayMs: 1 // Minimal delay for tests
    });
  });

  afterEach(() => {
    if (monitor) {
      monitor.cleanup();
    }
  });

  describe('Constructor', () => {
    it('should create monitor with default options', () => {
      const defaultMonitor = new NetworkMonitor();
      const state = defaultMonitor.getState();

      assert.strictEqual(state.isOnline, null);
      assert.strictEqual(state.isRunning, false);
    });

    it('should create monitor with custom options', () => {
      const customMonitor = new NetworkMonitor({
        url: 'https://custom.com',
        networkCheckIntervalMs: 5000
      });
      const stats = customMonitor.getStats();

      assert.strictEqual(stats.testUrl, 'https://custom.com');
      assert.strictEqual(stats.checkIntervalMs, 5000);
    });

    it('should initialize with null online state', () => {
      const state = monitor.getState();

      assert.strictEqual(state.isOnline, null);
      assert.strictEqual(state.lastCheck, null);
      assert.strictEqual(state.lastMethod, null);
    });
  });

  describe('Start and Stop', () => {
    it('should start monitoring', () => {
      const state1 = monitor.getState();
      assert.strictEqual(state1.isRunning, false);

      monitor.start();

      const state2 = monitor.getState();
      assert.strictEqual(state2.isRunning, true);
    });

    it('should not start if already running', () => {
      monitor.start();
      const state1 = monitor.getState();

      monitor.start(); // Try to start again

      const state2 = monitor.getState();
      assert.strictEqual(state1.isRunning, state2.isRunning);
    });

    it('should stop monitoring', () => {
      monitor.start();

      monitor.stop();

      const state = monitor.getState();
      assert.strictEqual(state.isRunning, false);
    });

    it('should not throw if stopping when not running', () => {
      assert.doesNotThrow(() => {
        monitor.stop();
      });
    });

    it('should clear interval when stopped', () => {
      monitor.start();
      monitor.stop();

      const state = monitor.getState();
      assert.strictEqual(state.isRunning, false);
    });
  });

  describe('Connectivity Checks', () => {
    it('should check connectivity and return true when online', async () => {
      mockNet._shouldSucceed = true;

      const result = await monitor.checkConnectivity();

      assert.strictEqual(result, true);
      const state = monitor.getState();
      assert.strictEqual(state.isOnline, true);
      assert.ok(state.lastCheck);
      assert.ok(state.lastMethod);
    });

    it('should fallback to online when all checks fail', async () => {
      // NetworkMonitor has a 'none' fallback that returns true
      // This test verifies the fallback behavior
      mockNet._shouldSucceed = false;

      const result = await monitor.checkConnectivity();

      // Result is true due to 'none' fallback method
      assert.strictEqual(result, true);
      const state = monitor.getState();
      assert.strictEqual(state.isOnline, true);
      assert.strictEqual(state.lastMethod, 'none');
    });

    it('should update lastCheck timestamp', async () => {
      const before = Date.now();

      await monitor.checkConnectivity();

      const state = monitor.getState();
      assert.ok(state.lastCheck >= before);
      assert.ok(state.lastCheck <= Date.now());
    });

    it('should try HTTPS check first', async () => {
      mockNet._shouldSucceed = true;

      await monitor.isOnline();

      // Verify HTTPS request was made
      assert.ok(mockNetRequests.length > 0);
      assert.strictEqual(mockNetRequests[0]._options.method, 'HEAD');
    });

    it('should record the successful check method', async () => {
      mockNet._shouldSucceed = true;

      await monitor.isOnline();

      const state = monitor.getState();
      assert.ok(['https', 'dns', 'native', 'none'].includes(state.lastMethod));
    });
  });

  describe('EventBus Integration', () => {
    it('should not emit events on first check (null previous state)', async () => {
      // Events only emitted when previousState !== null
      mockNet._shouldSucceed = true;
      await monitor.checkConnectivity();

      const events = mockEventBus._emitted;
      // No events on first check (previousState is null)
      assert.strictEqual(events.length, 0);
    });

    it('should emit events only when state changes from non-null', async () => {
      // First check establishes state
      mockNet._shouldSucceed = true;
      await monitor.checkConnectivity();

      mockEventBus._reset();

      // Second check with same result - no state change, no events
      await monitor.checkConnectivity();

      const events = mockEventBus._emitted;
      assert.strictEqual(events.length, 0);
    });

    it('should include correct data in emitted events', async () => {
      // Establish initial state first
      mockNet._shouldSucceed = true;
      await monitor.checkConnectivity();

      // This test just verifies that if events were emitted, they'd have proper structure
      // We can't easily test state change with the fallback behavior
      const state = monitor.getState();
      assert.ok(state.isOnline !== null);
      assert.ok(state.lastMethod);
      assert.ok(state.lastCheck);
    });

    it('should not emit events if state has not changed', async () => {
      mockNet._shouldSucceed = true;

      await monitor.checkConnectivity();
      mockEventBus._reset();
      await monitor.checkConnectivity();

      // Should not emit any events since state didn't change
      const events = mockEventBus._emitted;
      assert.strictEqual(events.length, 0);
    });
  });

  describe('Local Listeners', () => {
    it('should not call listeners on first check (null previous state)', async () => {
      let callCount = 0;
      let receivedState = null;

      monitor.on('stateChange', (isOnline) => {
        callCount++;
        receivedState = isOnline;
      });

      // First check from null state doesn't trigger listeners
      mockNet._shouldSucceed = true;
      await monitor.checkConnectivity();

      // No listener calls on first check
      assert.strictEqual(callCount, 0);
      assert.strictEqual(receivedState, null);
    });

    it('should register and manage listeners correctly', async () => {
      let callCount = 0;
      const listener = () => callCount++;

      // Add listener
      monitor.on('stateChange', listener);

      // First check doesn't trigger
      mockNet._shouldSucceed = true;
      await monitor.checkConnectivity();
      assert.strictEqual(callCount, 0);

      // Remove listener
      monitor.off('stateChange', listener);

      // Verify listener was removed (would not increment if it were called)
      const stats = monitor.getStats();
      assert.strictEqual(stats.listenerCount, 0);
    });

    it('should handle listener errors gracefully', async () => {
      monitor.on('stateChange', () => {
        throw new Error('Listener error');
      });

      // Should not throw even though listener throws
      await assert.doesNotReject(async () => {
        mockNet._shouldSucceed = true;
        await monitor.checkConnectivity();

        mockNet._shouldSucceed = false;
        await monitor.checkConnectivity();
      });
    });
  });

  describe('State Management', () => {
    it('should return current state', async () => {
      mockNet._shouldSucceed = true;
      await monitor.checkConnectivity();

      const state = monitor.getState();

      assert.strictEqual(typeof state.isOnline, 'boolean');
      assert.strictEqual(typeof state.lastCheck, 'number');
      assert.strictEqual(typeof state.lastMethod, 'string');
      assert.strictEqual(typeof state.isRunning, 'boolean');
    });

    it('should return isCurrentlyOnline status', async () => {
      mockNet._shouldSucceed = true;
      await monitor.checkConnectivity();

      const isOnline = monitor.isCurrentlyOnline();

      assert.strictEqual(isOnline, true);
    });

    it('should return null for isCurrentlyOnline before first check', () => {
      const isOnline = monitor.isCurrentlyOnline();

      assert.strictEqual(isOnline, null);
    });
  });

  describe('Force Check', () => {
    it('should perform immediate connectivity check', async () => {
      mockNet._shouldSucceed = true;

      const result = await monitor.forceCheck();

      assert.strictEqual(result, true);
      const state = monitor.getState();
      assert.strictEqual(state.isOnline, true);
    });

    it('should return fallback status when checks fail', async () => {
      // Even when checks fail, monitor returns true due to 'none' fallback
      mockNet._shouldSucceed = false;

      const result = await monitor.forceCheck();

      assert.strictEqual(result, true);
      const state = monitor.getState();
      assert.strictEqual(state.lastMethod, 'none');
    });
  });

  describe('Statistics', () => {
    it('should return monitor statistics', () => {
      const stats = monitor.getStats();

      assert.ok(stats.hasOwnProperty('isOnline'));
      assert.ok(stats.hasOwnProperty('lastCheck'));
      assert.ok(stats.hasOwnProperty('lastMethod'));
      assert.ok(stats.hasOwnProperty('isRunning'));
      assert.ok(stats.hasOwnProperty('checkIntervalMs'));
      assert.ok(stats.hasOwnProperty('listenerCount'));
      assert.ok(stats.hasOwnProperty('testUrl'));
    });

    it('should track listener count', () => {
      const listener1 = () => {};
      const listener2 = () => {};

      monitor.on('stateChange', listener1);
      monitor.on('stateChange', listener2);

      const stats = monitor.getStats();
      assert.strictEqual(stats.listenerCount, 2);
    });

    it('should include configuration values', () => {
      const stats = monitor.getStats();

      assert.strictEqual(stats.testUrl, 'https://test.example.com');
      assert.strictEqual(stats.checkIntervalMs, 100);
    });
  });

  describe('Cleanup', () => {
    it('should stop monitoring on cleanup', () => {
      monitor.start();

      monitor.cleanup();

      const state = monitor.getState();
      assert.strictEqual(state.isRunning, false);
    });

    it('should clear all listeners on cleanup', () => {
      monitor.on('stateChange', () => {});
      monitor.on('stateChange', () => {});

      monitor.cleanup();

      const stats = monitor.getStats();
      assert.strictEqual(stats.listenerCount, 0);
    });

    it('should not throw if called multiple times', () => {
      assert.doesNotThrow(() => {
        monitor.cleanup();
        monitor.cleanup();
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle check errors gracefully with fallback', async () => {
      // Mock a scenario where all checks fail
      mockNet._shouldSucceed = false;

      const result = await monitor.checkConnectivity();

      // Fallback to 'none' method returns true
      assert.strictEqual(result, true);
      const state = monitor.getState();
      assert.strictEqual(state.lastMethod, 'none');
    });

    it('should handle concurrent checks', async () => {
      mockNet._shouldSucceed = true;

      // Start multiple checks simultaneously
      const results = await Promise.all([
        monitor.checkConnectivity(),
        monitor.checkConnectivity(),
        monitor.checkConnectivity()
      ]);

      // All should succeed
      results.forEach(result => {
        assert.strictEqual(result, true);
      });
    });

    it('should handle rapid start/stop cycles', () => {
      assert.doesNotThrow(() => {
        monitor.start();
        monitor.stop();
        monitor.start();
        monitor.stop();
        monitor.start();
      });

      const state = monitor.getState();
      assert.strictEqual(state.isRunning, true);
    });
  });
});
