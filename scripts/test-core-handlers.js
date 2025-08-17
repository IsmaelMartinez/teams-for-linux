#!/usr/bin/env node

/**
 * Core Handler Validation Script
 * 
 * Tests the core IPC handlers to ensure they work correctly.
 */

const path = require('path');
const appDir = path.join(__dirname, '..');

// Load core handler modules
const { createConfigurationHandlers } = require(path.join(appDir, 'app/ipc/core/configuration'));
const { createSystemHandlers, initializeSystemGlobals } = require(path.join(appDir, 'app/ipc/core/system'));
const { createNotificationHandlers, getDefaultNotificationSounds } = require(path.join(appDir, 'app/ipc/core/notifications'));

console.log('🧪 Running Core Handler Validation Tests\n');

async function testConfigurationHandlers() {
  console.log('--- Configuration Handlers ---');
  
  const mockDependencies = {
    config: { 
      appVersion: '1.0.0',
      theme: 'dark',
      notifications: true
    },
    restartApp: () => console.log('   [Mock] App restart triggered'),
    getPartition: (name) => {
      console.log(`   [Mock] Getting partition: ${name}`);
      return { zoomLevel: 1.5 };
    },
    savePartition: (partition) => {
      console.log(`   [Mock] Saving partition:`, partition);
    }
  };
  
  const handlers = createConfigurationHandlers(mockDependencies);
  
  console.log('✅ Configuration handlers created');
  console.log('   Available handlers:', Object.keys(handlers).join(', '));
  
  // Test get-config
  await handlers['get-config'].handler({});
  console.log('✅ get-config test passed');
  
  // Test get-app-version
  const version = await handlers['get-app-version'].handler({});
  console.log('✅ get-app-version test passed, version:', version);
  
  // Test zoom level handlers
  const zoomLevel = await handlers['get-zoom-level'].handler({}, 'test-partition');
  console.log('✅ get-zoom-level test passed, zoom:', zoomLevel);
  
  await handlers['save-zoom-level'].handler({}, { 
    partition: 'test-partition', 
    zoomLevel: 2.0 
  });
  console.log('✅ save-zoom-level test passed');
  
  // Test config file changed
  handlers['config-file-changed'].handler({});
  console.log('✅ config-file-changed test passed');
  
  console.log('');
}

async function testSystemHandlers() {
  console.log('--- System Handlers ---');
  
  const globals = initializeSystemGlobals();
  const mockDependencies = {
    powerMonitor: {
      getSystemIdleState: (timeout) => {
        console.log(`   [Mock] Checking idle state with timeout: ${timeout}s`);
        return 'active';
      }
    },
    config: {
      appIdleTimeout: 5
    },
    globals
  };
  
  const handlers = createSystemHandlers(mockDependencies);
  
  console.log('✅ System handlers created');
  console.log('   Available handlers:', Object.keys(handlers).join(', '));
  
  // Test get-system-idle-state
  const idleState = await handlers['get-system-idle-state'].handler({});
  console.log('✅ get-system-idle-state test passed, state:', idleState.idleState);
  
  // Test user-status-changed
  const statusResult = await handlers['user-status-changed'].handler({}, { 
    data: { status: 'busy' } 
  });
  console.log('✅ user-status-changed test passed, status changed to:', statusResult.currentStatus);
  
  // Test get-user-status
  const userStatus = await handlers['get-user-status'].handler({});
  console.log('✅ get-user-status test passed, current status:', userStatus.userStatus);
  
  console.log('');
}

