const BasePlugin = require('../../plugins/BasePlugin');

/**
 * ConfigurationDomain - Application configuration and state management
 *
 * Provides configuration and state services for the application:
 * - AppConfiguration: Persistent configuration storage (electron-store)
 * - StateManager: Runtime application state management (replaces global variables)
 *
 * This domain implements the Configuration Domain from ADR-004,
 * managing all configuration persistence and runtime state across the application.
 *
 * Replaces global variables:
 * - userStatus, idleTimeUserStatus (user presence state)
 * - screenSharingActive, currentScreenShareSourceId (screen sharing state)
 */
class ConfigurationDomain extends BasePlugin {
  /**
   * @param {string} id - Domain identifier
   * @param {Object} manifest - Domain manifest
   * @param {Object} api - Plugin API instance
   */
  constructor(id, manifest, api) {
    super(id, manifest, api);

    // Service instances (initialized during activation)
    this._appConfiguration = null;
    this._stateManager = null;
  }

  /**
   * Activate the configuration domain
   * Initializes configuration storage and state management
   * @returns {Promise<void>}
   */
  async onActivate() {
    try {
      // Import service modules
      const { AppConfiguration } = require('../../appConfiguration');
      const StateManager = require('./StateManager');

      // Get config from API
      const config = this.api.getConfig();
      const { app } = require('electron');

      // Initialize AppConfiguration
      const configPath = app.getPath('userData');
      const appVersion = app.getVersion();
      this._appConfiguration = new AppConfiguration(configPath, appVersion);

      // Get logger from Infrastructure domain if available
      let logger = console;
      try {
        const infraDomain = this.api.getDomain('infrastructure');
        if (infraDomain) {
          logger = infraDomain.getLogger().child('configuration');
        }
      } catch (e) {
        // Infrastructure domain not available, use console
      }

      logger.info('Configuration Domain activating...', {
        configPath,
        appVersion
      });

      // Initialize StateManager
      this._stateManager = new StateManager();
      logger.info('StateManager initialized');

      // Emit domain activation event
      this.api.emit('configuration.activated', {
        configPath,
        appVersion
      });

      logger.info('Configuration Domain activated successfully');
    } catch (error) {
      const logger = console;
      logger.error('Failed to activate Configuration Domain', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Deactivate the configuration domain
   * Saves state and configuration before shutdown
   * @returns {Promise<void>}
   */
  async onDeactivate() {
    // Get logger
    let logger = console;
    try {
      const infraDomain = this.api.getDomain('infrastructure');
      if (infraDomain) {
        logger = infraDomain.getLogger().child('configuration');
      }
    } catch (e) {
      // Use console if infrastructure domain not available
    }

    try {
      logger.info('Configuration Domain deactivating...');

      // Save state snapshot before deactivation
      if (this._stateManager) {
        const snapshot = this._stateManager.getSnapshot();
        const stats = this._stateManager.getStats();
        logger.info('StateManager snapshot captured', stats);

        // Optionally persist critical state to electron-store
        if (this._appConfiguration && snapshot.userStatus !== -1) {
          this._appConfiguration.settingsStore.set('lastUserStatus', snapshot.userStatus);
        }
      }

      // Emit deactivation event
      this.api.emit('configuration.deactivated', {
        timestamp: Date.now()
      });

      logger.info('Configuration Domain deactivated successfully');
    } catch (error) {
      logger.error('Error during Configuration Domain deactivation', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Cleanup domain resources
   * @returns {Promise<void>}
   */
  async onDestroy() {
    const logger = console;

    try {
      logger.info('Configuration Domain cleaning up...');

      // Reset state manager to defaults
      if (this._stateManager) {
        this._stateManager.reset();
      }

      // Clear service references
      this._appConfiguration = null;
      this._stateManager = null;

      logger.info('Configuration Domain destroyed');
    } catch (error) {
      console.error('Error during Configuration Domain cleanup:', error);
    }
  }

  /**
   * Get the AppConfiguration service
   * @returns {Object} AppConfiguration instance
   */
  getAppConfiguration() {
    if (!this._appConfiguration) {
      throw new Error('AppConfiguration not initialized. Domain must be activated first.');
    }
    return this._appConfiguration;
  }

  /**
   * Get the StateManager service
   * @returns {Object} StateManager instance
   */
  getStateManager() {
    if (!this._stateManager) {
      throw new Error('StateManager not initialized. Domain must be activated first.');
    }
    return this._stateManager;
  }

  /**
   * Get all configuration services
   * @returns {Object} Object containing all services
   */
  getServices() {
    return {
      appConfiguration: this._appConfiguration,
      stateManager: this._stateManager
    };
  }

  /**
   * Check if all services are operational
   * @returns {boolean} True if all services are ready
   */
  isHealthy() {
    return !!(
      this._appConfiguration &&
      this._stateManager
    );
  }

  /**
   * Get configuration value by key path
   * Convenience method to access configuration values
   * @param {string} keyPath - Dot-separated key path (e.g., 'settings.theme')
   * @param {*} defaultValue - Default value if key not found
   * @returns {*} Configuration value
   */
  getConfig(keyPath, defaultValue = undefined) {
    if (!this._appConfiguration) {
      throw new Error('AppConfiguration not initialized');
    }

    const keys = keyPath.split('.');
    const store = keys[0] === 'settings'
      ? this._appConfiguration.settingsStore
      : this._appConfiguration.legacyConfigStore;

    const actualKeyPath = keys.length > 1 ? keys.slice(1).join('.') : keys[0];
    return store.get(actualKeyPath, defaultValue);
  }

  /**
   * Set configuration value by key path
   * Convenience method to update configuration values
   * @param {string} keyPath - Dot-separated key path (e.g., 'settings.theme')
   * @param {*} value - Value to set
   */
  setConfig(keyPath, value) {
    if (!this._appConfiguration) {
      throw new Error('AppConfiguration not initialized');
    }

    const keys = keyPath.split('.');
    const store = keys[0] === 'settings'
      ? this._appConfiguration.settingsStore
      : this._appConfiguration.legacyConfigStore;

    const actualKeyPath = keys.length > 1 ? keys.slice(1).join('.') : keys[0];
    store.set(actualKeyPath, value);

    // Emit configuration change event
    this.api.emit('configuration.changed', {
      keyPath,
      value,
      timestamp: Date.now()
    });
  }

  /**
   * Get current application state snapshot
   * @returns {Object} State snapshot
   */
  getStateSnapshot() {
    if (!this._stateManager) {
      throw new Error('StateManager not initialized');
    }
    return this._stateManager.getSnapshot();
  }

  /**
   * Restore application state from snapshot
   * @param {Object} snapshot - State snapshot to restore
   */
  restoreStateSnapshot(snapshot) {
    if (!this._stateManager) {
      throw new Error('StateManager not initialized');
    }
    this._stateManager.restoreSnapshot(snapshot);
  }

  /**
   * Get domain statistics
   * @returns {Object} Domain statistics including state and config info
   */
  getStats() {
    const stats = {
      healthy: this.isHealthy(),
      services: {
        appConfiguration: !!this._appConfiguration,
        stateManager: !!this._stateManager
      }
    };

    if (this._appConfiguration) {
      stats.config = {
        configPath: this._appConfiguration.configPath
      };
    }

    if (this._stateManager) {
      stats.state = this._stateManager.getStats();
    }

    return stats;
  }
}

module.exports = ConfigurationDomain;
