/**
 * Test Utilities
 * General-purpose testing utilities and helpers
 */

import { strict as assert } from 'node:assert';

/**
 * Wait for a condition to be true
 * @param {Function} condition - Function that returns boolean
 * @param {number} timeout - Maximum time to wait in ms
 * @param {number} interval - Check interval in ms
 * @returns {Promise<void>}
 */
export async function waitFor(condition, timeout = 5000, interval = 100) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      if (await condition()) {
        return;
      }
    } catch (error) {
      // Continue waiting
    }
    await sleep(interval);
  }

  throw new Error(`Condition not met within ${timeout}ms`);
}

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a spy function
 * @param {Function} fn - Original function to spy on
 * @returns {Function} Spy function with call tracking
 */
export function createSpy(fn = () => {}) {
  const calls = [];
  const spy = function (...args) {
    calls.push(args);
    return fn.apply(this, args);
  };

  spy.calls = calls;
  spy.callCount = () => calls.length;
  spy.calledWith = (...args) => {
    return calls.some(call =>
      call.length === args.length &&
      call.every((arg, i) => arg === args[i])
    );
  };
  spy.lastCall = () => calls[calls.length - 1];
  spy.reset = () => calls.length = 0;

  return spy;
}

/**
 * Create a stub function that returns a specific value
 * @param {*} returnValue - Value to return
 * @returns {Function} Stub function
 */
export function createStub(returnValue) {
  return createSpy(() => returnValue);
}

/**
 * Measure execution time of a function
 * @param {Function} fn - Function to measure
 * @returns {Promise<{result: *, duration: number}>}
 */
export async function measureTime(fn) {
  const start = performance.now();
  const result = await fn();
  const duration = performance.now() - start;
  return { result, duration };
}

/**
 * Deep clone an object
 * @param {*} obj - Object to clone
 * @returns {*} Cloned object
 */
export function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime());
  }

  if (obj instanceof Array) {
    return obj.map(item => deepClone(item));
  }

  if (obj instanceof Map) {
    const map = new Map();
    obj.forEach((value, key) => {
      map.set(key, deepClone(value));
    });
    return map;
  }

  if (obj instanceof Set) {
    const set = new Set();
    obj.forEach(value => {
      set.add(deepClone(value));
    });
    return set;
  }

  const cloned = {};
  Object.keys(obj).forEach(key => {
    cloned[key] = deepClone(obj[key]);
  });
  return cloned;
}

/**
 * Create a promise that can be resolved or rejected externally
 * @returns {{promise: Promise, resolve: Function, reject: Function}}
 */
export function createDeferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * Capture console output
 * @param {Function} fn - Function to run while capturing
 * @returns {Promise<{stdout: string[], stderr: string[]}>}
 */
export async function captureConsole(fn) {
  const stdout = [];
  const stderr = [];

  const originalLog = console.log;
  const originalError = console.error;

  console.log = (...args) => stdout.push(args.join(' '));
  console.error = (...args) => stderr.push(args.join(' '));

  try {
    await fn();
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }

  return { stdout, stderr };
}

/**
 * Suppress console output during a function execution
 * @param {Function} fn - Function to run with suppressed output
 * @returns {Promise<*>} Result of the function
 */
export async function suppressConsole(fn) {
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;

  console.log = () => {};
  console.error = () => {};
  console.warn = () => {};

  try {
    return await fn();
  } finally {
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
  }
}

/**
 * Create a timeout promise
 * @param {number} ms - Milliseconds before timeout
 * @param {string} message - Error message
 * @returns {Promise<never>}
 */
export function timeout(ms, message = 'Operation timed out') {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(message)), ms);
  });
}

/**
 * Race a promise against a timeout
 * @param {Promise} promise - Promise to race
 * @param {number} ms - Timeout in milliseconds
 * @returns {Promise<*>}
 */
export function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    timeout(ms, `Promise timed out after ${ms}ms`)
  ]);
}

/**
 * Retry a function until it succeeds or max attempts reached
 * @param {Function} fn - Function to retry
 * @param {number} maxAttempts - Maximum number of attempts
 * @param {number} delay - Delay between attempts in ms
 * @returns {Promise<*>}
 */
export async function retry(fn, maxAttempts = 3, delay = 1000) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        await sleep(delay);
      }
    }
  }

  throw new Error(`Failed after ${maxAttempts} attempts: ${lastError.message}`);
}

/**
 * Create a mock timer
 * @returns {{tick: Function, now: Function, reset: Function}}
 */
