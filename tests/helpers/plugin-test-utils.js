/**
 * Plugin Testing Framework
 * Comprehensive utilities for testing plugin system components
 *
 * This module provides:
 * - Mock PluginAPI factory
 * - Mock EventBus factory
 * - Mock Electron APIs
 * - Plugin lifecycle test helpers
 * - IPC communication test utilities
 * - Test environment setup
 */

import { strict as assert } from 'node:assert';
import { createSpy, createMockEventEmitter, waitFor } from './test-utils.js';
import {
  createElectronMock,
  MockNotification,
  mockIpcRenderer,
  mockApp
} from './electron-mocks.js';

/**
 * Create a mock PluginAPI instance
 *
 * @param {Object} options - Configuration options
 * @param {Object} options.eventBus - Custom event bus implementation
 * @param {Object} options.logger - Custom logger implementation
 * @param {Map} options.state - Custom state storage
 * @returns {Object} Mock PluginAPI instance
 */
export function createMockPluginAPI(options = {}) {
  const mockEventBus = options.eventBus || createMockEventBus();
  const mockLogger = options.logger || createMockLogger();
  const mockState = options.state || new Map();
  const mockConfig = options.config || new Map();
  const subscribers = new Map();

  return {
    // Event Bus methods
    getEventBus() {
      return mockEventBus;
    },

    // Logger methods
    getLogger(namespace) {
      return {
        ...mockLogger,
        namespace,
        info: createSpy((...args) => mockLogger.info(`[${namespace}]`, ...args)),
        warn: createSpy((...args) => mockLogger.warn(`[${namespace}]`, ...args)),
        error: createSpy((...args) => mockLogger.error(`[${namespace}]`, ...args)),
        debug: createSpy((...args) => mockLogger.debug(`[${namespace}]`, ...args))
      };
    },

    // State management
    getState(key) {
      return mockState.get(key);
    },

    setState(key, value) {
      mockState.set(key, value);
      this.emit('state-changed', { key, value });
    },

    deleteState(key) {
      const existed = mockState.has(key);
      mockState.delete(key);
      if (existed) {
        this.emit('state-deleted', { key });
      }
      return existed;
    },

    clearState() {
      mockState.clear();
      this.emit('state-cleared');
    },

    // Configuration methods
    getConfig(key, defaultValue) {
      return mockConfig.has(key) ? mockConfig.get(key) : defaultValue;
    },

    setConfig(key, value) {
      mockConfig.set(key, value);
      this.emit('config-changed', { key, value });
    },

    // Electron API access
    getElectron() {
      return createElectronMock();
    },

    getApp() {
      return mockApp;
    },

    getNotification() {
      return MockNotification;
    },

    // IPC methods
    ipc: {
      send: createSpy((channel, ...args) => {}),
      invoke: createSpy((channel, ...args) => Promise.resolve(null)),
      on: createSpy((channel, handler) => {
        if (!subscribers.has(channel)) {
          subscribers.set(channel, []);
        }
        subscribers.get(channel).push(handler);
      }),
      off: createSpy((channel, handler) => {
        if (subscribers.has(channel)) {
          const handlers = subscribers.get(channel);
          const index = handlers.indexOf(handler);
          if (index !== -1) {
            handlers.splice(index, 1);
          }
        }
      }),
      // Test helper to trigger IPC events
      _trigger: (channel, ...args) => {
        if (subscribers.has(channel)) {
          subscribers.get(channel).forEach(handler => handler(...args));
        }
      }
    },

    // Plugin communication
    callPlugin: createSpy((pluginId, method, ...args) => {
      return Promise.resolve(null);
    }),

    getPlugin: createSpy((pluginId) => null),

    // Event emission (for testing)
    emit: createSpy((event, data) => {
      mockEventBus.emit(event, data);
    }),

    // Access to internal state for testing
    _getState: () => mockState,
    _getConfig: () => mockConfig,
    _getSubscribers: () => subscribers,
    _reset: () => {
      mockState.clear();
      mockConfig.clear();
      subscribers.clear();
    }
  };
}

/**
 * Create a mock EventBus instance
 *
 * @returns {Object} Mock EventBus with tracking capabilities
 */
