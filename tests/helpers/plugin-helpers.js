/**
 * Plugin Testing Helpers
 * Utilities for testing plugin lifecycle and behavior
 */

/**
 * Create a mock plugin context
 */
export function createPluginContext() {
  const services = new Map();

  return {
    services,
    getService(name) {
      return services.get(name);
    },
    registerService(name, service) {
      services.set(name, service);
    },
    emit(event, data) {
      // Mock event emission
    },
    on(event, handler) {
      // Mock event listening
    },
  };
}

/**
 * Create a mock plugin
 */
export function createMockPlugin(config = {}) {
  return {
    name: config.name || 'test-plugin',
    version: config.version || '1.0.0',
    enabled: config.enabled !== false,
    lifecycle: {
      initialized: false,
      started: false,
      stopped: false,
      destroyed: false,
    },
    async initialize(context) {
      this.lifecycle.initialized = true;
      this.context = context;
      if (config.onInitialize) {
        await config.onInitialize(context);
      }
    },
    async start() {
      this.lifecycle.started = true;
      if (config.onStart) {
        await config.onStart();
      }
    },
    async stop() {
      this.lifecycle.stopped = true;
      if (config.onStop) {
        await config.onStop();
      }
    },
    async destroy() {
      this.lifecycle.destroyed = true;
      if (config.onDestroy) {
        await config.onDestroy();
      }
    },
  };
}

/**
 * Test plugin lifecycle
 */
export async function testPluginLifecycle(plugin, context) {
  const results = {
    initialize: { success: false, error: null },
    start: { success: false, error: null },
    stop: { success: false, error: null },
    destroy: { success: false, error: null },
  };

  // Test initialize
  try {
    await plugin.initialize(context);
    results.initialize.success = true;
  } catch (error) {
    results.initialize.error = error;
  }

  // Test start
  try {
    await plugin.start();
    results.start.success = true;
  } catch (error) {
    results.start.error = error;
  }

  // Test stop
  try {
    await plugin.stop();
    results.stop.success = true;
  } catch (error) {
    results.stop.error = error;
  }

  // Test destroy
  try {
    await plugin.destroy();
    results.destroy.success = true;
  } catch (error) {
    results.destroy.error = error;
  }

  return results;
}

/**
 * Wait for plugin state
 */
export function waitForPluginState(plugin, state, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const checkState = () => {
      if (plugin.lifecycle[state]) {
        resolve(true);
      } else if (Date.now() - startTime > timeout) {
        reject(new Error(`Timeout waiting for plugin state: ${state}`));
      } else {
        setTimeout(checkState, 100);
      }
    };

    checkState();
  });
}

/**
 * Create a mock plugin manager
 */
export function createMockPluginManager() {
  const plugins = new Map();

  return {
    plugins,

    async register(plugin) {
      plugins.set(plugin.name, plugin);
    },

    async unregister(name) {
      plugins.delete(name);
    },

    get(name) {
      return plugins.get(name);
    },

    getAll() {
      return Array.from(plugins.values());
    },

    async initializeAll(context) {
      for (const plugin of plugins.values()) {
        await plugin.initialize(context);
      }
    },

    async startAll() {
      for (const plugin of plugins.values()) {
        if (plugin.enabled) {
          await plugin.start();
        }
      }
    },

    async stopAll() {
      for (const plugin of plugins.values()) {
        if (plugin.lifecycle.started) {
          await plugin.stop();
        }
      }
    },

    async destroyAll() {
      for (const plugin of plugins.values()) {
        await plugin.destroy();
      }
      plugins.clear();
    },
  };
}

/**
 * Assert plugin state
 */
export function assertPluginState(plugin, expectedState) {
  const errors = [];

  for (const [state, expected] of Object.entries(expectedState)) {
    if (plugin.lifecycle[state] !== expected) {
      errors.push(`Expected ${state} to be ${expected}, but was ${plugin.lifecycle[state]}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Plugin state assertion failed:\n${errors.join('\n')}`);
  }
}

/**
 * Create a mock service
 */
export function createMockService(name, methods = {}) {
  return {
    name,
    ...methods,
    _calls: new Map(),
    _trackCall(method, args) {
      if (!this._calls.has(method)) {
        this._calls.set(method, []);
      }
      this._calls.get(method).push(args);
    },
    getCalls(method) {
      return this._calls.get(method) || [];
    },
    clearCalls() {
      this._calls.clear();
    },
  };
}
