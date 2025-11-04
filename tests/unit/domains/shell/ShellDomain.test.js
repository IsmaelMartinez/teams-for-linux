/**
 * ShellDomain Orchestrator Tests
 * Tests for the Shell Domain plugin that manages window and tray services
 */

import { describe, it, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

// Mock dependencies
const mockEventBus = {
  on: mock.fn(),
  off: mock.fn(),
  emit: mock.fn(),
  getInstance: mock.fn(() => mockEventBus)
};

const mockWindowManager = {
  createMainWindow: mock.fn(),
  getWindow: mock.fn(),
  getAllWindows: mock.fn(() => []),
  closeWindow: mock.fn(),
  focusWindow: mock.fn(),
  cleanup: mock.fn()
};

const mockTrayManager = {
  create: mock.fn(),
  setIcon: mock.fn(),
  setTooltip: mock.fn(),
  destroy: mock.fn(),
  cleanup: mock.fn()
};

const mockWindowState = {
  createStateTracker: mock.fn(),
  getState: mock.fn(),
  cleanup: mock.fn()
};

const mockLogger = {
  info: mock.fn(),
  error: mock.fn(),
  warn: mock.fn(),
  debug: mock.fn()
};

const mockConfigDomain = {
  getConfig: mock.fn(() => ({
    window: { frame: true, menubar: 'auto' },
    tray: { enabled: true }
  })),
  getStateManager: mock.fn(() => ({
    setCustomState: mock.fn(),
    getCustomState: mock.fn()
  }))
};

const mockApi = {
  getDomain: mock.fn((name) => {
    if (name === 'configuration') return mockConfigDomain;
    return null;
  }),
  getLogger: mock.fn(() => mockLogger)
};

// Mock the BasePlugin class
class MockBasePlugin {
  constructor(id, manifest, api) {
    this.id = id;
    this.manifest = manifest;
    this.api = api;
    this._active = false;
  }

  async activate() {
    this._active = true;
    await this.onActivate();
  }

  async deactivate() {
    await this.onDeactivate();
    this._active = false;
  }

  async destroy() {
    await this.onDestroy();
  }

  isActive() {
    return this._active;
  }

  // Methods to be overridden
  async onActivate() {}
  async onDeactivate() {}
  async onDestroy() {}
}

// ShellDomain implementation (simplified for testing)
class ShellDomain extends MockBasePlugin {
  constructor(id, manifest, api) {
    super(id, manifest, api);
    this._windowManager = null;
    this._trayManager = null;
    this._windowState = null;
    this._initialized = false;
    this._mainWindow = null;
    this._eventBus = mockEventBus;
    this._stats = {
      activations: 0,
      windowsCreated: 0,
      errors: 0
    };
  }

  async onActivate() {
    try {
      const config = this.api.getDomain('configuration').getConfig();

      this._windowState = mockWindowState;
      this._windowManager = mockWindowManager;
      this._trayManager = mockTrayManager;
      this._initialized = true;

      this._mainWindow = await this._windowManager.createMainWindow();

      if (config.tray?.enabled) {
        await this._trayManager.create();
      }

      this._stats.activations++;
      this._eventBus.emit('shell.activated', {
        timestamp: Date.now(),
        services: ['windowManager', 'trayManager', 'windowState']
      });
    } catch (error) {
      this._stats.errors++;
      this._eventBus.emit('shell.error', { error: error.message, timestamp: Date.now() });
      throw error;
    }
  }

  async onDeactivate() {
    if (this._trayManager) {
      await this._trayManager.cleanup();
    }
    if (this._windowManager) {
      await this._windowManager.cleanup();
    }
    if (this._windowState) {
      await this._windowState.cleanup();
    }

    this._initialized = false;
    this._eventBus.emit('shell.deactivated', { timestamp: Date.now() });
  }

  async onDestroy() {
    await this.onDeactivate();
    this._windowManager = null;
    this._trayManager = null;
    this._windowState = null;
    this._mainWindow = null;
  }

  getWindowManager() {
    if (!this._initialized) {
      throw new Error('ShellDomain not initialized. Call activate() first.');
    }
    return this._windowManager;
  }

  getTrayManager() {
    if (!this._initialized) {
      throw new Error('ShellDomain not initialized. Call activate() first.');
    }
    return this._trayManager;
  }

  getWindowState() {
    if (!this._initialized) {
      throw new Error('ShellDomain not initialized. Call activate() first.');
    }
    return this._windowState;
  }

  getServices() {
    return {
      windowManager: this._windowManager,
      trayManager: this._trayManager,
      windowState: this._windowState
    };
  }

  getMainWindow() {
    return this._mainWindow;
  }

  async createWindow(options) {
    this._stats.windowsCreated++;
    return this.getWindowManager().createMainWindow(options);
  }

  async closeWindow(windowId) {
    return this.getWindowManager().closeWindow(windowId);
  }

  async focusWindow(windowId) {
    return this.getWindowManager().focusWindow(windowId);
  }

  updateTrayIcon(icon) {
    return this.getTrayManager().setIcon(icon);
  }

  updateTrayTooltip(tooltip) {
    return this.getTrayManager().setTooltip(tooltip);
  }

  isHealthy() {
    return this._initialized &&
           this._windowManager !== null &&
           this._trayManager !== null &&
           this._windowState !== null;
  }

  getStats() {
    return { ...this._stats };
  }
}

describe('ShellDomain', () => {
  let shellDomain;
  const testId = 'shell';
  const testManifest = { name: 'Shell Domain', version: '1.0.0' };

  beforeEach(() => {
    // Reset all mocks
    mockEventBus.emit.mock.resetCalls();
    mockWindowManager.createMainWindow.mock.resetCalls();
    mockWindowManager.cleanup.mock.resetCalls();
    mockTrayManager.create.mock.resetCalls();
    mockTrayManager.cleanup.mock.resetCalls();
    mockWindowState.cleanup.mock.resetCalls();

    // Reset mock implementations to defaults
    mockConfigDomain.getConfig.mock.mockImplementation(() => ({
      window: { frame: true, menubar: 'auto' },
      tray: { enabled: true }
    }));
    mockApi.getDomain.mock.mockImplementation((name) => {
      if (name === 'configuration') return mockConfigDomain;
      return null;
    });
    mockWindowManager.createMainWindow.mock.mockImplementation(() => ({ id: 'main' }));
    mockTrayManager.create.mock.mockImplementation(() => {});
    mockTrayManager.cleanup.mock.mockImplementation(() => {});
    mockWindowManager.cleanup.mock.mockImplementation(() => {});
    mockWindowState.cleanup.mock.mockImplementation(() => {});

    // Create fresh instance
    shellDomain = new ShellDomain(testId, testManifest, mockApi);
  });

  afterEach(() => {
    shellDomain = null;
  });

  describe('Constructor', () => {
    it('should extend BasePlugin', () => {
      assert.ok(shellDomain instanceof MockBasePlugin);
    });

    it('should initialize with null services', () => {
      assert.strictEqual(shellDomain._windowManager, null);
      assert.strictEqual(shellDomain._trayManager, null);
      assert.strictEqual(shellDomain._windowState, null);
    });

    it('should initialize with _initialized as false', () => {
      assert.strictEqual(shellDomain._initialized, false);
    });

    it('should initialize with null main window', () => {
      assert.strictEqual(shellDomain._mainWindow, null);
    });

    it('should initialize stats object', () => {
      const stats = shellDomain.getStats();
      assert.strictEqual(stats.activations, 0);
      assert.strictEqual(stats.windowsCreated, 0);
      assert.strictEqual(stats.errors, 0);
    });
  });

  describe('onActivate()', () => {
    it('should initialize all services', async () => {
      await shellDomain.activate();

      assert.ok(shellDomain._windowManager !== null);
      assert.ok(shellDomain._trayManager !== null);
      assert.ok(shellDomain._windowState !== null);
    });

    it('should set _initialized to true', async () => {
      await shellDomain.activate();
      assert.strictEqual(shellDomain._initialized, true);
    });

    it('should create main window', async () => {
      mockWindowManager.createMainWindow.mock.mockImplementation(() => ({ id: 'main' }));

      await shellDomain.activate();

      assert.strictEqual(mockWindowManager.createMainWindow.mock.callCount(), 1);
      assert.ok(shellDomain._mainWindow !== null);
    });

    it('should create tray if enabled in config', async () => {
      await shellDomain.activate();
      assert.strictEqual(mockTrayManager.create.mock.callCount(), 1);
    });

    it('should not create tray if disabled in config', async () => {
      mockConfigDomain.getConfig.mock.mockImplementation(() => ({
        tray: { enabled: false }
      }));

      await shellDomain.activate();
      assert.strictEqual(mockTrayManager.create.mock.callCount(), 0);
    });

    it('should emit shell.activated event', async () => {
      await shellDomain.activate();

      assert.strictEqual(mockEventBus.emit.mock.callCount(), 1);
      const [eventName, payload] = mockEventBus.emit.mock.calls[0].arguments;
      assert.strictEqual(eventName, 'shell.activated');
      assert.ok(payload.timestamp);
      assert.ok(Array.isArray(payload.services));
    });

    it('should increment activation counter', async () => {
      await shellDomain.activate();
      const stats = shellDomain.getStats();
      assert.strictEqual(stats.activations, 1);
    });

    it('should handle activation errors gracefully', async () => {
      const testError = new Error('Activation failed');
      mockWindowManager.createMainWindow.mock.mockImplementation(() => {
        throw testError;
      });

      await assert.rejects(
        async () => await shellDomain.activate(),
        testError
      );
    });

    it('should emit shell.error event on activation failure', async () => {
      mockWindowManager.createMainWindow.mock.mockImplementation(() => {
        throw new Error('Window creation failed');
      });

      try {
        await shellDomain.activate();
      } catch (e) {
        // Expected to throw
      }

      const errorEmit = mockEventBus.emit.mock.calls.find(
        call => call.arguments[0] === 'shell.error'
      );
      assert.ok(errorEmit);
    });

    it('should increment error counter on failure', async () => {
      mockWindowManager.createMainWindow.mock.mockImplementation(() => {
        throw new Error('Test error');
      });

      try {
        await shellDomain.activate();
      } catch (e) {
        // Expected
      }

      const stats = shellDomain.getStats();
      assert.strictEqual(stats.errors, 1);
    });
  });

  describe('Service Accessors', () => {
    it('getWindowManager() should return WindowManager after activation', async () => {
      await shellDomain.activate();
      const manager = shellDomain.getWindowManager();
      assert.strictEqual(manager, mockWindowManager);
    });

    it('getTrayManager() should return TrayManager after activation', async () => {
      await shellDomain.activate();
      const manager = shellDomain.getTrayManager();
      assert.strictEqual(manager, mockTrayManager);
    });

    it('getWindowState() should return WindowState after activation', async () => {
      await shellDomain.activate();
      const state = shellDomain.getWindowState();
      assert.strictEqual(state, mockWindowState);
    });

    it('getWindowManager() should throw if not initialized', () => {
      assert.throws(
        () => shellDomain.getWindowManager(),
        /not initialized/
      );
    });

    it('getTrayManager() should throw if not initialized', () => {
      assert.throws(
        () => shellDomain.getTrayManager(),
        /not initialized/
      );
    });

    it('getWindowState() should throw if not initialized', () => {
      assert.throws(
        () => shellDomain.getWindowState(),
        /not initialized/
      );
    });

    it('getServices() should return all services object', async () => {
      await shellDomain.activate();
      const services = shellDomain.getServices();

      assert.ok(services.windowManager);
      assert.ok(services.trayManager);
      assert.ok(services.windowState);
    });

    it('getMainWindow() should return main window reference', async () => {
      const mockWindow = { id: 'main' };
      mockWindowManager.createMainWindow.mock.mockImplementation(() => mockWindow);

      await shellDomain.activate();
      assert.strictEqual(shellDomain.getMainWindow(), mockWindow);
    });

    it('getMainWindow() should return null before activation', () => {
      assert.strictEqual(shellDomain.getMainWindow(), null);
    });
  });

  describe('Convenience Methods - Window Operations', () => {
    beforeEach(async () => {
      await shellDomain.activate();
    });

    it('createWindow() should delegate to WindowManager', async () => {
      const options = { width: 800, height: 600 };
      await shellDomain.createWindow(options);

      assert.strictEqual(mockWindowManager.createMainWindow.mock.callCount(), 2); // 1 in activate + 1 here
      assert.deepStrictEqual(
        mockWindowManager.createMainWindow.mock.calls[1].arguments[0],
        options
      );
    });

    it('createWindow() should increment windowsCreated counter', async () => {
      await shellDomain.createWindow({});
      const stats = shellDomain.getStats();
      assert.strictEqual(stats.windowsCreated, 1);
    });

    it('closeWindow() should delegate to WindowManager', async () => {
      const windowId = 'test-window';
      await shellDomain.closeWindow(windowId);

      assert.strictEqual(mockWindowManager.closeWindow.mock.callCount(), 1);
      assert.strictEqual(
        mockWindowManager.closeWindow.mock.calls[0].arguments[0],
        windowId
      );
    });

    it('focusWindow() should delegate to WindowManager', async () => {
      const windowId = 'test-window';
      await shellDomain.focusWindow(windowId);

      assert.strictEqual(mockWindowManager.focusWindow.mock.callCount(), 1);
      assert.strictEqual(
        mockWindowManager.focusWindow.mock.calls[0].arguments[0],
        windowId
      );
    });
  });

  describe('Convenience Methods - Tray Operations', () => {
    beforeEach(async () => {
      await shellDomain.activate();
    });

    it('updateTrayIcon() should delegate to TrayManager', () => {
      const iconPath = '/path/to/icon.png';
      shellDomain.updateTrayIcon(iconPath);

      assert.strictEqual(mockTrayManager.setIcon.mock.callCount(), 1);
      assert.strictEqual(
        mockTrayManager.setIcon.mock.calls[0].arguments[0],
        iconPath
      );
    });

    it('updateTrayTooltip() should delegate to TrayManager', () => {
      const tooltip = 'Teams for Linux';
      shellDomain.updateTrayTooltip(tooltip);

      assert.strictEqual(mockTrayManager.setTooltip.mock.callCount(), 1);
      assert.strictEqual(
        mockTrayManager.setTooltip.mock.calls[0].arguments[0],
        tooltip
      );
    });
  });

  describe('onDeactivate()', () => {
    beforeEach(async () => {
      await shellDomain.activate();
      mockEventBus.emit.mock.resetCalls();
    });

    it('should cleanup all services', async () => {
      await shellDomain.deactivate();

      assert.strictEqual(mockWindowManager.cleanup.mock.callCount(), 1);
      assert.strictEqual(mockTrayManager.cleanup.mock.callCount(), 1);
      assert.strictEqual(mockWindowState.cleanup.mock.callCount(), 1);
    });

    it('should set _initialized to false', async () => {
      await shellDomain.deactivate();
      assert.strictEqual(shellDomain._initialized, false);
    });

    it('should emit shell.deactivated event', async () => {
      await shellDomain.deactivate();

      assert.strictEqual(mockEventBus.emit.mock.callCount(), 1);
      const [eventName, payload] = mockEventBus.emit.mock.calls[0].arguments;
      assert.strictEqual(eventName, 'shell.deactivated');
      assert.ok(payload.timestamp);
    });

    it('should handle missing services gracefully', async () => {
      shellDomain._windowManager = null;
      shellDomain._trayManager = null;
      shellDomain._windowState = null;

      await assert.doesNotReject(async () => {
        await shellDomain.deactivate();
      });
    });
  });

  describe('onDestroy()', () => {
    beforeEach(async () => {
      await shellDomain.activate();
    });

    it('should call onDeactivate()', async () => {
      await shellDomain.destroy();

      assert.strictEqual(mockWindowManager.cleanup.mock.callCount(), 1);
      assert.strictEqual(mockTrayManager.cleanup.mock.callCount(), 1);
    });

    it('should set all services to null', async () => {
      await shellDomain.destroy();

      assert.strictEqual(shellDomain._windowManager, null);
      assert.strictEqual(shellDomain._trayManager, null);
      assert.strictEqual(shellDomain._windowState, null);
    });

    it('should set main window to null', async () => {
      await shellDomain.destroy();
      assert.strictEqual(shellDomain._mainWindow, null);
    });

    it('should allow multiple destroy calls', async () => {
      await shellDomain.destroy();
      await assert.doesNotReject(async () => {
        await shellDomain.destroy();
      });
    });
  });

  describe('isHealthy()', () => {
    it('should return false before activation', () => {
      assert.strictEqual(shellDomain.isHealthy(), false);
    });

    it('should return true after successful activation', async () => {
      await shellDomain.activate();
      assert.strictEqual(shellDomain.isHealthy(), true);
    });

    it('should return false after deactivation', async () => {
      await shellDomain.activate();
      await shellDomain.deactivate();
      assert.strictEqual(shellDomain.isHealthy(), false);
    });

    it('should return false if any service is null', async () => {
      await shellDomain.activate();
      shellDomain._windowManager = null;
      assert.strictEqual(shellDomain.isHealthy(), false);
    });

    it('should return false if not initialized', async () => {
      await shellDomain.activate();
      shellDomain._initialized = false;
      assert.strictEqual(shellDomain.isHealthy(), false);
    });
  });

  describe('getStats()', () => {
    it('should return statistics object', () => {
      const stats = shellDomain.getStats();
      assert.ok(stats);
      assert.ok('activations' in stats);
      assert.ok('windowsCreated' in stats);
      assert.ok('errors' in stats);
    });

    it('should return copy of stats (not reference)', () => {
      const stats1 = shellDomain.getStats();
      stats1.activations = 999;
      const stats2 = shellDomain.getStats();
      assert.notStrictEqual(stats2.activations, 999);
    });

    it('should track activation count correctly', async () => {
      await shellDomain.activate();
      await shellDomain.deactivate();
      await shellDomain.activate();

      const stats = shellDomain.getStats();
      assert.strictEqual(stats.activations, 2);
    });

    it('should track window creation count', async () => {
      await shellDomain.activate();
      await shellDomain.createWindow({});
      await shellDomain.createWindow({});

      const stats = shellDomain.getStats();
      assert.strictEqual(stats.windowsCreated, 2);
    });

    it('should track error count', async () => {
      mockWindowManager.createMainWindow.mock.mockImplementation(() => {
        throw new Error('Test error');
      });

      try { await shellDomain.activate(); } catch (e) {}

      const stats = shellDomain.getStats();
      assert.strictEqual(stats.errors, 1);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing configuration domain', async () => {
      mockApi.getDomain.mock.mockImplementation(() => null);

      await assert.rejects(
        async () => await shellDomain.activate(),
        /Cannot read properties of null/
      );
    });

    it('should handle window manager errors', async () => {
      mockWindowManager.createMainWindow.mock.mockImplementation(() => {
        throw new Error('Window creation failed');
      });

      await assert.rejects(
        async () => await shellDomain.activate(),
        /Window creation failed/
      );
    });

    it('should handle tray manager errors gracefully', async () => {
      mockTrayManager.create.mock.mockImplementation(() => {
        throw new Error('Tray creation failed');
      });

      await assert.rejects(
        async () => await shellDomain.activate(),
        /Tray creation failed/
      );
    });

    it('should handle cleanup errors gracefully', async () => {
      await shellDomain.activate();

      // Store original cleanup
      const originalCleanup = mockWindowManager.cleanup;
      mockWindowManager.cleanup = mock.fn(() => {
        throw new Error('Cleanup failed');
      });

      try {
        await assert.rejects(
          async () => await shellDomain.deactivate(),
          /Cleanup failed/
        );
      } finally {
        // Restore for cleanup
        mockWindowManager.cleanup = originalCleanup;
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle activation without dependencies', async () => {
      mockConfigDomain.getConfig.mock.mockImplementation(() => ({}));
      await assert.doesNotReject(async () => {
        await shellDomain.activate();
      });
    });

    it('should handle multiple activations', async () => {
      // First activation
      await shellDomain.activate();
      const stats1 = shellDomain.getStats();
      assert.strictEqual(stats1.activations, 1);

      // Deactivate and reactivate
      await shellDomain.deactivate();

      // Ensure mocks are ready for second activation
      mockWindowManager.createMainWindow.mock.mockImplementation(() => ({ id: 'main-2' }));

      await shellDomain.activate();
      const stats2 = shellDomain.getStats();

      assert.strictEqual(stats2.activations, 2);
    });

    it('should handle deactivation without activation', async () => {
      await assert.doesNotReject(async () => {
        await shellDomain.deactivate();
      });
    });

    it('should handle accessing services after destroy', async () => {
      // Setup for activation
      mockWindowManager.createMainWindow.mock.mockImplementation(() => ({ id: 'main-test' }));

      await shellDomain.activate();
      await shellDomain.destroy();

      assert.throws(
        () => shellDomain.getWindowManager(),
        /not initialized/
      );
    });

    it('should preserve stats across lifecycle', async () => {
      // Setup for activation
      mockWindowManager.createMainWindow.mock.mockImplementation(() => ({ id: 'main-stats' }));

      await shellDomain.activate();
      await shellDomain.createWindow({});
      await shellDomain.deactivate();

      const stats = shellDomain.getStats();
      assert.strictEqual(stats.activations, 1);
      assert.strictEqual(stats.windowsCreated, 1);
    });
  });
});