export function createMockEventBus() {
  const emitter = createMockEventEmitter();
  const eventHistory = [];

  return {
    on: createSpy((event, handler) => {
      emitter.on(event, handler);
      return () => emitter.removeListener(event, handler);
    }),

    once: createSpy((event, handler) => {
      emitter.once(event, handler);
    }),

    off: createSpy((event, handler) => {
      emitter.removeListener(event, handler);
    }),

    emit: createSpy((event, data) => {
      eventHistory.push({ event, data, timestamp: Date.now() });
      emitter.emit(event, data);
    }),

    removeAllListeners: createSpy((event) => {
      emitter.removeAllListeners(event);
    }),

    // Test utilities
    getEventHistory() {
      return [...eventHistory];
    },

    getEventCount(event) {
      return eventHistory.filter(e => e.event === event).length;
    },

    clearHistory() {
      eventHistory.length = 0;
    },

    waitForEvent(event, timeout = 5000) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          emitter.removeListener(event, handler);
          reject(new Error(`Event "${event}" not emitted within ${timeout}ms`));
        }, timeout);

        const handler = (data) => {
          clearTimeout(timer);
          resolve(data);
        };

        emitter.once(event, handler);
      });
    }
  };
}

/**
 * Create a mock Logger instance
 *
 * @returns {Object} Mock Logger with call tracking
 */
export function createMockLogger() {
  return {
    info: createSpy((...args) => {}),
    warn: createSpy((...args) => {}),
    error: createSpy((...args) => {}),
    debug: createSpy((...args) => {}),
    trace: createSpy((...args) => {}),

    // Test utilities
    getLogs(level) {
      if (!level) {
        return {
          info: this.info.calls,
          warn: this.warn.calls,
          error: this.error.calls,
          debug: this.debug.calls,
          trace: this.trace.calls
        };
      }
      return this[level]?.calls || [];
    },

    clearLogs() {
      this.info.reset();
      this.warn.reset();
      this.error.reset();
      this.debug.reset();
      this.trace.reset();
    },

    hasLogged(level, ...searchArgs) {
      return this[level]?.calledWith(...searchArgs) || false;
    }
  };
}

/**
 * Create a complete mock plugin environment
 * Combines all mock utilities needed for plugin testing
 *
 * @param {Object} options - Environment configuration
 * @returns {Object} Complete plugin test environment
 */
export function createMockPluginEnvironment(options = {}) {
  const mockEventBus = createMockEventBus();
  const mockLogger = createMockLogger();
  const mockState = new Map();

  const mockAPI = createMockPluginAPI({
    eventBus: mockEventBus,
    logger: mockLogger,
    state: mockState,
    ...options
  });

  return {
    api: mockAPI,
    eventBus: mockEventBus,
    logger: mockLogger,
    state: mockState,
    electron: createElectronMock(),

    // Cleanup helper
    cleanup() {
      mockAPI._reset();
      mockEventBus.clearHistory();
      mockLogger.clearLogs();
    },

    // Reset all mocks
    reset() {
      this.cleanup();
      mockState.clear();
    }
  };
}

/**
 * Test plugin lifecycle
 * Validates that a plugin correctly implements all lifecycle methods
 *
 * @param {Function} PluginClass - Plugin constructor
 * @param {Object} manifest - Plugin manifest
 * @param {Object} api - PluginAPI instance
 * @returns {Promise<Object>} Lifecycle test results
 */
export async function testPluginLifecycle(PluginClass, manifest, api) {
  const results = {
    construct: { success: false, error: null },
    activate: { success: false, error: null },
    deactivate: { success: false, error: null },
    destroy: { success: false, error: null }
  };

  let plugin;

  // Test construction
  try {
    plugin = new PluginClass('test-plugin', manifest, api);
    results.construct.success = true;
  } catch (error) {
    results.construct.error = error;
    return results; // Can't continue without construction
  }

  // Test activation
  try {
    await plugin.activate();
    assert.strictEqual(plugin.isActive, true, 'Plugin should be active after activation');
    results.activate.success = true;
  } catch (error) {
    results.activate.error = error;
  }

  // Test deactivation
  try {
    await plugin.deactivate();
    assert.strictEqual(plugin.isActive, false, 'Plugin should be inactive after deactivation');
    results.deactivate.success = true;
  } catch (error) {
    results.deactivate.error = error;
  }

  // Test destruction
  try {
    await plugin.destroy();
    results.destroy.success = true;
  } catch (error) {
    results.destroy.error = error;
  }

  return results;
}

/**
 * Test plugin activation/deactivation cycle
 * Validates that a plugin can be activated and deactivated multiple times
 *
 * @param {Object} plugin - Plugin instance
 * @param {number} cycles - Number of cycles to test
 * @returns {Promise<void>}
 */
export async function testPluginCycles(plugin, cycles = 3) {
  for (let i = 0; i < cycles; i++) {
    await plugin.activate();
    assert.strictEqual(plugin.isActive, true, `Cycle ${i + 1}: Plugin should be active`);

    await plugin.deactivate();
    assert.strictEqual(plugin.isActive, false, `Cycle ${i + 1}: Plugin should be inactive`);
  }
}

