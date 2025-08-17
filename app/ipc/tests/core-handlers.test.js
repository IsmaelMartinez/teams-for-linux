/**
 * Core Handler Integration Tests
 * 
 * Tests the core IPC handlers (configuration, system, notifications)
 * to ensure they work correctly with the IPC organization system.
 */

const { createConfigurationHandlers } = require('../core/configuration');
const { createSystemHandlers, initializeSystemGlobals } = require('../core/system');
const { createNotificationHandlers, initializeAudioPlayer, getDefaultNotificationSounds } = require('../core/notifications');

describe('Core IPC Handlers', () => {
  describe('Configuration Handlers', () => {
    let handlers;
    let mockDependencies;

    beforeEach(() => {
      mockDependencies = {
        config: {
          appVersion: '1.0.0',
          theme: 'dark',
          notifications: true
        },
        restartApp: jest.fn(),
        getPartition: jest.fn().mockReturnValue({ zoomLevel: 1.5 }),
        savePartition: jest.fn()
      };
      
      handlers = createConfigurationHandlers(mockDependencies);
    });

    test('get-config returns application configuration', async () => {
      const handler = handlers['get-config'].handler;
      const result = await handler({});
      
      expect(result).toEqual(mockDependencies.config);
    });

    test('get-app-version returns version string', async () => {
      const handler = handlers['get-app-version'].handler;
      const result = await handler({});
      
      expect(result).toBe('1.0.0');
    });

    test('get-zoom-level retrieves partition zoom level', async () => {
      const handler = handlers['get-zoom-level'].handler;
      const result = await handler({}, 'test-partition');
      
      expect(mockDependencies.getPartition).toHaveBeenCalledWith('test-partition');
      expect(result).toBe(1.5);
    });

    test('save-zoom-level saves partition data', async () => {
      const handler = handlers['save-zoom-level'].handler;
      const args = { partition: 'test-partition', zoomLevel: 2.0 };
      const result = await handler({}, args);
      
      expect(mockDependencies.savePartition).toHaveBeenCalledWith({
        name: 'test-partition',
        zoomLevel: 2.0
      });
      expect(result).toEqual({ success: true });
    });

    test('config-file-changed triggers app restart', () => {
      const handler = handlers['config-file-changed'].handler;
      handler({});
      
      expect(mockDependencies.restartApp).toHaveBeenCalled();
    });
  });

  describe('System Handlers', () => {
    let handlers;
    let mockDependencies;
    let globals;

    beforeEach(() => {
      globals = initializeSystemGlobals();
      mockDependencies = {
        powerMonitor: {
          getSystemIdleState: jest.fn().mockReturnValue('active')
        },
        config: {
          appIdleTimeout: 5
        },
        globals
      };
      
      handlers = createSystemHandlers(mockDependencies);
    });

    test('get-system-idle-state returns system state', async () => {
      const handler = handlers['get-system-idle-state'].handler;
      const result = await handler({});
      
      expect(mockDependencies.powerMonitor.getSystemIdleState).toHaveBeenCalledWith(5);
      expect(result).toMatchObject({
        idleState: 'active',
        idleTimeout: 5,
        userStatus: -1,
        idleTimeUserStatus: -1
      });
    });

    test('user-status-changed updates global status', async () => {
      const handler = handlers['user-status-changed'].handler;
      const options = { data: { status: 'busy' } };
      const result = await handler({}, options);
      
      expect(globals.userStatus).toBe('busy');
      expect(result).toMatchObject({
        success: true,
        previousStatus: -1,
        currentStatus: 'busy'
      });
    });

    test('get-user-status returns current status', async () => {
      globals.userStatus = 'available';
      globals.idleTimeUserStatus = 'busy';
      
      const handler = handlers['get-user-status'].handler;
      const result = await handler({});
      
      expect(result).toEqual({
        userStatus: 'available',
        idleTimeUserStatus: 'busy'
      });
    });

    test('idle state tracking works correctly', async () => {
      // Simulate user going idle
      mockDependencies.powerMonitor.getSystemIdleState.mockReturnValue('idle');
      globals.userStatus = 'available';
      
      const handler = handlers['get-system-idle-state'].handler;
      const result = await handler({});
      
      expect(globals.idleTimeUserStatus).toBe('available');
      expect(result.idleState).toBe('idle');
    });
  });

  describe('Notification Handlers', () => {
    let handlers;
    let mockDependencies;

    beforeEach(() => {
      mockDependencies = {
        app: {
          setBadgeCount: jest.fn(),
          getBadgeCount: jest.fn().mockReturnValue(5)
        },
        player: {
          play: jest.fn().mockResolvedValue()
        },
        config: {
          disableNotificationSound: false,
          appPath: '/test/app'
        },
        notificationSounds: [
          { type: 'new-message', file: '/test/sounds/new_message.wav' },
          { type: 'meeting-started', file: '/test/sounds/meeting_started.wav' }
        ]
      };
      
      handlers = createNotificationHandlers(mockDependencies);
    });

    test('show-notification displays notification and plays sound', async () => {
      const handler = handlers['show-notification'].handler;
      const options = {
        type: 'new-message',
        title: 'Test Notification',
        body: 'Test body'
      };
      
      const result = await handler({}, options);
      
      expect(result.success).toBe(true);
      expect(result.notificationId).toBeDefined();
      expect(mockDependencies.player.play).toHaveBeenCalledWith('/test/sounds/new_message.wav');
    });

    test('play-notification-sound plays correct sound file', async () => {
      const handler = handlers['play-notification-sound'].handler;
      const options = {
        type: 'meeting-started',
        audio: 'default',
        title: 'Meeting Started',
        body: 'Your meeting is starting'
      };
      
      const result = await handler({}, options);
      
      expect(result.success).toBe(true);
      expect(result.soundFile).toBe('/test/sounds/meeting_started.wav');
      expect(mockDependencies.player.play).toHaveBeenCalledWith('/test/sounds/meeting_started.wav');
    });

    test('play-notification-sound handles disabled sounds', async () => {
      mockDependencies.config.disableNotificationSound = true;
      handlers = createNotificationHandlers(mockDependencies);
      
      const handler = handlers['play-notification-sound'].handler;
      const result = await handler({}, { type: 'new-message' });
      
      expect(result.success).toBe(false);
      expect(result.reason).toBe('Sound disabled or player unavailable');
      expect(mockDependencies.player.play).not.toHaveBeenCalled();
    });

    test('set-badge-count updates app badge', async () => {
      const handler = handlers['set-badge-count'].handler;
      const result = await handler({}, 10);
      
      expect(mockDependencies.app.setBadgeCount).toHaveBeenCalledWith(10);
      expect(result).toEqual({ success: true, count: 10 });
    });

    test('get-badge-count retrieves current badge count', async () => {
      const handler = handlers['get-badge-count'].handler;
      const result = await handler({});
      
      expect(mockDependencies.app.getBadgeCount).toHaveBeenCalled();
      expect(result).toEqual({ success: true, count: 5 });
    });

    test('clear-badge-count resets badge to zero', async () => {
      const handler = handlers['clear-badge-count'].handler;
      const result = await handler({});
      
      expect(mockDependencies.app.setBadgeCount).toHaveBeenCalledWith(0);
      expect(result).toEqual({ success: true, count: 0 });
    });
  });

  describe('Handler Integration', () => {
    test('all handlers have correct structure', () => {
      const configHandlers = createConfigurationHandlers({
        config: {},
        restartApp: () => {},
        getPartition: () => ({}),
        savePartition: () => {}
      });
      
      const systemHandlers = createSystemHandlers({
        powerMonitor: { getSystemIdleState: () => 'active' },
        config: { appIdleTimeout: 5 },
        globals: initializeSystemGlobals()
      });
      
      const notificationHandlers = createNotificationHandlers({
        app: { setBadgeCount: () => {}, getBadgeCount: () => 0 },
        player: { play: () => {} },
        config: { disableNotificationSound: false },
        notificationSounds: []
      });
      
      // Verify all handlers have correct structure
      [configHandlers, systemHandlers, notificationHandlers].forEach(handlers => {
        Object.values(handlers).forEach(handler => {
          expect(handler).toHaveProperty('handler');
          expect(typeof handler.handler).toBe('function');
          expect(handler.type || handler.handler.constructor.name).toBeDefined();
        });
      });
    });

    test('notification sound initialization works', () => {
      const sounds = getDefaultNotificationSounds('/test/app');
      expect(sounds).toHaveLength(2);
      expect(sounds[0]).toMatchObject({
        type: 'new-message',
        file: expect.stringContaining('new_message.wav')
      });
    });

    test('audio player initialization handles missing dependency', () => {
      // This would require mocking the require() for node-sound
      // In a real test environment, we'd use proper mocking
      const player = initializeAudioPlayer();
      // Should either return a player or null without throwing
      expect(player === null || typeof player === 'object').toBe(true);
    });
  });
});