export function createMockTimer() {
  let currentTime = 0;
  const timers = [];

  return {
    setTimeout(fn, delay) {
      const id = timers.length;
      timers.push({ fn, time: currentTime + delay, type: 'timeout' });
      return id;
    },
    setInterval(fn, delay) {
      const id = timers.length;
      timers.push({ fn, time: currentTime + delay, delay, type: 'interval' });
      return id;
    },
    clearTimeout(id) {
      if (timers[id]) {
        timers[id] = null;
      }
    },
    clearInterval(id) {
      if (timers[id]) {
        timers[id] = null;
      }
    },
    tick(ms) {
      currentTime += ms;
      const toExecute = timers.filter(t => t && t.time <= currentTime);

      toExecute.forEach(timer => {
        if (!timer) return;
        timer.fn();

        if (timer.type === 'interval') {
          timer.time = currentTime + timer.delay;
        } else {
          const index = timers.indexOf(timer);
          if (index !== -1) {
            timers[index] = null;
          }
        }
      });
    },
    now() {
      return currentTime;
    },
    reset() {
      currentTime = 0;
      timers.length = 0;
    }
  };
}

/**
 * Create a mock event emitter
 * @returns {{on: Function, once: Function, emit: Function, removeListener: Function, listeners: Function}}
 */
export function createMockEventEmitter() {
  const events = new Map();

  return {
    on(event, handler) {
      if (!events.has(event)) {
        events.set(event, []);
      }
      events.get(event).push({ handler, once: false });
      return this;
    },

    once(event, handler) {
      if (!events.has(event)) {
        events.set(event, []);
      }
      events.get(event).push({ handler, once: true });
      return this;
    },

    emit(event, ...args) {
      if (!events.has(event)) return false;

      const handlers = events.get(event);
      const toRemove = [];

      handlers.forEach((item, index) => {
        item.handler(...args);
        if (item.once) {
          toRemove.push(index);
        }
      });

      // Remove once handlers in reverse order to maintain indices
      toRemove.reverse().forEach(index => handlers.splice(index, 1));

      return handlers.length > 0;
    },

    removeListener(event, handler) {
      if (!events.has(event)) return this;

      const handlers = events.get(event);
      const index = handlers.findIndex(item => item.handler === handler);

      if (index !== -1) {
        handlers.splice(index, 1);
      }

      return this;
    },

    removeAllListeners(event) {
      if (event) {
        events.delete(event);
      } else {
        events.clear();
      }
      return this;
    },

    listeners(event) {
      return events.has(event) ? events.get(event).map(item => item.handler) : [];
    },

    listenerCount(event) {
      return events.has(event) ? events.get(event).length : 0;
    }
  };
}

/**
 * Assert that two objects are deeply equal (with better diff output)
 * @param {*} actual - Actual value
 * @param {*} expected - Expected value
 * @param {string} path - Current path for nested objects
 */
export function assertDeepEqual(actual, expected, path = 'root') {
  if (actual === expected) return;

  if (typeof actual !== typeof expected) {
    throw new Error(`Type mismatch at ${path}: expected ${typeof expected}, got ${typeof actual}`);
  }

  if (actual === null || expected === null) {
    if (actual !== expected) {
      throw new Error(`Null mismatch at ${path}`);
    }
    return;
  }

  if (typeof actual === 'object') {
    const actualKeys = Object.keys(actual).sort();
    const expectedKeys = Object.keys(expected).sort();

    if (actualKeys.length !== expectedKeys.length) {
      throw new Error(`Key count mismatch at ${path}: expected ${expectedKeys.length}, got ${actualKeys.length}`);
    }

    for (let i = 0; i < actualKeys.length; i++) {
      if (actualKeys[i] !== expectedKeys[i]) {
        throw new Error(`Key mismatch at ${path}: expected "${expectedKeys[i]}", got "${actualKeys[i]}"`);
      }
    }

    for (const key of actualKeys) {
      assertDeepEqual(actual[key], expected[key], `${path}.${key}`);
    }

    return;
  }

  throw new Error(`Value mismatch at ${path}: expected ${expected}, got ${actual}`);
}

/**
 * Create a temporary directory for testing
 * @param {string} prefix - Prefix for the directory name
 * @returns {Promise<{path: string, cleanup: Function}>}
 */
export async function createTempDir(prefix = 'test-') {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');

  const tempPath = await mkdtemp(join(tmpdir(), prefix));

  return {
    path: tempPath,
    async cleanup() {
      await rm(tempPath, { recursive: true, force: true });
    }
  };
}

/**
 * Mock a module for testing
 * @param {string} modulePath - Path to the module
 * @param {Object} mockImplementation - Mock implementation
 * @returns {{restore: Function}}
 */
export function mockModule(modulePath, mockImplementation) {
  // Note: This is a simple implementation. For complex mocking,
  // consider using module.register() or other Node.js features
  const original = {};

  return {
    restore() {
      // Restore original module
    }
  };
}

/**
 * Generate random test data
 */
export const random = {
  string(length = 10) {
    return Math.random().toString(36).substring(2, length + 2);
  },

  number(min = 0, max = 100) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },

  boolean() {
    return Math.random() > 0.5;
  },

  array(length = 5, generator = random.number) {
    return Array.from({ length }, generator);
  },

  email() {
    return `${this.string()}@${this.string()}.com`;
  },

  url() {
    return `https://${this.string()}.com/${this.string()}`;
  },

  date(start = new Date(2020, 0, 1), end = new Date()) {
    return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
  }
};