/**
 * Test plugin error handling
 * Validates that a plugin properly handles errors during lifecycle
 *
 * @param {Function} PluginClass - Plugin constructor
 * @param {Object} manifest - Plugin manifest
 * @param {Object} api - PluginAPI instance
 * @param {Object} errorConditions - Error conditions to test
 * @returns {Promise<Object>} Error handling test results
 */
export async function testPluginErrorHandling(PluginClass, manifest, api, errorConditions = {}) {
  const results = {};

  // Test construction errors
  if (errorConditions.construct) {
    try {
      new PluginClass('test-plugin', null, api); // Invalid manifest
      results.construct = { handled: false };
    } catch (error) {
      results.construct = { handled: true, error };
    }
  }

  // Test activation errors
  if (errorConditions.activate) {
    const plugin = new PluginClass('test-plugin', manifest, api);
    try {
      // Simulate error condition
      api.getEventBus = () => { throw new Error('EventBus unavailable'); };
      await plugin.activate();
      results.activate = { handled: false };
    } catch (error) {
      results.activate = { handled: true, error };
    }
  }

  return results;
}

/**
 * Mock IPC communication for testing
 *
 * @returns {Object} Mock IPC with test utilities
 */
export function createMockIPC() {
  const channels = new Map();
  const invocations = [];

  return {
    send: createSpy((channel, ...args) => {
      invocations.push({ type: 'send', channel, args, timestamp: Date.now() });
    }),

    invoke: createSpy((channel, ...args) => {
      invocations.push({ type: 'invoke', channel, args, timestamp: Date.now() });
      const handler = channels.get(channel);
      if (handler) {
        return Promise.resolve(handler(...args));
      }
      return Promise.resolve(null);
    }),

    on: createSpy((channel, handler) => {
      if (!channels.has(channel)) {
        channels.set(channel, []);
      }
      channels.get(channel).push(handler);
    }),

    off: createSpy((channel, handler) => {
      if (channels.has(channel)) {
        const handlers = channels.get(channel);
        const index = handlers.indexOf(handler);
        if (index !== -1) {
          handlers.splice(index, 1);
        }
      }
    }),

    // Test utilities
    handle(channel, handler) {
      channels.set(channel, handler);
    },

    trigger(channel, ...args) {
      const handlers = channels.get(channel);
      if (Array.isArray(handlers)) {
        handlers.forEach(handler => handler(...args));
      }
    },

    getInvocations(channel) {
      if (channel) {
        return invocations.filter(inv => inv.channel === channel);
      }
      return [...invocations];
    },

    clearInvocations() {
      invocations.length = 0;
    },

    reset() {
      channels.clear();
      invocations.length = 0;
    }
  };
}

/**
 * Create a mock plugin manifest
 *
 * @param {Object} overrides - Custom manifest properties
 * @returns {Object} Plugin manifest
 */
export function createMockManifest(overrides = {}) {
  return {
    id: 'test-plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    description: 'A test plugin',
    author: 'Test Author',
    main: 'index.js',
    permissions: [],
    dependencies: {},
    ...overrides
  };
}

/**
 * Wait for plugin to reach a specific state
 *
 * @param {Object} plugin - Plugin instance
 * @param {string} state - Target state property
 * @param {*} expectedValue - Expected value
 * @param {number} timeout - Maximum wait time in ms
 * @returns {Promise<void>}
 */
export async function waitForPluginState(plugin, state, expectedValue, timeout = 5000) {
  return waitFor(
    () => plugin[state] === expectedValue,
    timeout,
    100
  );
}

/**
 * Assert plugin state matches expected values
 *
 * @param {Object} plugin - Plugin instance
 * @param {Object} expectedState - Expected state properties
 */
export function assertPluginState(plugin, expectedState) {
  for (const [key, expectedValue] of Object.entries(expectedState)) {
    assert.strictEqual(
      plugin[key],
      expectedValue,
      `Plugin.${key} should be ${expectedValue}, got ${plugin[key]}`
    );
  }
}

/**
 * Create a spy for plugin methods
 * Useful for tracking plugin method calls
 *
 * @param {Object} plugin - Plugin instance
 * @param {string[]} methods - Methods to spy on
 * @returns {Object} Spies for each method
 */
export function createPluginSpies(plugin, methods) {
  const spies = {};

  methods.forEach(method => {
    const original = plugin[method];
    if (typeof original === 'function') {
      spies[method] = createSpy(original.bind(plugin));
      plugin[method] = spies[method];
    }
  });

  return spies;
}

