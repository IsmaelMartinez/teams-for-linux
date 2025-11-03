/**
 * TrayManager Tests
 * Comprehensive test suite for system tray management service
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { createMockEventEmitter, createSpy } from '../../../../helpers/test-utils.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Create mock tracking objects
const mockCalls = {
  tray: {
    setToolTip: [],
    setImage: [],
    setContextMenu: [],
    destroy: [],
    isDestroyed: [],
    on: []
  },
  menu: {
    buildFromTemplate: []
  },
  app: {
    setBadgeCount: []
  },
  nativeImage: {
    createFromPath: [],
    createFromDataURL: []
  },
  Tray: []
};

// Create mock Tray instance
let mockTrayInstance = null;
const createMockTrayInstance = () => ({
  setToolTip: (...args) => { mockCalls.tray.setToolTip.push(args); },
  setImage: (...args) => { mockCalls.tray.setImage.push(args); },
  setContextMenu: (...args) => { mockCalls.tray.setContextMenu.push(args); },
  destroy: (...args) => { mockCalls.tray.destroy.push(args); },
  isDestroyed: () => {
    mockCalls.tray.isDestroyed.push([]);
    return mockTrayInstance?._destroyed || false;
  },
  on: (...args) => { mockCalls.tray.on.push(args); },
  _destroyed: false
});

// Mock Electron modules
const mockElectron = {
  Tray: class MockTray {
    constructor(...args) {
      mockCalls.Tray.push(args);
      mockTrayInstance = createMockTrayInstance();
      return mockTrayInstance;
    }
  },
  Menu: {
    buildFromTemplate: (...args) => {
      mockCalls.menu.buildFromTemplate.push(args);
      return {};
    }
  },
  app: {
    setBadgeCount: (...args) => { mockCalls.app.setBadgeCount.push(args); }
  },
  nativeImage: {
    createFromPath: (path) => {
      mockCalls.nativeImage.createFromPath.push([path]);
      return {
        resize: () => `resized:${path}`
      };
    },
    createFromDataURL: (url) => {
      mockCalls.nativeImage.createFromDataURL.push([url]);
      return {
        resize: () => `resized:${url}`
      };
    }
  }
};

// Replace electron module in require cache
require.cache[require.resolve('electron')] = {
  id: require.resolve('electron'),
  filename: require.resolve('electron'),
  loaded: true,
  exports: mockElectron
};

// Import TrayManager (it will use our mocked electron)
const TrayManager = require('../../../../../app/domains/shell/services/TrayManager.js');

describe('TrayManager', () => {
  let trayManager;
  let mockEventBus;
  let mockConfig;
  let originalPlatform;

  beforeEach(() => {
    // Reset all mock call tracking
    mockCalls.tray.setToolTip.length = 0;
    mockCalls.tray.setImage.length = 0;
    mockCalls.tray.setContextMenu.length = 0;
    mockCalls.tray.destroy.length = 0;
    mockCalls.tray.isDestroyed.length = 0;
    mockCalls.tray.on.length = 0;
    mockCalls.Tray.length = 0;
    mockCalls.menu.buildFromTemplate.length = 0;
    mockCalls.app.setBadgeCount.length = 0;
    mockCalls.nativeImage.createFromPath.length = 0;
    mockCalls.nativeImage.createFromDataURL.length = 0;

    // Reset tray instance
    mockTrayInstance = null;

    // Setup test doubles
    mockEventBus = createMockEventEmitter();
    mockConfig = {
      appTitle: 'Test Teams App'
    };

    // Store original platform
    originalPlatform = process.platform;

    trayManager = new TrayManager(mockConfig, mockEventBus);
  });

  afterEach(() => {
    // Restore platform
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
      writable: true
    });
  });

  // ============================================================================
  // Constructor Tests
  // ============================================================================

  describe('Constructor', () => {
    it('should initialize with config and EventBus', () => {
      const manager = new TrayManager(mockConfig, mockEventBus);

      assert.ok(manager);
      assert.equal(manager._config, mockConfig);
      assert.equal(manager._eventBus, mockEventBus);
      assert.equal(manager._tray, null);
      assert.equal(manager._badgeCount, 0);
      assert.equal(manager.getBadgeCount(), 0);
      assert.equal(manager.isInitialized(), false);
    });

    it('should detect platform correctly', () => {
      const manager = new TrayManager(mockConfig, mockEventBus);

      assert.equal(manager.getPlatform(), process.platform);
      assert.equal(typeof manager._isMac, 'boolean');
    });

    it('should work without EventBus', () => {
      const manager = new TrayManager(mockConfig, null);

      assert.ok(manager);
      assert.equal(manager._eventBus, null);
    });
  });

  // ============================================================================
  // createTray() Tests
  // ============================================================================

  describe('createTray()', () => {
    it('should create tray with basic options', () => {
      const options = {
        iconPath: '/path/to/icon.png',
        tooltip: 'Test Tooltip'
      };

      const tray = trayManager.createTray(options);

      assert.ok(tray);
      assert.equal(mockCalls.Tray.length, 1);
      assert.equal(mockCalls.tray.setToolTip.length, 1);
      assert.deepEqual(mockCalls.tray.setToolTip[0], ['Test Tooltip']);
      assert.equal(trayManager.isInitialized(), true);
    });

    it('should use default tooltip when none provided', () => {
      const options = {
        iconPath: '/path/to/icon.png'
      };

      trayManager.createTray(options);

      assert.equal(mockCalls.tray.setToolTip.length, 1);
      assert.equal(mockCalls.tray.setToolTip[0][0], 'Test Teams App');
    });

    it('should attach click handler', () => {
      const onClick = createSpy();
      const options = {
        iconPath: '/path/to/icon.png',
        onClick
      };

      trayManager.createTray(options);

      // Verify click handler was registered
      assert.equal(mockCalls.tray.on.length, 1);
      assert.equal(mockCalls.tray.on[0][0], 'click');

      // Trigger the click handler
      const clickHandler = mockCalls.tray.on[0][1];
      clickHandler();

      assert.equal(onClick.callCount(), 1);
    });

    it('should attach right-click handler', () => {
      const onRightClick = createSpy();
      const options = {
        iconPath: '/path/to/icon.png',
        onRightClick
      };

      trayManager.createTray(options);

      // Verify right-click handler was registered
      const rightClickCall = mockCalls.tray.on.find(
        call => call[0] === 'right-click'
      );
      assert.ok(rightClickCall);

      // Trigger the right-click handler
      rightClickCall[1]();

      assert.equal(onRightClick.callCount(), 1);
    });

    it('should set context menu when provided', () => {
      const menuTemplate = [
        { label: 'Item 1', click: () => {} },
        { label: 'Item 2', click: () => {} }
      ];

      const options = {
        iconPath: '/path/to/icon.png',
        menuTemplate
      };

      trayManager.createTray(options);

      assert.equal(mockCalls.menu.buildFromTemplate.length, 1);
      assert.equal(mockCalls.tray.setContextMenu.length, 1);
    });

    it('should emit shell.tray.created event', () => {
      const eventSpy = createSpy();
      mockEventBus.on('shell.tray.created', eventSpy);

      const options = {
        iconPath: '/path/to/icon.png',
        tooltip: 'Test'
      };

      trayManager.createTray(options);

      assert.equal(eventSpy.callCount(), 1);
      const eventData = eventSpy.lastCall()[0];
      assert.equal(eventData.platform, process.platform);
      assert.equal(eventData.iconPath, '/path/to/icon.png');
      assert.equal(eventData.tooltip, 'Test');
      assert.ok(eventData.timestamp);
    });

    it('should throw error if tray already exists', () => {
      const options = { iconPath: '/path/to/icon.png' };

      trayManager.createTray(options);

      assert.throws(
        () => trayManager.createTray(options),
        /Tray already exists/
      );
    });

    it('should emit click events when tray is clicked', () => {
      const eventSpy = createSpy();
      mockEventBus.on('shell.tray.clicked', eventSpy);

      const onClick = createSpy();
      trayManager.createTray({ iconPath: '/test.png', onClick });

      // Trigger click
      const clickHandler = mockCalls.tray.on[0][1];
      clickHandler();

      assert.equal(eventSpy.callCount(), 1);
      assert.ok(eventSpy.lastCall()[0].timestamp);
    });
  });

  // ============================================================================
  // updateIcon() Tests
  // ============================================================================

  describe('updateIcon()', () => {
    beforeEach(() => {
      trayManager.createTray({ iconPath: '/initial.png' });
      // Reset after createTray
      mockCalls.nativeImage.createFromPath.length = 0;
    });

    it('should update tray icon', () => {
      trayManager.updateIcon('/new-icon.png');

      assert.equal(mockCalls.nativeImage.createFromPath.length, 1);
      assert.equal(mockCalls.tray.setImage.length, 1);
    });

    it('should handle data URL icons', () => {
      const dataUrl = 'data:image/png;base64,iVBORw0KGgo...';

      trayManager.updateIcon(dataUrl);

      assert.equal(mockCalls.nativeImage.createFromDataURL.length, 1);
      assert.equal(mockCalls.nativeImage.createFromDataURL[0][0], dataUrl);
    });

    it('should emit shell.tray.iconUpdated event', () => {
      const eventSpy = createSpy();
      mockEventBus.on('shell.tray.iconUpdated', eventSpy);

      trayManager.updateIcon('/new-icon.png');

      assert.equal(eventSpy.callCount(), 1);
      const eventData = eventSpy.lastCall()[0];
      assert.equal(eventData.iconPath, '/new-icon.png');
      assert.ok(eventData.timestamp);
    });

    it('should throw error if tray not initialized', () => {
      const uninitializedManager = new TrayManager(mockConfig, mockEventBus);

      assert.throws(
        () => uninitializedManager.updateIcon('/new.png'),
        /Tray not initialized/
      );
    });

    it('should throw error if tray is destroyed', () => {
      if (mockTrayInstance) {
        mockTrayInstance._destroyed = true;
      }

      assert.throws(
        () => trayManager.updateIcon('/new.png'),
        /Tray not initialized/
      );
    });
  });

  // ============================================================================
  // setBadgeCount() Tests
  // ============================================================================

  describe('setBadgeCount()', () => {
    beforeEach(() => {
      mockCalls.app.setBadgeCount.length = 0;
    });

    it('should update badge count on macOS', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin', writable: true });
      const macManager = new TrayManager(mockConfig, mockEventBus);
      macManager.createTray({ iconPath: '/test.png' });

      macManager.setBadgeCount(5);

      assert.equal(mockCalls.app.setBadgeCount.length, 1);
      assert.equal(mockCalls.app.setBadgeCount[0][0], 5);
      assert.equal(macManager.getBadgeCount(), 5);
    });

    it('should update tooltip with badge on Windows/Linux', () => {
      Object.defineProperty(process, 'platform', { value: 'win32', writable: true });
      const winManager = new TrayManager(mockConfig, mockEventBus);
      winManager.createTray({ iconPath: '/test.png' });

      // Reset setToolTip calls after createTray
      mockCalls.tray.setToolTip.length = 0;

      winManager.setBadgeCount(3);

      // Should call setTooltip which updates the tray tooltip
      assert.equal(mockCalls.tray.setToolTip.length, 1);
      const tooltipCall = mockCalls.tray.setToolTip[0][0];
      assert.ok(tooltipCall.includes('(3)'));
    });

    it('should handle zero badge count', () => {
      trayManager.createTray({ iconPath: '/test.png' });
      trayManager.setBadgeCount(5);

      const eventSpy = createSpy();
      mockEventBus.on('shell.tray.badgeUpdated', eventSpy);

      trayManager.setBadgeCount(0);

      assert.equal(trayManager.getBadgeCount(), 0);
      assert.equal(eventSpy.callCount(), 1);
      assert.equal(eventSpy.lastCall()[0].newCount, 0);
    });

    it('should emit shell.tray.badgeUpdated event', () => {
      trayManager.createTray({ iconPath: '/test.png' });

      const eventSpy = createSpy();
      mockEventBus.on('shell.tray.badgeUpdated', eventSpy);

      trayManager.setBadgeCount(7);

      assert.equal(eventSpy.callCount(), 1);
      const eventData = eventSpy.lastCall()[0];
      assert.equal(eventData.oldCount, 0);
      assert.equal(eventData.newCount, 7);
      assert.equal(eventData.platform, process.platform);
      assert.ok(eventData.timestamp);
    });

    it('should not emit event if count unchanged', () => {
      trayManager.createTray({ iconPath: '/test.png' });
      trayManager.setBadgeCount(5);

      const eventSpy = createSpy();
      mockEventBus.on('shell.tray.badgeUpdated', eventSpy);

      trayManager.setBadgeCount(5);

      assert.equal(eventSpy.callCount(), 0);
    });

    it('should handle negative values as zero', () => {
      trayManager.createTray({ iconPath: '/test.png' });

      trayManager.setBadgeCount(-5);

      assert.equal(trayManager.getBadgeCount(), 0);
    });

    it('should handle non-numeric values', () => {
      trayManager.createTray({ iconPath: '/test.png' });

      trayManager.setBadgeCount('invalid');

      assert.equal(trayManager.getBadgeCount(), 0);
    });
  });

  // ============================================================================
  // setTooltip() Tests
  // ============================================================================

  describe('setTooltip()', () => {
    beforeEach(() => {
      trayManager.createTray({ iconPath: '/test.png' });
      mockCalls.tray.setToolTip.length = 0;
    });

    it('should update tooltip', () => {
      trayManager.setTooltip('New Tooltip');

      assert.equal(mockCalls.tray.setToolTip.length, 1);
      assert.equal(mockCalls.tray.setToolTip[0][0], 'New Tooltip');
    });

    it('should emit shell.tray.tooltipUpdated event', () => {
      const eventSpy = createSpy();
      mockEventBus.on('shell.tray.tooltipUpdated', eventSpy);

      trayManager.setTooltip('Updated Tooltip');

      assert.equal(eventSpy.callCount(), 1);
      const eventData = eventSpy.lastCall()[0];
      assert.ok(eventData.oldTooltip);
      assert.equal(eventData.newTooltip, 'Updated Tooltip');
      assert.ok(eventData.timestamp);
    });

    it('should throw error if tray not initialized', () => {
      const uninitializedManager = new TrayManager(mockConfig, mockEventBus);

      assert.throws(
        () => uninitializedManager.setTooltip('Test'),
        /Tray not initialized/
      );
    });
  });

  // ============================================================================
  // setContextMenu() Tests
  // ============================================================================

  describe('setContextMenu()', () => {
    beforeEach(() => {
      trayManager.createTray({ iconPath: '/test.png' });
      mockCalls.menu.buildFromTemplate.length = 0;
      mockCalls.tray.setContextMenu.length = 0;
    });

    it('should set context menu', () => {
      const menuTemplate = [
        { label: 'Option 1', click: () => {} },
        { label: 'Option 2', click: () => {} }
      ];

      trayManager.setContextMenu(menuTemplate);

      assert.equal(mockCalls.menu.buildFromTemplate.length, 1);
      assert.equal(mockCalls.tray.setContextMenu.length, 1);
    });

    it('should emit shell.tray.menuUpdated event', () => {
      const eventSpy = createSpy();
      mockEventBus.on('shell.tray.menuUpdated', eventSpy);

      const menuTemplate = [
        { label: 'Item 1' },
        { label: 'Item 2' },
        { label: 'Item 3' }
      ];

      trayManager.setContextMenu(menuTemplate);

      assert.equal(eventSpy.callCount(), 1);
      const eventData = eventSpy.lastCall()[0];
      assert.equal(eventData.menuItemCount, 3);
      assert.ok(eventData.timestamp);
    });

    it('should throw error if tray not initialized', () => {
      const uninitializedManager = new TrayManager(mockConfig, mockEventBus);

      assert.throws(
        () => uninitializedManager.setContextMenu([]),
        /Tray not initialized/
      );
    });
  });

  // ============================================================================
  // cleanup() Tests
  // ============================================================================

  describe('cleanup()', () => {
    it('should destroy tray and reset state', () => {
      trayManager.createTray({ iconPath: '/test.png' });
      trayManager.setBadgeCount(5);

      trayManager.cleanup();

      assert.equal(mockCalls.tray.destroy.length, 1);
      assert.equal(trayManager.isInitialized(), false);
      assert.equal(trayManager.getBadgeCount(), 0);
      assert.equal(trayManager._currentIconPath, null);
      assert.equal(trayManager._currentTooltip, null);
    });

    it('should clear badge on macOS', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin', writable: true });
      const macManager = new TrayManager(mockConfig, mockEventBus);
      macManager.createTray({ iconPath: '/test.png' });
      macManager.setBadgeCount(10);

      mockCalls.app.setBadgeCount.length = 0;
      macManager.cleanup();

      assert.equal(mockCalls.app.setBadgeCount.length, 1);
      assert.equal(mockCalls.app.setBadgeCount[0][0], 0);
    });

    it('should emit shell.tray.destroyed event', () => {
      trayManager.createTray({ iconPath: '/test.png' });

      const eventSpy = createSpy();
      mockEventBus.on('shell.tray.destroyed', eventSpy);

      trayManager.cleanup();

      assert.equal(eventSpy.callCount(), 1);
      assert.ok(eventSpy.lastCall()[0].timestamp);
    });

    it('should handle cleanup when tray not initialized', () => {
      const uninitializedManager = new TrayManager(mockConfig, mockEventBus);

      // Should not throw
      assert.doesNotThrow(() => uninitializedManager.cleanup());
    });

    it('should handle cleanup when tray already destroyed', () => {
      trayManager.createTray({ iconPath: '/test.png' });
      if (mockTrayInstance) {
        mockTrayInstance._destroyed = true;
      }

      // Should not throw
      assert.doesNotThrow(() => trayManager.cleanup());
    });
  });

  // ============================================================================
  // Getter Tests
  // ============================================================================

  describe('Getters', () => {
    it('getBadgeCount() should return current badge count', () => {
      trayManager.createTray({ iconPath: '/test.png' });

      assert.equal(trayManager.getBadgeCount(), 0);

      trayManager.setBadgeCount(10);
      assert.equal(trayManager.getBadgeCount(), 10);
    });

    it('getPlatform() should return current platform', () => {
      assert.equal(trayManager.getPlatform(), process.platform);
    });

    it('isInitialized() should return tray state', () => {
      assert.equal(trayManager.isInitialized(), false);

      trayManager.createTray({ iconPath: '/test.png' });
      assert.equal(trayManager.isInitialized(), true);

      trayManager.cleanup();
      assert.equal(trayManager.isInitialized(), false);
    });

    it('getTrayInstance() should return tray instance', () => {
      assert.equal(trayManager.getTrayInstance(), null);

      trayManager.createTray({ iconPath: '/test.png' });
      assert.ok(trayManager.getTrayInstance());
    });
  });

  // ============================================================================
  // Edge Cases & Error Handling
  // ============================================================================

  describe('Edge Cases', () => {
    it('should work without EventBus (no crashes)', () => {
      const managerWithoutBus = new TrayManager(mockConfig, null);

      // Should not throw when emitting events
      assert.doesNotThrow(() => {
        managerWithoutBus.createTray({ iconPath: '/test.png' });
        managerWithoutBus.setBadgeCount(5);
        managerWithoutBus.cleanup();
      });
    });

    it('should handle empty config object', () => {
      const managerWithEmptyConfig = new TrayManager({}, mockEventBus);

      const tray = managerWithEmptyConfig.createTray({ iconPath: '/test.png' });

      assert.ok(tray);
      // Should use default tooltip
      assert.equal(mockCalls.tray.setToolTip[0][0], 'Teams for Linux');
    });

    it('should handle null config', () => {
      const managerWithNullConfig = new TrayManager(null, mockEventBus);

      const tray = managerWithNullConfig.createTray({ iconPath: '/test.png' });

      assert.ok(tray);
    });

    it('should handle empty menu template', () => {
      trayManager.createTray({ iconPath: '/test.png' });

      assert.doesNotThrow(() => {
        trayManager.setContextMenu([]);
      });
    });
  });
});
