const BasePlugin = require('../../plugins/BasePlugin');

/**
 * ShellDomain - Native shell integration and window management
 * Provides WindowManager, TrayManager, and WindowState services
 * Implements Shell Domain from ADR-004 for native OS shell integration
 */
class ShellDomain extends BasePlugin {
  constructor(id, manifest, api) {
    super(id, manifest, api);
    this._windowManager = null;
    this._trayManager = null;
    this._windowState = null;
    this._config = null;
    this._logger = null;
  }

  async onActivate() {
    try {
      // Get logger (fallback to console)
      try {
        const infraDomain = this.api.getDomain('infrastructure');
        this._logger = infraDomain ? infraDomain.getLogger().child('shell') : console;
      } catch (e) {
        this._logger = console;
      }

      this._logger.info('Shell Domain activating...');

      // Get configuration
      const configDomain = this.api.getDomain('configuration');
      if (!configDomain) {
        throw new Error('Configuration domain not available. Shell domain depends on configuration.');
      }
      this._config = configDomain.getAppConfiguration();

      // Import and initialize services
      try {
        const WindowManager = require('./services/WindowManager');
        const TrayManager = require('./services/TrayManager');
        const WindowState = require('./models/WindowState');

        this._windowState = new WindowState(this._config, this._logger);
        this._windowManager = new WindowManager(this._config, this._windowState, this._logger);
        this._trayManager = new TrayManager(this._config, this._logger);

        this.api.emit('shell.activated', {
          status: 'ready',
          services: { windowManager: true, trayManager: true, windowState: true },
          timestamp: Date.now()
        });
        this._logger.info('Shell Domain activated successfully');
      } catch (error) {
        // Services not yet implemented - partial activation
        this._logger.warn('Shell services pending implementation', { error: error.message });
        this.api.emit('shell.activated', {
          status: 'partial',
          message: 'Services pending implementation',
          timestamp: Date.now()
        });
      }
    } catch (error) {
      (this._logger || console).error('Failed to activate Shell Domain', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async onDeactivate() {
    const logger = this._logger || console;
    try {
      logger.info('Shell Domain deactivating...');

      // Save window state
      if (this._windowManager && this._windowState) {
        const windows = this._windowManager.getAllWindows();
        for (const [windowId, window] of windows) {
          if (!window.isDestroyed()) {
            this._windowState.saveWindowState(windowId, {
              bounds: window.getBounds(),
              isMaximized: window.isMaximized(),
              isFullScreen: window.isFullScreen()
            });
          }
        }
      }

      // Cleanup tray
      if (this._trayManager) {
        this._trayManager.destroy();
      }

      this.api.emit('shell.deactivated', { timestamp: Date.now() });
      logger.info('Shell Domain deactivated successfully');
    } catch (error) {
      logger.error('Error during Shell Domain deactivation', { error: error.message });
      throw error;
    }
  }

  async onDestroy() {
    const logger = this._logger || console;
    try {
      logger.info('Shell Domain cleaning up...');

      // Close all windows
      if (this._windowManager) {
        const windows = this._windowManager.getAllWindows();
        for (const [, window] of windows) {
          if (!window.isDestroyed()) {
            window.close();
          }
        }
      }

      // Clear references
      this._windowManager = null;
      this._trayManager = null;
      this._windowState = null;
      this._config = null;
      this._logger = null;

      logger.info('Shell Domain destroyed');
    } catch (error) {
      console.error('Error during Shell Domain cleanup:', error);
    }
  }

  getWindowManager() {
    if (!this._windowManager) {
      throw new Error('WindowManager not initialized. Domain must be activated first or services not yet implemented.');
    }
    return this._windowManager;
  }

  getTrayManager() {
    if (!this._trayManager) {
      throw new Error('TrayManager not initialized. Domain must be activated first or services not yet implemented.');
    }
    return this._trayManager;
  }

  getWindowState() {
    if (!this._windowState) {
      throw new Error('WindowState not initialized. Domain must be activated first or services not yet implemented.');
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

  isHealthy() {
    return !!(this._windowManager && this._trayManager && this._windowState);
  }

  // Convenience methods delegating to services
  createWindow(options) {
    if (!this._windowManager) throw new Error('WindowManager not initialized');
    return this._windowManager.createWindow(options);
  }

  updateTrayIcon(iconPath) {
    if (!this._trayManager) throw new Error('TrayManager not initialized');
    this._trayManager.setIcon(iconPath);
  }

  setTrayMenu(menu) {
    if (!this._trayManager) throw new Error('TrayManager not initialized');
    this._trayManager.setMenu(menu);
  }

  getStats() {
    const stats = {
      healthy: this.isHealthy(),
      services: {
        windowManager: !!this._windowManager,
        trayManager: !!this._trayManager,
        windowState: !!this._windowState
      }
    };

    if (this._windowManager) {
      const windows = this._windowManager.getAllWindows();
      stats.windows = { count: windows.size, ids: Array.from(windows.keys()) };
    }

    if (this._trayManager) {
      stats.tray = { initialized: this._trayManager.isInitialized() };
    }

    if (this._windowState) {
      stats.windowState = { trackedWindows: this._windowState.getTrackedWindowCount() };
    }

    return stats;
  }
}

module.exports = ShellDomain;
