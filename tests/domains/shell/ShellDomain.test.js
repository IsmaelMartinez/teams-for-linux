const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const ShellDomain = require('../../../app/domains/shell/ShellDomain');
const BasePlugin = require('../../../app/plugins/BasePlugin');

describe('ShellDomain', () => {
  let shellDomain;
  let mockApi;
  let mockManifest;

  beforeEach(() => {
    // Mock API
    mockApi = {
      getConfig: () => ({ mockConfig: true }),
      getDomain: () => null,
      emit: () => {},
      cleanup: () => {}
    };

    // Mock manifest
    mockManifest = {
      id: 'shell',
      name: 'Shell Domain',
      version: '1.0.0'
    };

    shellDomain = new ShellDomain('shell', mockManifest, mockApi);
  });

  describe('Construction', () => {
    it('should extend BasePlugin', () => {
      assert.ok(shellDomain instanceof BasePlugin);
    });

    it('should initialize with correct id', () => {
      assert.strictEqual(shellDomain.id, 'shell');
    });

    it('should initialize services as null', () => {
      assert.strictEqual(shellDomain._windowManager, null);
      assert.strictEqual(shellDomain._trayManager, null);
      assert.strictEqual(shellDomain._windowState, null);
    });
  });

  describe('Service Accessors', () => {
    it('getWindowManager should throw when not initialized', () => {
      assert.throws(
        () => shellDomain.getWindowManager(),
        /WindowManager not initialized/
      );
    });

    it('getTrayManager should throw when not initialized', () => {
      assert.throws(
        () => shellDomain.getTrayManager(),
        /TrayManager not initialized/
      );
    });

    it('getWindowState should throw when not initialized', () => {
      assert.throws(
        () => shellDomain.getWindowState(),
        /WindowState not initialized/
      );
    });
  });

  describe('Health Check', () => {
    it('isHealthy should return false when services not initialized', () => {
      assert.strictEqual(shellDomain.isHealthy(), false);
    });

    it('isHealthy should return true when all services initialized', () => {
      shellDomain._windowManager = { mock: 'windowManager' };
      shellDomain._trayManager = { mock: 'trayManager' };
      shellDomain._windowState = { mock: 'windowState' };

      assert.strictEqual(shellDomain.isHealthy(), true);
    });

    it('isHealthy should return false when any service missing', () => {
      shellDomain._windowManager = { mock: 'windowManager' };
      shellDomain._trayManager = { mock: 'trayManager' };
      // windowState missing

      assert.strictEqual(shellDomain.isHealthy(), false);
    });
  });

  describe('getServices', () => {
    it('should return all services', () => {
      const mockWM = { mock: 'windowManager' };
      const mockTM = { mock: 'trayManager' };
      const mockWS = { mock: 'windowState' };

      shellDomain._windowManager = mockWM;
      shellDomain._trayManager = mockTM;
      shellDomain._windowState = mockWS;

      const services = shellDomain.getServices();
      assert.deepStrictEqual(services, {
        windowManager: mockWM,
        trayManager: mockTM,
        windowState: mockWS
      });
    });
  });

  describe('getStats', () => {
    it('should return basic stats when services not initialized', () => {
      const stats = shellDomain.getStats();

      assert.deepStrictEqual(stats, {
        healthy: false,
        services: {
          windowManager: false,
          trayManager: false,
          windowState: false
        }
      });
    });

    it('should return detailed stats when services initialized', () => {
      shellDomain._windowManager = {
        getAllWindows: () => new Map([
          ['window1', {}],
          ['window2', {}]
        ])
      };
      shellDomain._trayManager = {
        isInitialized: () => true
      };
      shellDomain._windowState = {
        getTrackedWindowCount: () => 2
      };

      const stats = shellDomain.getStats();

      assert.strictEqual(stats.healthy, true);
      assert.deepStrictEqual(stats.services, {
        windowManager: true,
        trayManager: true,
        windowState: true
      });
      assert.deepStrictEqual(stats.windows, {
        count: 2,
        ids: ['window1', 'window2']
      });
      assert.deepStrictEqual(stats.tray, {
        initialized: true
      });
      assert.deepStrictEqual(stats.windowState, {
        trackedWindows: 2
      });
    });
  });

  describe('Convenience Methods', () => {
    it('createWindow should delegate to WindowManager', () => {
      const mockWindow = { mock: 'window' };
      const mockOptions = { width: 800, height: 600 };
      let calledWith = null;

      shellDomain._windowManager = {
        createWindow: (options) => {
          calledWith = options;
          return mockWindow;
        }
      };

      const result = shellDomain.createWindow(mockOptions);

      assert.deepStrictEqual(calledWith, mockOptions);
      assert.strictEqual(result, mockWindow);
    });

    it('createWindow should throw when WindowManager not initialized', () => {
      assert.throws(
        () => shellDomain.createWindow({}),
        /WindowManager not initialized/
      );
    });

    it('updateTrayIcon should delegate to TrayManager', () => {
      const iconPath = '/path/to/icon.png';
      let calledWith = null;

      shellDomain._trayManager = {
        setIcon: (path) => { calledWith = path; }
      };

      shellDomain.updateTrayIcon(iconPath);

      assert.strictEqual(calledWith, iconPath);
    });

    it('updateTrayIcon should throw when TrayManager not initialized', () => {
      assert.throws(
        () => shellDomain.updateTrayIcon('/icon.png'),
        /TrayManager not initialized/
      );
    });

    it('setTrayMenu should delegate to TrayManager', () => {
      const mockMenu = { mock: 'menu' };
      let calledWith = null;

      shellDomain._trayManager = {
        setMenu: (menu) => { calledWith = menu; }
      };

      shellDomain.setTrayMenu(mockMenu);

      assert.strictEqual(calledWith, mockMenu);
    });

    it('setTrayMenu should throw when TrayManager not initialized', () => {
      assert.throws(
        () => shellDomain.setTrayMenu({}),
        /TrayManager not initialized/
      );
    });
  });

  describe('Activation', () => {
    it('should handle services not yet implemented', async () => {
      let emittedEvent = null;

      // Mock configuration domain
      mockApi.getDomain = (domainId) => {
        if (domainId === 'configuration') {
          return {
            getAppConfiguration: () => ({ mock: 'config' })
          };
        }
        return null;
      };

      mockApi.emit = (event, data) => {
        emittedEvent = { event, data };
      };

      await shellDomain.activate();

      assert.strictEqual(shellDomain.isActive, true);
      assert.strictEqual(emittedEvent.event, 'shell.activated');
      assert.strictEqual(emittedEvent.data.status, 'partial');
      assert.strictEqual(emittedEvent.data.message, 'Services pending implementation');
    });

    it('should throw when configuration domain not available', async () => {
      mockApi.getDomain = () => null;

      await assert.rejects(
        () => shellDomain.activate(),
        /Configuration domain not available/
      );
    });
  });

  describe('Deactivation', () => {
    it('should handle deactivation when services not initialized', async () => {
      let emittedEvent = null;
      shellDomain._active = true;

      mockApi.emit = (event, data) => {
        emittedEvent = { event, data };
      };

      await shellDomain.deactivate();

      assert.strictEqual(shellDomain.isActive, false);
      assert.strictEqual(emittedEvent.event, 'shell.deactivated');
      assert.ok(emittedEvent.data.timestamp);
    });
  });

  describe('Destruction', () => {
    it('should cleanup all services on destroy', async () => {
      let closeCalled = false;
      const mockWindow = {
        isDestroyed: () => false,
        close: () => { closeCalled = true; }
      };

      shellDomain._windowManager = {
        getAllWindows: () => new Map([
          ['window1', mockWindow]
        ])
      };
      shellDomain._trayManager = { mock: 'tray' };
      shellDomain._windowState = { mock: 'state' };

      await shellDomain.destroy();

      assert.strictEqual(closeCalled, true);
      assert.strictEqual(shellDomain._windowManager, null);
      assert.strictEqual(shellDomain._trayManager, null);
      assert.strictEqual(shellDomain._windowState, null);
    });
  });
});