/**
 * Test template: Unit test for a plugin
 *
 * @param {string} description - Test description
 * @param {Function} PluginClass - Plugin constructor
 * @param {Object} testOptions - Test configuration
 * @returns {Function} Test function
 */
export function createPluginUnitTest(description, PluginClass, testOptions = {}) {
  return async (t) => {
    const env = createMockPluginEnvironment(testOptions.env);
    const manifest = createMockManifest(testOptions.manifest);

    try {
      const plugin = new PluginClass('test-plugin', manifest, env.api);

      // Run custom test logic
      if (testOptions.test) {
        await testOptions.test(plugin, env);
      }

      // Cleanup
      if (plugin.isActive) {
        await plugin.deactivate();
      }
      await plugin.destroy();

    } finally {
      env.cleanup();
    }
  };
}

/**
 * Test template: Integration test for plugin lifecycle
 *
 * @param {string} description - Test description
 * @param {Function} PluginClass - Plugin constructor
 * @returns {Function} Test function
 */
export function createPluginIntegrationTest(description, PluginClass) {
  return async (t) => {
    const env = createMockPluginEnvironment();
    const manifest = createMockManifest();

    try {
      const results = await testPluginLifecycle(PluginClass, manifest, env.api);

      assert.strictEqual(results.construct.success, true, 'Plugin construction should succeed');
      assert.strictEqual(results.activate.success, true, 'Plugin activation should succeed');
      assert.strictEqual(results.deactivate.success, true, 'Plugin deactivation should succeed');
      assert.strictEqual(results.destroy.success, true, 'Plugin destruction should succeed');

    } finally {
      env.cleanup();
    }
  };
}

/**
 * Test template: IPC communication test
 *
 * @param {string} description - Test description
 * @param {Function} testFn - Test function
 * @returns {Function} Test function
 */
export function createPluginIPCTest(description, testFn) {
  return async (t) => {
    const env = createMockPluginEnvironment();
    const ipc = createMockIPC();

    // Replace API IPC with mock
    env.api.ipc = ipc;

    try {
      await testFn(ipc, env);
    } finally {
      ipc.reset();
      env.cleanup();
    }
  };
}

/**
 * Batch test helper: Run multiple lifecycle tests
 *
 * @param {Array<{name: string, PluginClass: Function, manifest: Object}>} plugins - Plugins to test
 * @returns {Promise<Object>} Combined test results
 */
export async function batchTestPlugins(plugins) {
  const results = {};

  for (const { name, PluginClass, manifest } of plugins) {
    const env = createMockPluginEnvironment();

    try {
      results[name] = await testPluginLifecycle(
        PluginClass,
        manifest || createMockManifest({ id: name }),
        env.api
      );
    } catch (error) {
      results[name] = { error: error.message };
    } finally {
      env.cleanup();
    }
  }

  return results;
}

/**
 * Performance testing helper
 * Measure plugin lifecycle performance
 *
 * @param {Function} PluginClass - Plugin constructor
 * @param {Object} manifest - Plugin manifest
 * @param {Object} api - PluginAPI instance
 * @returns {Promise<Object>} Performance metrics
 */
export async function measurePluginPerformance(PluginClass, manifest, api) {
  const metrics = {
    construct: 0,
    activate: 0,
    deactivate: 0,
    destroy: 0
  };

  // Measure construction
  const constructStart = performance.now();
  const plugin = new PluginClass('perf-test', manifest, api);
  metrics.construct = performance.now() - constructStart;

  // Measure activation
  const activateStart = performance.now();
  await plugin.activate();
  metrics.activate = performance.now() - activateStart;

  // Measure deactivation
  const deactivateStart = performance.now();
  await plugin.deactivate();
  metrics.deactivate = performance.now() - deactivateStart;

  // Measure destruction
  const destroyStart = performance.now();
  await plugin.destroy();
  metrics.destroy = performance.now() - destroyStart;

  metrics.total = metrics.construct + metrics.activate + metrics.deactivate + metrics.destroy;

  return metrics;
}

// Export all utilities
export default {
  createMockPluginAPI,
  createMockEventBus,
  createMockLogger,
  createMockPluginEnvironment,
  testPluginLifecycle,
  testPluginCycles,
  testPluginErrorHandling,
  createMockIPC,
  createMockManifest,
  waitForPluginState,
  assertPluginState,
  createPluginSpies,
  createPluginUnitTest,
  createPluginIntegrationTest,
  createPluginIPCTest,
  batchTestPlugins,
  measurePluginPerformance
};
