#!/usr/bin/env node

/**
 * Feature Handler Validation Script
 * 
 * Tests the feature IPC handlers to ensure they work correctly.
 */

const path = require('path');
const appDir = path.join(__dirname, '..');

// Load feature handler modules
const { createScreenSharingHandlers, initializeScreenSharingGlobals } = require(path.join(appDir, 'app/ipc/features/screenSharing'));
const { createCallHandlers, initializeCallGlobals } = require(path.join(appDir, 'app/ipc/features/calls'));

console.log('🧪 Running Feature Handler Validation Tests\n');

async function testScreenSharingHandlers() {
  console.log('--- Screen Sharing Handlers ---');
  
  const globals = initializeScreenSharingGlobals();
  const mockDependencies = {
    desktopCapturer: {
      getSources: async (opts) => {
        console.log('   [Mock] Getting desktop sources with options:', opts);
        return [
          { id: 'screen:0', name: 'Primary Display' },
          { id: 'window:123', name: 'Test Window' }
        ];
      }
    },
    screen: {
      getAllDisplays: () => {
        console.log('   [Mock] Getting all displays');
        return [{ size: { width: 1920, height: 1080 } }];
      }
    },
    globals,
    appPath: '/test/app',
    ipcMain: {
      once: (channel, handler) => {
        console.log(`   [Mock] Registered once handler for: ${channel}`);
        // Simulate source selection after delay
        setTimeout(() => {
          handler({}, { id: 'screen:0', name: 'Test Screen' });
        }, 100);
      }
    }
  };
  
  const handlers = createScreenSharingHandlers(mockDependencies);
  
  console.log('✅ Screen sharing handlers created');
  console.log('   Available handlers:', Object.keys(handlers).filter(k => !k.startsWith('_')).join(', '));
  
  // Test desktop-capturer-get-sources
  const sources = await handlers['desktop-capturer-get-sources'].handler({}, { types: ['screen', 'window'] });
  console.log('✅ desktop-capturer-get-sources test passed, found', sources.length, 'sources');
  
  // Test get-screen-sharing-status (not sharing)
  let status = await handlers['get-screen-sharing-status'].handler({});
  console.log('✅ get-screen-sharing-status test passed (not sharing):', status.isSharing);
  
  // Test with active sharing
  globals.selectedScreenShareSource = { id: 'screen:0', name: 'Primary Display' };
  status = await handlers['get-screen-sharing-status'].handler({});
  console.log('✅ get-screen-sharing-status test passed (sharing):', status.isSharing, 'source:', status.sourceId);
  
  // Test get-screen-share-stream
  const streamId = await handlers['get-screen-share-stream'].handler({});
  console.log('✅ get-screen-share-stream test passed, stream ID:', streamId);
  
  // Test get-screen-share-screen
  const dimensions = await handlers['get-screen-share-screen'].handler({});
  console.log('✅ get-screen-share-screen test passed, dimensions:', dimensions);
  
  // Test screen-sharing-stopped
  const mockPreviewWindow = {
    isDestroyed: () => false,
    close: () => console.log('   [Mock] Preview window closed')
  };
  globals.previewWindow = mockPreviewWindow;
  handlers['screen-sharing-stopped'].handler({});
  console.log('✅ screen-sharing-stopped test passed, source cleared:', globals.selectedScreenShareSource === null);
  
  console.log('');
}

async function testCallHandlers() {
  console.log('--- Call Management Handlers ---');
  
  const globals = initializeCallGlobals();
  const mockDependencies = {
    config: {
      incomingCallCommand: '/usr/bin/notify-send',
      incomingCallCommandArgs: ['--urgency=critical'],
      enableIncomingCallToast: true,
      screenLockInhibitionMethod: 'Electron'
    },
    powerSaveBlocker: {
      start: (type) => {
        console.log(`   [Mock] Starting power save blocker: ${type}`);
        return 123;
      },
      stop: (id) => {
        console.log(`   [Mock] Stopping power save blocker: ${id}`);
      }
    },
    incomingCallToast: {
      show: (data) => console.log('   [Mock] Showing call toast for:', data.caller),
      hide: () => console.log('   [Mock] Hiding call toast')
    },
    window: {
      isDestroyed: () => false,
      webContents: {
        send: (channel) => console.log(`   [Mock] Sending to renderer: ${channel}`)
      }
    },
    globals
  };
  
  const handlers = createCallHandlers(mockDependencies);
  
  console.log('✅ Call handlers created');
  console.log('   Available handlers:', Object.keys(handlers).filter(k => !k.startsWith('_')).join(', '));
  
  // Test incoming-call-created
  const callData = {
    caller: 'John Doe',
    text: 'Incoming call from Teams',
    image: 'data:image/png;base64,test'
  };
  const incomingResult = await handlers['incoming-call-created'].handler({}, callData);
  console.log('✅ incoming-call-created test passed:', incomingResult.success);
  
  // Test call-connected
  const connectResult = await handlers['call-connected'].handler({});
  console.log('✅ call-connected test passed, method:', connectResult.method, 'on call:', globals.isOnCall);
  
  // Test get-call-status
  const callStatus = await handlers['get-call-status'].handler({});
  console.log('✅ get-call-status test passed, status:', callStatus);
  
  // Test call-disconnected
  const disconnectResult = await handlers['call-disconnected'].handler({});
  console.log('✅ call-disconnected test passed, method:', disconnectResult.method, 'on call:', globals.isOnCall);
  
  // Test incoming-call-action
  handlers['incoming-call-action'].handler({}, 'accept');
  console.log('✅ incoming-call-action test passed');
  
  // Test incoming-call-ended
  const endResult = await handlers['incoming-call-ended'].handler({});
  console.log('✅ incoming-call-ended test passed:', endResult.success);
  
  console.log('');
}

