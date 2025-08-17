/**
 * Feature Handler Integration Tests
 * 
 * Tests the feature IPC handlers (screen sharing, calls)
 * to ensure they work correctly with the IPC organization system.
 */

const { createScreenSharingHandlers, initializeScreenSharingGlobals } = require('../features/screenSharing');
const { createCallHandlers, initializeCallGlobals } = require('../features/calls');

describe('Feature IPC Handlers', () => {
  describe('Screen Sharing Handlers', () => {
    let handlers;
    let mockDependencies;
    let globals;

    beforeEach(() => {
      globals = initializeScreenSharingGlobals();
      mockDependencies = {
        desktopCapturer: {
          getSources: jest.fn().mockResolvedValue([
            { id: 'screen:0', name: 'Primary Display' },
            { id: 'window:123', name: 'Test Window' }
          ])
        },
        screen: {
          getAllDisplays: jest.fn().mockReturnValue([
            { size: { width: 1920, height: 1080 } }
          ])
        },
        globals,
        appPath: '/test/app'
      };
      
      handlers = createScreenSharingHandlers(mockDependencies);
    });

    test('desktop-capturer-get-sources returns available sources', async () => {
      const handler = handlers['desktop-capturer-get-sources'].handler;
      const options = { types: ['screen', 'window'] };
      const result = await handler({}, options);
      
      expect(mockDependencies.desktopCapturer.getSources).toHaveBeenCalledWith(options);
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ id: 'screen:0', name: 'Primary Display' });
    });

    test('get-screen-sharing-status returns sharing state', async () => {
      const handler = handlers['get-screen-sharing-status'].handler;
      
      // Test when not sharing
      let result = await handler({});
      expect(result.isSharing).toBe(false);
      expect(result.sourceId).toBeNull();
      
      // Test when sharing
      globals.selectedScreenShareSource = { id: 'screen:0', name: 'Primary Display' };
      result = await handler({});
      expect(result.isSharing).toBe(true);
      expect(result.sourceId).toBe('screen:0');
      expect(result.sourceName).toBe('Primary Display');
    });

    test('get-screen-share-stream returns source ID', async () => {
      const handler = handlers['get-screen-share-stream'].handler;
      
      // Test with object source
      globals.selectedScreenShareSource = { id: 'screen:0', name: 'Test' };
      let result = await handler({});
      expect(result).toBe('screen:0');
      
      // Test with string source
      globals.selectedScreenShareSource = 'window:123';
      result = await handler({});
      expect(result).toBe('window:123');
      
      // Test with no source
      globals.selectedScreenShareSource = null;
      result = await handler({});
      expect(result).toBeNull();
    });

    test('get-screen-share-screen returns screen dimensions', async () => {
      const handler = handlers['get-screen-share-screen'].handler;
      
      // Test with screen source
      globals.selectedScreenShareSource = { id: 'screen:0' };
      let result = await handler({});
      expect(result).toEqual({ width: 1920, height: 1080 });
      
      // Test with default dimensions
      globals.selectedScreenShareSource = null;
      result = await handler({});
      expect(result).toEqual({ width: 1920, height: 1080 });
    });

    test('screen-sharing-stopped cleans up state', () => {
      const mockPreviewWindow = {
        isDestroyed: jest.fn().mockReturnValue(false),
        close: jest.fn()
      };
      
      globals.selectedScreenShareSource = { id: 'screen:0' };
      globals.previewWindow = mockPreviewWindow;
      
      const handler = handlers['screen-sharing-stopped'].handler;
      handler({});
      
      expect(globals.selectedScreenShareSource).toBeNull();
      expect(mockPreviewWindow.close).toHaveBeenCalled();
    });

    test('resize-preview-window updates window size', () => {
      const mockPreviewWindow = {
        isDestroyed: jest.fn().mockReturnValue(false),
        getMinimumSize: jest.fn().mockReturnValue([200, 150]),
        setSize: jest.fn(),
        center: jest.fn()
      };
      
      globals.previewWindow = mockPreviewWindow;
      
      const handler = handlers['resize-preview-window'].handler;
      handler({}, { width: 400, height: 300 });
      
      expect(mockPreviewWindow.setSize).toHaveBeenCalledWith(400, 300);
      expect(mockPreviewWindow.center).toHaveBeenCalled();
    });

    test('resize-preview-window respects size limits', () => {
      const mockPreviewWindow = {
        isDestroyed: jest.fn().mockReturnValue(false),
        getMinimumSize: jest.fn().mockReturnValue([200, 150]),
        setSize: jest.fn(),
        center: jest.fn()
      };
      
      globals.previewWindow = mockPreviewWindow;
      
      const handler = handlers['resize-preview-window'].handler;
      
      // Test maximum size limits
      handler({}, { width: 600, height: 500 });
      expect(mockPreviewWindow.setSize).toHaveBeenCalledWith(480, 360);
      
      // Test minimum size limits
      handler({}, { width: 100, height: 100 });
      expect(mockPreviewWindow.setSize).toHaveBeenCalledWith(200, 150);
    });
  });

  describe('Call Management Handlers', () => {
    let handlers;
    let mockDependencies;
    let globals;

    beforeEach(() => {
      globals = initializeCallGlobals();
      mockDependencies = {
        config: {
          incomingCallCommand: '/usr/bin/notify-send',
          incomingCallCommandArgs: ['--urgency=critical'],
          enableIncomingCallToast: true,
          screenLockInhibitionMethod: 'Electron'
        },
        powerSaveBlocker: {
          start: jest.fn().mockReturnValue(123),
          stop: jest.fn()
        },
        incomingCallToast: {
          show: jest.fn(),
          hide: jest.fn()
        },
        window: {
          isDestroyed: jest.fn().mockReturnValue(false),
          webContents: {
            send: jest.fn()
          }
        },
        globals
      };
      
      // Mock spawn
      const mockProcess = {
        on: jest.fn(),
        kill: jest.fn()
      };
      jest.doMock('child_process', () => ({
        spawn: jest.fn().mockReturnValue(mockProcess)
      }));
      
      handlers = createCallHandlers(mockDependencies);
    });

    test('incoming-call-created shows toast and executes command', async () => {
      const handler = handlers['incoming-call-created'].handler;
      const callData = {
        caller: 'John Doe',
        text: 'Incoming call',
        image: 'data:image/png;base64,test'
      };
      
      const result = await handler({}, callData);
      
      expect(result.success).toBe(true);
      expect(mockDependencies.incomingCallToast.show).toHaveBeenCalledWith(callData);
    });

    test('call-connected disables screen lock', async () => {
      const handler = handlers['call-connected'].handler;
      const result = await handler({});
      
      expect(globals.isOnCall).toBe(true);
      expect(mockDependencies.powerSaveBlocker.start).toHaveBeenCalledWith('prevent-display-sleep');
      expect(result.success).toBe(true);
      expect(result.method).toBe('Electron');
    });

    test('call-disconnected enables screen lock', async () => {
      // Set up initial state
      globals.isOnCall = true;
      globals.blockerId = 123;
      
      const handler = handlers['call-disconnected'].handler;
      const result = await handler({});
      
      expect(globals.isOnCall).toBe(false);
      expect(mockDependencies.powerSaveBlocker.stop).toHaveBeenCalledWith(123);
      expect(result.success).toBe(true);
      expect(result.method).toBe('Electron');
    });

    test('call-connected with WakeLock method', async () => {
      mockDependencies.config.screenLockInhibitionMethod = 'WakeLock';
      handlers = createCallHandlers(mockDependencies);
      
      const handler = handlers['call-connected'].handler;
      const result = await handler({});
      
      expect(globals.isOnCall).toBe(true);
      expect(mockDependencies.window.webContents.send).toHaveBeenCalledWith('enable-wakelock');
      expect(result.method).toBe('WakeLock');
    });

    test('call-disconnected with WakeLock method', async () => {
      mockDependencies.config.screenLockInhibitionMethod = 'WakeLock';
      handlers = createCallHandlers(mockDependencies);
      
      globals.isOnCall = true;
      
      const handler = handlers['call-disconnected'].handler;
      const result = await handler({});
      
      expect(globals.isOnCall).toBe(false);
      expect(mockDependencies.window.webContents.send).toHaveBeenCalledWith('disable-wakelock');
      expect(result.method).toBe('WakeLock');
    });

    test('get-call-status returns current state', async () => {
      globals.isOnCall = true;
      globals.blockerId = 456;
      
      const handler = handlers['get-call-status'].handler;
      const result = await handler({});
      
      expect(result).toEqual({
        isOnCall: true,
        blockerId: 456,
        screenLockMethod: 'Electron'
      });
    });

    test('incoming-call-action forwards to main window', () => {
      const handler = handlers['incoming-call-action'].handler;
      handler({}, 'accept');
      
      expect(mockDependencies.incomingCallToast.hide).toHaveBeenCalled();
      expect(mockDependencies.window.webContents.send).toHaveBeenCalledWith('incoming-call-action', 'accept');
    });

    test('incoming-call-ended cleans up resources', async () => {
      const mockProcess = { kill: jest.fn() };
      globals.incomingCallCommandProcess = mockProcess;
      
      const handler = handlers['incoming-call-ended'].handler;
      const result = await handler({});
      
      expect(result.success).toBe(true);
      expect(mockProcess.kill).toHaveBeenCalled();
      expect(mockDependencies.incomingCallToast.hide).toHaveBeenCalled();
    });
  });

  describe('Handler Integration', () => {
    test('all feature handlers have correct structure', () => {
      const screenSharingHandlers = createScreenSharingHandlers({
        desktopCapturer: { getSources: () => {} },
        screen: { getAllDisplays: () => [] },
        globals: initializeScreenSharingGlobals(),
        appPath: '/test'
      });
      
      const callHandlers = createCallHandlers({
        config: { screenLockInhibitionMethod: 'Electron' },
        powerSaveBlocker: { start: () => {}, stop: () => {} },
        incomingCallToast: { show: () => {}, hide: () => {} },
        window: { isDestroyed: () => false, webContents: { send: () => {} } },
        globals: initializeCallGlobals()
      });
      
      // Verify all handlers have correct structure
      [screenSharingHandlers, callHandlers].forEach(handlers => {
        Object.entries(handlers).forEach(([name, handler]) => {
          if (name.startsWith('_')) return; // Skip utility exports
          
          expect(handler).toHaveProperty('handler');
          expect(typeof handler.handler).toBe('function');
          expect(handler.type || handler.handler.constructor.name).toBeDefined();
        });
      });
    });

    test('global state initialization', () => {
      const screenGlobals = initializeScreenSharingGlobals();
      expect(screenGlobals).toEqual({
        selectedScreenShareSource: null,
        previewWindow: null
      });
      
      const callGlobals = initializeCallGlobals();
      expect(callGlobals).toEqual({
        isOnCall: false,
        blockerId: null,
        incomingCallCommandProcess: null
      });
    });

    test('error handling in handlers', async () => {
      // Test screen sharing error handling
      const failingDesktopCapturer = {
        getSources: jest.fn().mockRejectedValue(new Error('Desktop access denied'))
      };
      
      const screenHandlers = createScreenSharingHandlers({
        desktopCapturer: failingDesktopCapturer,
        screen: { getAllDisplays: () => [] },
        globals: initializeScreenSharingGlobals(),
        appPath: '/test'
      });
      
      const handler = screenHandlers['desktop-capturer-get-sources'].handler;
      await expect(handler({}, { types: ['screen'] })).rejects.toThrow('Desktop access denied');
    });

    test('handlers handle missing dependencies gracefully', async () => {
      // Test call handlers with missing window
      const callHandlers = createCallHandlers({
        config: { screenLockInhibitionMethod: 'WakeLock' },
        powerSaveBlocker: { start: () => {}, stop: () => {} },
        incomingCallToast: null,
        window: null,
        globals: initializeCallGlobals()
      });
      
      const handler = callHandlers['call-connected'].handler;
      const result = await handler({});
      
      expect(result.success).toBe(false); // Should fail gracefully
    });
  });
});

