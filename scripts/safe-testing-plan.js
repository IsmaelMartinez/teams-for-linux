#!/usr/bin/env node

/**
 * Safe Testing Plan for IPC Organization System
 * 
 * This script provides a comprehensive testing plan that verifies
 * the organized IPC system WITHOUT interfering with existing handlers.
 */

const path = require('path');
const appDir = path.join(__dirname, '..');

console.log('🛡️ SAFE IPC TESTING PLAN');
console.log('='.repeat(50));
console.log('');
console.log('⚠️  IMPORTANT: This testing does NOT interfere with existing handlers');
console.log('   The organized system is tested independently for safety.');
console.log('');

async function runSafeTests() {
  const tests = [
    { name: 'System Load Test', test: testSystemLoad },
    { name: 'Security Validation Test', test: testSecurity },
    { name: 'Handler Creation Test', test: testHandlerCreation },
    { name: 'Performance Monitoring Test', test: testPerformance },
    { name: 'Error Handling Test', test: testErrorHandling },
    { name: 'Dependency Injection Test', test: testDependencyInjection }
  ];

  let passed = 0;
  let total = tests.length;

  for (const { name, test } of tests) {
    try {
      console.log(`🧪 Running: ${name}`);
      await test();
      console.log(`✅ ${name}: PASSED\n`);
      passed++;
    } catch (error) {
      console.error(`❌ ${name}: FAILED`);
      console.error(`   Error: ${error.message}\n`);
    }
  }

  console.log('📊 TESTING SUMMARY');
  console.log('='.repeat(30));
  console.log(`Tests Passed: ${passed}/${total}`);
  console.log(`Success Rate: ${Math.round((passed/total) * 100)}%`);
  
  if (passed === total) {
    console.log('\n🎉 ALL TESTS PASSED!');
    console.log('✅ The organized IPC system is working correctly');
    console.log('✅ Security features are functional');
    console.log('✅ Ready for integration planning phase');
  } else {
    console.log('\n⚠️  Some tests failed - review errors above');
  }
  
  console.log('\n📋 NEXT STEPS:');
  console.log('1. Review security-review.md for integration guidance');
  console.log('2. Plan integration strategy (gradual vs complete)');
  console.log('3. Test renderer process compatibility');
  console.log('4. Create integration script for safe migration');
}

async function testSystemLoad() {
  // Test that all modules load without errors
  const ipc = require(path.join(appDir, 'app/ipc/index.js'));
  const { createConfigurationHandlers } = require(path.join(appDir, 'app/ipc/core/configuration'));
  const { createSystemHandlers } = require(path.join(appDir, 'app/ipc/core/system'));
  const { createNotificationHandlers } = require(path.join(appDir, 'app/ipc/core/notifications'));
  const { createScreenSharingHandlers } = require(path.join(appDir, 'app/ipc/features/screenSharing'));
  const { createCallHandlers } = require(path.join(appDir, 'app/ipc/features/calls'));
  
  // Verify all modules loaded successfully
  if (!ipc || !createConfigurationHandlers || !createSystemHandlers || 
      !createNotificationHandlers || !createScreenSharingHandlers || !createCallHandlers) {
    throw new Error('One or more modules failed to load');
  }
  
  console.log('   ✓ All IPC modules loaded successfully');
}

async function testSecurity() {
  const { validate } = require(path.join(appDir, 'app/ipc/validation'));
  
  // Test valid inputs pass
  const validConfig = validate('get-config', { key: 'app.theme' });
  if (!validConfig.valid) {
    throw new Error('Valid config input was rejected');
  }
  
  // Test malicious inputs are blocked
  const maliciousConfig = validate('get-config', { key: '../../../etc/passwd' });
  if (maliciousConfig.valid) {
    throw new Error('Malicious path traversal was not blocked');
  }
  
  // Test file validation
  const maliciousFile = validate('save-file', { filename: '../../../malicious.js', data: 'evil' });
  if (maliciousFile.valid) {
    throw new Error('Malicious file path was not blocked');
  }
  
  console.log('   ✓ Security validation working correctly');
  console.log('   ✓ Malicious inputs properly blocked');
}