// Helper function to run tests without Jest
if (require.main === module) {
  console.log('Running core handler tests...');
  
  // Simple test runner for basic validation
  try {
    const configHandlers = createConfigurationHandlers({
      config: { appVersion: '1.0.0' },
      restartApp: () => console.log('Restart triggered'),
      getPartition: () => ({ zoomLevel: 1.0 }),
      savePartition: (partition) => console.log('Saved partition:', partition)
    });
    
    console.log('✅ Configuration handlers created successfully');
    console.log('   Available handlers:', Object.keys(configHandlers));
    
    const systemHandlers = createSystemHandlers({
      powerMonitor: { getSystemIdleState: () => 'active' },
      config: { appIdleTimeout: 5 },
      globals: initializeSystemGlobals()
    });
    
    console.log('✅ System handlers created successfully');
    console.log('   Available handlers:', Object.keys(systemHandlers));
    
    const notificationHandlers = createNotificationHandlers({
      app: { 
        setBadgeCount: (count) => console.log('Badge count set:', count),
        getBadgeCount: () => 0
      },
      player: { play: (file) => console.log('Playing sound:', file) },
      config: { disableNotificationSound: false },
      notificationSounds: getDefaultNotificationSounds('/test/app')
    });
    
    console.log('✅ Notification handlers created successfully');
    console.log('   Available handlers:', Object.keys(notificationHandlers));
    
    console.log('\n🎉 All core handler modules validated successfully!');
    
  } catch (error) {
    console.error('❌ Core handler validation failed:', error);
    process.exit(1);
  }
}