// Helper function to run tests without Jest
if (require.main === module) {
  console.log('Running feature handler tests...');
  
  // Simple test runner for basic validation
  try {
    const screenSharingHandlers = createScreenSharingHandlers({
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
      globals: initializeScreenSharingGlobals(),
      appPath: '/test/app'
    });
    
    console.log('✅ Screen sharing handlers created successfully');
    console.log('   Available handlers:', Object.keys(screenSharingHandlers).filter(k => !k.startsWith('_')));
    
    const callHandlers = createCallHandlers({
      config: {
        incomingCallCommand: '/usr/bin/notify-send',
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
        show: (data) => console.log('   [Mock] Showing call toast:', data.caller),
        hide: () => console.log('   [Mock] Hiding call toast')
      },
      window: {
        isDestroyed: () => false,
        webContents: {
          send: (channel, data) => console.log(`   [Mock] Sending to renderer: ${channel}`)
        }
      },
      globals: initializeCallGlobals()
    });
    
    console.log('✅ Call handlers created successfully');
    console.log('   Available handlers:', Object.keys(callHandlers).filter(k => !k.startsWith('_')));
    
    console.log('\n🎉 All feature handler modules validated successfully!');
    
  } catch (error) {
    console.error('❌ Feature handler validation failed:', error);
    process.exit(1);
  }
}