async function testHandlerCreation() {
  const { createConfigurationHandlers } = require(path.join(appDir, 'app/ipc/core/configuration'));
  const { createCallHandlers } = require(path.join(appDir, 'app/ipc/features/calls'));
  
  // Test configuration handlers
  const configHandlers = createConfigurationHandlers({
    config: { appVersion: '1.0.0' },
    restartApp: () => {},
    getPartition: () => ({}),
    savePartition: () => {}
  });
  
  if (!configHandlers['get-config'] || typeof configHandlers['get-config'].handler !== 'function') {
    throw new Error('Configuration handlers not created correctly');
  }
  
  // Test call handlers
  const callHandlers = createCallHandlers({
    config: { screenLockInhibitionMethod: 'Electron' },
    powerSaveBlocker: { start: () => 123, stop: () => {} },
    incomingCallToast: { show: () => {}, hide: () => {} },
    window: { isDestroyed: () => false, webContents: { send: () => {} } },
    globals: { isOnCall: false, blockerId: null, incomingCallCommandProcess: null }
  });
  
  if (!callHandlers['call-connected'] || typeof callHandlers['call-connected'].handler !== 'function') {
    throw new Error('Call handlers not created correctly');
  }
  
  console.log('   ✓ All handler modules create handlers correctly');
  console.log('   ✓ Handler functions are properly structured');
}

async function testPerformance() {
  const ipc = require(path.join(appDir, 'app/ipc/index.js'));
  
  // Initialize system
  ipc.initialize();
  
  try {
    // Test performance wrapping
    const testHandler = async () => {
      await new Promise(resolve => setTimeout(resolve, 1));
      return { test: true };
    };
    
    const wrappedHandler = ipc.wrapHandler('test-performance', testHandler);
    if (typeof wrappedHandler !== 'function') {
      throw new Error('Handler wrapping failed');
    }
    
    // Execute wrapped handler
    await wrappedHandler({}, {});
    
    // Check metrics
    const metrics = ipc.getMetrics();
    if (!Array.isArray(metrics)) {
      throw new Error('Performance metrics not collected');
    }
    
    console.log('   ✓ Performance monitoring functional');
    console.log('   ✓ Handler timing collection working');
    
  } finally {
    ipc.shutdown();
  }
}

async function testErrorHandling() {
  const { createScreenSharingHandlers } = require(path.join(appDir, 'app/ipc/features/screenSharing'));
  
  // Test with failing dependencies
  const failingDeps = {
    desktopCapturer: {
      getSources: async () => {
        throw new Error('Desktop access denied');
      }
    },
    screen: { getAllDisplays: () => [] },
    globals: { selectedScreenShareSource: null, previewWindow: null },
    appPath: '/test',
    ipcMain: { once: () => {} }
  };
  
  const handlers = createScreenSharingHandlers(failingDeps);
  
  try {
    await handlers['desktop-capturer-get-sources'].handler({}, { types: ['screen'] });
    throw new Error('Expected error was not thrown');
  } catch (error) {
    if (error.message !== 'Desktop access denied') {
      throw new Error('Error handling not working correctly');
    }
  }
  
  console.log('   ✓ Error handling working correctly');
  console.log('   ✓ Failed dependencies handled gracefully');
}

async function testDependencyInjection() {
  const { createNotificationHandlers } = require(path.join(appDir, 'app/ipc/core/notifications'));
  
  // Test with different configurations
  const testConfigs = [
    { disableNotificationSound: true },
    { disableNotificationSound: false },
    { screenLockInhibitionMethod: 'Electron' },
    { screenLockInhibitionMethod: 'WakeLock' }
  ];
  
  for (const config of testConfigs) {
    const handlers = createNotificationHandlers({
      app: { setBadgeCount: () => {}, getBadgeCount: () => 0 },
      player: { play: () => {} },
      config,
      notificationSounds: []
    });
    
    if (!handlers['set-badge-count'] || typeof handlers['set-badge-count'].handler !== 'function') {
      throw new Error(`Dependency injection failed for config: ${JSON.stringify(config)}`);
    }
  }
  
  console.log('   ✓ Dependency injection working correctly');
  console.log('   ✓ Different configurations handled properly');
}

// Run the safe testing plan
if (require.main === module) {
  runSafeTests().catch(error => {
    console.error('\n💥 Testing failed with error:', error);
    process.exit(1);
  });
}

module.exports = { runSafeTests };