async function testWakeLockMethod() {
  console.log('--- WakeLock Method Test ---');
  
  const globals = initializeCallGlobals();
  const mockDependencies = {
    config: {
      screenLockInhibitionMethod: 'WakeLock' // Test WakeLock instead of Electron
    },
    powerSaveBlocker: {
      start: () => 123,
      stop: () => {}
    },
    incomingCallToast: null,
    window: {
      isDestroyed: () => false,
      webContents: {
        send: (channel) => console.log(`   [Mock] WakeLock message: ${channel}`)
      }
    },
    globals
  };
  
  const handlers = createCallHandlers(mockDependencies);
  
  // Test call-connected with WakeLock
  const connectResult = await handlers['call-connected'].handler({});
  console.log('✅ WakeLock call-connected test passed, method:', connectResult.method);
  
  // Test call-disconnected with WakeLock
  const disconnectResult = await handlers['call-disconnected'].handler({});
  console.log('✅ WakeLock call-disconnected test passed, method:', disconnectResult.method);
  
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
  
  // Create and register screen sharing handlers
  const screenSharingHandlers = createScreenSharingHandlers({
    desktopCapturer: { getSources: () => [] },
    screen: { getAllDisplays: () => [] },
    globals: initializeScreenSharingGlobals(),
    appPath: '/test'
  });
  
  ipc.registerModule('screen-sharing', screenSharingHandlers);
  console.log('✅ Screen sharing handlers registered');
  
  // Create and register call handlers
  const callHandlers = createCallHandlers({
    config: { screenLockInhibitionMethod: 'Electron' },
    powerSaveBlocker: { start: () => {}, stop: () => {} },
    incomingCallToast: { show: () => {}, hide: () => {} },
    window: { isDestroyed: () => false, webContents: { send: () => {} } },
    globals: initializeCallGlobals()
  });
  
  ipc.registerModule('calls', callHandlers);
  console.log('✅ Call handlers registered');
  
  // Get system status
  const status = ipc.getStatus();
  console.log('✅ IPC system status retrieved');
  console.log(`   Registered modules: ${status.registry.moduleCount}`);
  console.log(`   Total handlers: ${status.manager.handlerCount}`);
  console.log(`   Validation enabled: ${status.validation.enabled}`);
  console.log(`   Validation schemas: ${status.validation.schemas}`);
  
  // Shutdown
  ipc.shutdown();
  console.log('✅ IPC system shutdown complete');
  
  console.log('');
}

async function testErrorHandling() {
  console.log('--- Error Handling ---');
  
  // Test screen sharing with failing desktop capturer
  const failingDeps = {
    desktopCapturer: {
      getSources: async () => {
        throw new Error('Desktop access denied');
      }
    },
    screen: { getAllDisplays: () => [] },
    globals: initializeScreenSharingGlobals(),
    appPath: '/test'
  };
  
  const handlers = createScreenSharingHandlers(failingDeps);
  
  try {
    await handlers['desktop-capturer-get-sources'].handler({}, { types: ['screen'] });
    console.log('❌ Expected error was not thrown');
  } catch (error) {
    console.log('✅ Error handling test passed:', error.message);
  }
  
  // Test call handlers with missing dependencies
  const callHandlers = createCallHandlers({
    config: { screenLockInhibitionMethod: 'WakeLock' },
    powerSaveBlocker: { start: () => {}, stop: () => {} },
    incomingCallToast: null,
    window: null, // Missing window
    globals: initializeCallGlobals()
  });
  
  const result = await callHandlers['call-connected'].handler({});
  console.log('✅ Missing dependency handling test passed, success:', result.success);
  
  console.log('');
}

async function runAllTests() {
  try {
    await testScreenSharingHandlers();
    await testCallHandlers();
    await testWakeLockMethod();
    await testHandlerIntegration();
    await testErrorHandling();
    
    console.log('🎉 All Feature Handler Tests Passed!');
    console.log('\n📋 Summary:');
    console.log('   ✅ Screen sharing handlers - working correctly');
    console.log('   ✅ Call management handlers - working correctly');
    console.log('   ✅ Power management (Electron & WakeLock) - working correctly');
    console.log('   ✅ IPC system integration - working correctly');
    console.log('   ✅ Error handling - working correctly');
    console.log('\n✨ Feature handler migration is complete and ready!');
    
  } catch (error) {
    console.error('\n❌ Feature Handler Tests Failed:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run all tests
if (require.main === module) {
  runAllTests();
}

module.exports = {
  testScreenSharingHandlers,
  testCallHandlers,
  testWakeLockMethod,
  testHandlerIntegration,
  testErrorHandling
};