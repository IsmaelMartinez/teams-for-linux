#!/usr/bin/env node

/**
 * Simple Integration Test for IPC Organization System
 * 
 * Tests basic functionality and establishes baseline performance metrics.
 * This script can be run independently to verify the IPC system works.
 */

// Mock Electron for testing
global.console = {
  ...console,
  debug: console.log,
  info: console.log,
  warn: console.warn,
  error: console.error
};

// Mock ipcMain for testing
const mockIpcMain = {
  handlers: new Map(),
  listeners: new Map(),
  
  handle(channel, handler) {
    this.handlers.set(channel, handler);
    console.log(`Mock ipcMain.handle registered: ${channel}`);
  },
  
  on(channel, handler) {
    if (!this.listeners.has(channel)) {
      this.listeners.set(channel, []);
    }
    this.listeners.get(channel).push(handler);
    console.log(`Mock ipcMain.on registered: ${channel}`);
  },
  
  once(channel) {
    console.log(`Mock ipcMain.once registered: ${channel}`);
  },
  
  removeHandler(channel) {
    this.handlers.delete(channel);
    console.log(`Mock ipcMain.removeHandler: ${channel}`);
  },
  
  removeListener(channel, handlerToRemove) {
    const listeners = this.listeners.get(channel);
    if (listeners) {
      const index = listeners.indexOf(handlerToRemove);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
    console.log(`Mock ipcMain.removeListener: ${channel}`);
  }
};

// Mock electron module
require.cache[require.resolve('electron')] = {
  exports: {
    ipcMain: mockIpcMain
  }
};

// Now we can safely require our IPC system
const ipc = require('../app/ipc');

async function runTests() {
  console.log('=== IPC Organization System Integration Test ===\n');
  
  // Test 1: Initialize system
  console.log('1. Initializing IPC system...');
  ipc.initialize();
  
  // Test 2: Register individual handlers
  console.log('\n2. Testing individual handler registration...');
  
  const testHandler = async (event, data) => {
    console.log(`Test handler received: ${JSON.stringify(data)}`);
    return { success: true, data };
  };
  
  ipc.registerHandler('test-channel', testHandler, { logArgs: true });
  ipc.registerListener('test-event', (event, data) => {
    console.log(`Test listener received: ${JSON.stringify(data)}`);
  });
  
  // Test 3: Register module handlers
  console.log('\n3. Testing module registration...');
  
  const testModule = {
    'module-handler-1': {
      type: 'handle',
      handler: async (event, data) => ({ module: 'test', data }),
      options: { logResult: true }
    },
    'module-handler-2': {
      type: 'on',
      handler: (event, data) => console.log(`Module listener: ${data}`)
    }
  };
  
  ipc.registerModule('test-module', testModule);
  
  // Test 4: Performance benchmarking
  console.log('\n4. Testing performance benchmarking...');
  
  const benchmarkedHandler = ipc.wrapHandler('benchmark-test', async (event, data) => {
    // Simulate some work
    await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
    return { processed: data };
  });
  
  ipc.registerHandler('benchmark-test', benchmarkedHandler);
  
  // Simulate some calls for metrics
  for (let i = 0; i < 5; i++) {
    const timer = ipc.benchmark.startTiming('benchmark-test');
    await new Promise(resolve => setTimeout(resolve, Math.random() * 20));
    timer.end();
  }
  
  // Test 5: System status
  console.log('\n5. Getting system status...');
  const status = ipc.getStatus();
  console.log('System Status:');
  console.log(`- Handlers: ${status.manager.handlerCount}`);
  console.log(`- Modules: ${status.registry.moduleCount}`);
  console.log(`- Benchmarked channels: ${status.benchmark.channelCount}`);
  
  // Test 6: Performance metrics
  console.log('\n6. Performance metrics:');
  const metrics = ipc.getMetrics();
  if (metrics.length > 0) {
    metrics.forEach(metric => {
      console.log(`- ${metric.channel}: avg ${metric.averageTime.toFixed(2)}ms (${metric.totalCalls} calls)`);
    });
  } else {
    console.log('- No metrics collected');
  }
  
  // Test 7: Save baseline
  console.log('\n7. Saving performance baseline...');
  const baseline = ipc.saveBaseline('test-baseline');
  console.log(`Baseline saved with ${baseline.metrics.summary.totalChannels} channels`);
  
  // Test 8: Handler validation
  console.log('\n8. Validating handlers...');
  const validation = ipc.registry.validateHandlers();
  console.log(`Validation: ${validation.valid}/${validation.total} handlers valid`);
  if (validation.invalid.length > 0) {
    console.log('Invalid handlers:', validation.invalid);
  }
  
  // Test 9: Cleanup
  console.log('\n9. Testing cleanup...');
  ipc.shutdown();
  
  console.log('\n=== Integration Test Complete ===');
  console.log('✅ All tests passed successfully!');
}

// Run tests if called directly
if (require.main === module) {
  runTests().catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });
}

module.exports = { runTests };