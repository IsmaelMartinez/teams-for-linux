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
    this._services = new WeakMap();
    this._servicesData = {
      appConfiguration: null,
      stateManager: null
    };
    this._services.set(this, this._servicesData);
  }

  /**
   * Get services data from WeakMap
   * @private
   */
  _getServices() {
    return this._services.get(this);
  }

  /**
   * Activate the configuration domain
   * Initializes configuration storage and state management
   * @returns {Promise<void>}
   */
  async onActivate() {
    const services = this._getServices();

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
      services.appConfiguration = new AppConfiguration(configPath, appVersion);

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
      services.stateManager = new StateManager();
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
    const services = this._getServices();

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
      if (services.stateManager) {
        const snapshot = services.stateManager.getSnapshot();
        const stats = services.stateManager.getStats();
        logger.info('StateManager snapshot captured', stats);

        // Optionally persist critical state to electron-store
        if (services.appConfiguration && snapshot.userStatus !== -1) {
          services.appConfiguration.settingsStore.set('lastUserStatus', snapshot.userStatus);
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
    const services = this._getServices();
    const logger = console;

    try {
      logger.info('Configuration Domain cleaning up...');

      // Reset state manager to defaults
      if (services.stateManager) {
        services.stateManager.reset();
      }

      // Clear service references
      services.appConfiguration = null;
      services.stateManager = null;

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
    const services = this._getServices();
    if (!services.appConfiguration) {
      throw new Error('AppConfiguration not initialized. Domain must be activated first.');
    }
    return services.appConfiguration;
  }

  /**
   * Get the StateManager service
   * @returns {Object} StateManager instance
   */
  getStateManager() {
    const services = this._getServices();
    if (!services.stateManager) {
      throw new Error('StateManager not initialized. Domain must be activated first.');
    }
    return services.stateManager;
  }

  /**
   * Get all configuration services
   * @returns {Object} Object containing all services
   */
  getServices() {
    const services = this._getServices();
    return {
      appConfiguration: services.appConfiguration,
      stateManager: services.stateManager
    };
  }

  /**
   * Check if all services are operational
   * @returns {boolean} True if all services are ready
   */
  isHealthy() {
    const services = this._getServices();
    return !!(
      services.appConfiguration &&
      services.stateManager
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
    const services = this._getServices();
    if (!services.appConfiguration) {
      throw new Error('AppConfiguration not initialized');
    }

    const keys = keyPath.split('.');
    const store = keys[0] === 'settings'
      ? services.appConfiguration.settingsStore
      : services.appConfiguration.legacyConfigStore;

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
    const services = this._getServices();
    if (!services.appConfiguration) {
      throw new Error('AppConfiguration not initialized');
    }

    const keys = keyPath.split('.');
    const store = keys[0] === 'settings'
      ? services.appConfiguration.settingsStore
      : services.appConfiguration.legacyConfigStore;

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
    const services = this._getServices();
    if (!services.stateManager) {
      throw new Error('StateManager not initialized');
    }
    return services.stateManager.getSnapshot();
  }

  /**
   * Restore application state from snapshot
   * @param {Object} snapshot - State snapshot to restore
   */
  restoreStateSnapshot(snapshot) {
    const services = this._getServices();
    if (!services.stateManager) {
      throw new Error('StateManager not initialized');
    }
    services.stateManager.restoreSnapshot(snapshot);
  }

  /**
   * Get domain statistics
   * @returns {Object} Domain statistics including state and config info
   */
  getStats() {
    const services = this._getServices();

    const stats = {
      healthy: this.isHealthy(),
      services: {
        appConfiguration: !!services.appConfiguration,
        stateManager: !!services.stateManager
      }
    };

    if (services.appConfiguration) {
      stats.config = {
        configPath: services.appConfiguration.configPath
      };
    }

    if (services.stateManager) {
      stats.state = services.stateManager.getStats();
    }

    return stats;
  }
}

module.exports = ConfigurationDomain;
