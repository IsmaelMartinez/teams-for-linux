/**
 * Custom Assertions for Domain Testing
 * Provides domain-specific assertion helpers
 */

import { strict as assert } from 'node:assert';

/**
 * Assert that a value is a valid plugin
 */
export function assertValidPlugin(plugin) {
  assert.ok(plugin, 'Plugin should exist');
  assert.equal(typeof plugin.name, 'string', 'Plugin should have a name');
  assert.equal(typeof plugin.version, 'string', 'Plugin should have a version');
  assert.equal(typeof plugin.initialize, 'function', 'Plugin should have initialize method');
  assert.equal(typeof plugin.start, 'function', 'Plugin should have start method');
  assert.equal(typeof plugin.stop, 'function', 'Plugin should have stop method');
  assert.equal(typeof plugin.destroy, 'function', 'Plugin should have destroy method');
}

/**
 * Assert that a value is a valid service
 */
export function assertValidService(service) {
  assert.ok(service, 'Service should exist');
  assert.equal(typeof service.name, 'string', 'Service should have a name');
}

/**
 * Assert that an event was emitted
 */
export function assertEventEmitted(emitter, eventName, timeout = 1000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Event '${eventName}' was not emitted within ${timeout}ms`));
    }, timeout);

    emitter.once(eventName, (...args) => {
      clearTimeout(timer);
      resolve(args);
    });
  });
}

/**
 * Assert that a promise rejects with a specific error
 */
export async function assertRejects(promise, expectedError) {
  try {
    await promise;
    assert.fail('Expected promise to reject');
  } catch (error) {
    if (expectedError instanceof RegExp) {
      assert.match(error.message, expectedError);
    } else if (typeof expectedError === 'string') {
      assert.equal(error.message, expectedError);
    } else if (typeof expectedError === 'function') {
      assert.ok(error instanceof expectedError);
    }
  }
}

/**
 * Assert that a value is eventually true
 */
export async function assertEventually(fn, timeout = 5000, interval = 100) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      const result = await fn();
      if (result) {
        return;
      }
    } catch (error) {
      // Continue trying
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  assert.fail(`Assertion did not become true within ${timeout}ms`);
}

/**
 * Assert that objects are deeply equal
 */
export function assertDeepEqual(actual, expected, message) {
  assert.deepStrictEqual(actual, expected, message);
}

/**
 * Assert that a collection contains an item
 */
export function assertContains(collection, item, message) {
  const contains = Array.isArray(collection)
    ? collection.includes(item)
    : collection instanceof Set
    ? collection.has(item)
    : collection instanceof Map
    ? collection.has(item)
    : false;

  assert.ok(contains, message || `Collection should contain ${item}`);
}

/**
 * Assert that a collection does not contain an item
 */
export function assertNotContains(collection, item, message) {
  const contains = Array.isArray(collection)
    ? collection.includes(item)
    : collection instanceof Set
    ? collection.has(item)
    : collection instanceof Map
    ? collection.has(item)
    : false;

  assert.ok(!contains, message || `Collection should not contain ${item}`);
}

/**
 * Assert that a value matches a schema
 */
export function assertMatchesSchema(value, schema) {
  for (const [key, type] of Object.entries(schema)) {
    assert.ok(key in value, `Value should have property '${key}'`);
    assert.equal(typeof value[key], type, `Property '${key}' should be of type '${type}'`);
  }
}

/**
 * Assert that a function throws
 */
export function assertThrows(fn, expectedError) {
  assert.throws(fn, expectedError);
}

/**
 * Assert that a value is within a range
 */
export function assertInRange(value, min, max, message) {
  assert.ok(
    value >= min && value <= max,
    message || `Value ${value} should be between ${min} and ${max}`
  );
}

/**
 * Assert that an array has a specific length
 */
export function assertLength(array, length, message) {
  assert.equal(array.length, length, message || `Array should have length ${length}`);
}

/**
 * Assert that a string matches a pattern
 */
export function assertMatches(string, pattern, message) {
  assert.match(string, pattern, message);
}

/**
 * Assert that execution time is within bounds
 */
export async function assertExecutionTime(fn, maxMs, message) {
  const startTime = Date.now();
  await fn();
  const duration = Date.now() - startTime;
  assert.ok(
    duration <= maxMs,
    message || `Execution took ${duration}ms, expected <= ${maxMs}ms`
  );
}

/**
 * Assert that a value is a valid configuration object
 */
export function assertValidConfig(config) {
  assert.ok(config, 'Config should exist');
  assert.equal(typeof config, 'object', 'Config should be an object');
  assert.ok(!Array.isArray(config), 'Config should not be an array');
}