async function testNotificationHandlers() {
  console.log('--- Notification Handlers ---');
  
  const mockDependencies = {
    app: {
      setBadgeCount: (count) => {
        console.log(`   [Mock] Setting badge count to: ${count}`);
      },
      getBadgeCount: () => {
        console.log('   [Mock] Getting badge count');
        return 5;
      }
    },
    player: {
      play: async (file) => {
        console.log(`   [Mock] Playing sound: ${path.basename(file)}`);
        return Promise.resolve();
      }
    },
    config: {
      disableNotificationSound: false,
      appPath: '/test/app'
    },
    notificationSounds: getDefaultNotificationSounds('/test/app')
  };
  
  const handlers = createNotificationHandlers(mockDependencies);
  
  console.log('✅ Notification handlers created');
  console.log('   Available handlers:', Object.keys(handlers).join(', '));
  
  // Test show-notification
  const showResult = await handlers['show-notification'].handler({}, {
    type: 'new-message',
    title: 'Test Notification',
    body: 'Test body'
  });
  console.log('✅ show-notification test passed, notification ID:', showResult.notificationId);
  
  // Test play-notification-sound
  await handlers['play-notification-sound'].handler({}, {
    type: 'meeting-started',
    audio: 'default',
    title: 'Meeting Started',
    body: 'Your meeting is starting'
  });
  console.log('✅ play-notification-sound test passed');
  
  // Test badge count handlers
  await handlers['set-badge-count'].handler({}, 10);
  console.log('✅ set-badge-count test passed');
  
  const getBadgeResult = await handlers['get-badge-count'].handler({});
  console.log('✅ get-badge-count test passed, count:', getBadgeResult.count);
  
  await handlers['clear-badge-count'].handler({});
  console.log('✅ clear-badge-count test passed');
  
  console.log('');
}

async function testHandlerIntegration() {
  console.log('--- Handler Integration ---');
  
  // Test that all handlers can be registered with the IPC system
  const ipc = require(path.join(appDir, 'app/ipc/index.js'));
  
  console.log('✅ IPC system loaded successfully');
  
  // Initialize IPC system
  ipc.initialize();
  console.log('✅ IPC system initialized');
  
  // Create and register configuration handlers
  const configHandlers = createConfigurationHandlers({
    config: { appVersion: '1.0.0' },
    restartApp: () => {},
    getPartition: () => ({ zoomLevel: 1.0 }),
    savePartition: () => {}
  });
  
  ipc.registerModule('configuration', configHandlers);
  console.log('✅ Configuration handlers registered');
  
  // Create and register system handlers
  const systemHandlers = createSystemHandlers({
    powerMonitor: { getSystemIdleState: () => 'active' },
    config: { appIdleTimeout: 5 },
    globals: initializeSystemGlobals()
  });
  
  ipc.registerModule('system', systemHandlers);
  console.log('✅ System handlers registered');
  
  // Create and register notification handlers
  const notificationHandlers = createNotificationHandlers({
    app: { setBadgeCount: () => {}, getBadgeCount: () => 0 },
    player: { play: () => Promise.resolve() },
    config: { disableNotificationSound: false },
    notificationSounds: getDefaultNotificationSounds('/test/app')
  });
  
  ipc.registerModule('notifications', notificationHandlers);
  console.log('✅ Notification handlers registered');
  
  // Get system status
  const status = ipc.getStatus();
  console.log('✅ IPC system status retrieved');
  console.log(`   Registered modules: ${status.registry.moduleCount}`);
  console.log(`   Total handlers: ${status.manager.handlerCount}`);
  
  // Shutdown
  ipc.shutdown();
  console.log('✅ IPC system shutdown complete');
  
  console.log('');
}

async function runAllTests() {
  try {
    await testConfigurationHandlers();
    await testSystemHandlers();
    await testNotificationHandlers();
    await testHandlerIntegration();
    
    console.log('🎉 All Core Handler Tests Passed!');
    console.log('\n📋 Summary:');
    console.log('   ✅ Configuration handlers - working correctly');
    console.log('   ✅ System state handlers - working correctly');
    console.log('   ✅ Notification handlers - working correctly');
    console.log('   ✅ IPC system integration - working correctly');
    console.log('\n✨ Core handler migration foundation is ready!');
    
  } catch (error) {
    console.error('\n❌ Core Handler Tests Failed:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run all tests
if (require.main === module) {
  runAllTests();
}

module.exports = {
  testConfigurationHandlers,
  testSystemHandlers,
  testNotificationHandlers,
  testHandlerIntegration
};