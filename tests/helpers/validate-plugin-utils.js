#!/usr/bin/env node
/**
 * Validation Script for Plugin Testing Utilities
 * Run this to verify all mock utilities are working correctly
 */

import { strict as assert } from 'node:assert';
import {
  createMockPluginEnvironment,
  createMockPluginAPI,
  createMockEventBus,
  createMockLogger,
  createMockIPC,
  createMockManifest
} from './plugin-test-utils.js';

console.log('Validating plugin testing utilities...\n');

// Test 1: Mock PluginAPI
console.log('1. Testing createMockPluginAPI...');
const api = createMockPluginAPI();
assert.ok(api.getEventBus, 'API should have getEventBus method');
assert.ok(api.getLogger, 'API should have getLogger method');
assert.ok(api.setState, 'API should have setState method');
assert.ok(api.getState, 'API should have getState method');
assert.ok(api.ipc, 'API should have ipc object');
console.log('✓ createMockPluginAPI works correctly\n');

// Test 2: Mock EventBus
console.log('2. Testing createMockEventBus...');
const eventBus = createMockEventBus();
let eventReceived = false;
eventBus.on('test-event', () => { eventReceived = true; });
eventBus.emit('test-event');
assert.strictEqual(eventReceived, true, 'Event should be received');
assert.strictEqual(eventBus.getEventCount('test-event'), 1, 'Event count should be 1');
console.log('✓ createMockEventBus works correctly\n');

// Test 3: Mock Logger
console.log('3. Testing createMockLogger...');
const logger = createMockLogger();
logger.info('test message');
assert.strictEqual(logger.info.callCount(), 1, 'Logger should track calls');
const logs = logger.getLogs('info');
assert.strictEqual(logs.length, 1, 'Should have one info log');
console.log('✓ createMockLogger works correctly\n');

// Test 4: Mock IPC
console.log('4. Testing createMockIPC...');
const ipc = createMockIPC();
ipc.send('test-channel', { data: 'test' });
assert.strictEqual(ipc.send.callCount(), 1, 'IPC should track send calls');
const invocations = ipc.getInvocations('test-channel');
assert.strictEqual(invocations.length, 1, 'Should track invocations');
console.log('✓ createMockIPC works correctly\n');

// Test 5: Mock Environment
console.log('5. Testing createMockPluginEnvironment...');
const env = createMockPluginEnvironment();
assert.ok(env.api, 'Environment should have api');
assert.ok(env.eventBus, 'Environment should have eventBus');
assert.ok(env.logger, 'Environment should have logger');
assert.ok(env.state, 'Environment should have state');
assert.ok(env.cleanup, 'Environment should have cleanup method');
console.log('✓ createMockPluginEnvironment works correctly\n');

// Test 6: Mock Manifest
console.log('6. Testing createMockManifest...');
const manifest = createMockManifest({ id: 'test-plugin' });
assert.strictEqual(manifest.id, 'test-plugin', 'Manifest should have id');
assert.ok(manifest.version, 'Manifest should have version');
assert.ok(manifest.name, 'Manifest should have name');
console.log('✓ createMockManifest works correctly\n');

// Test 7: State Management
console.log('7. Testing state management...');
env.api.setState('test-key', 'test-value');
assert.strictEqual(env.api.getState('test-key'), 'test-value', 'Should store and retrieve state');
env.api.deleteState('test-key');
assert.strictEqual(env.api.getState('test-key'), undefined, 'Should delete state');
console.log('✓ State management works correctly\n');

// Test 8: Event History
console.log('8. Testing event history...');
env.eventBus.clearHistory(); // Clear any previous events
env.eventBus.emit('event-1', { data: 1 });
env.eventBus.emit('event-2', { data: 2 });
env.eventBus.emit('event-1', { data: 3 });
const history = env.eventBus.getEventHistory();
assert.strictEqual(history.length, 3, 'Should track all events');
assert.strictEqual(env.eventBus.getEventCount('event-1'), 2, 'Should count event-1 correctly');
console.log('✓ Event history works correctly\n');

// Test 9: Logger Filtering
console.log('9. Testing logger filtering...');
env.logger.info('info message');
env.logger.error('error message');
env.logger.debug('debug message');
const infoLogs = env.logger.getLogs('info');
const errorLogs = env.logger.getLogs('error');
assert.ok(infoLogs.length > 0, 'Should have info logs');
assert.ok(errorLogs.length > 0, 'Should have error logs');
console.log('✓ Logger filtering works correctly\n');

// Test 10: IPC Handlers
console.log('10. Testing IPC handlers...');
ipc.handle('get-data', (request) => ({ response: request.value * 2 }));
const result = await ipc.invoke('get-data', { value: 5 });
assert.deepStrictEqual(result, { response: 10 }, 'Handler should process request');
console.log('✓ IPC handlers work correctly\n');

// Test 11: Cleanup
console.log('11. Testing cleanup...');
env.eventBus.emit('test', {});
env.logger.info('test');
env.cleanup();
const historyAfterCleanup = env.eventBus.getEventHistory();
const logsAfterCleanup = env.logger.getLogs('info');
assert.strictEqual(historyAfterCleanup.length, 0, 'History should be cleared');
assert.strictEqual(logsAfterCleanup.length, 0, 'Logs should be cleared');
console.log('✓ Cleanup works correctly\n');

// Test 12: Namespaced Logger
console.log('12. Testing namespaced logger...');
const namespacedLogger = env.api.getLogger('my-plugin');
namespacedLogger.info('namespaced message');
assert.strictEqual(namespacedLogger.info.callCount(), 1, 'Namespaced logger should track calls');
console.log('✓ Namespaced logger works correctly\n');

console.log('═══════════════════════════════════════════════════');
console.log('All validation tests passed! ✓');
console.log('═══════════════════════════════════════════════════');
console.log('\nPlugin testing utilities are ready to use.');
console.log('\nNext steps:');
console.log('  1. Review examples in tests/examples/');
console.log('  2. Read the guide: tests/PLUGIN-TESTING-GUIDE.md');
console.log('  3. Write your plugin tests!');
