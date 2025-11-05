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

  // ============================================================================
  // COMMAND LINE SWITCHES & ELECTRON FLAGS (Phase 2 Migration)
  // Static methods - can be called before domain activation
  // ============================================================================

  /**
   * Initialize early command line switches (before config load)
   * These switches must be set before the app is ready
   * @static
   * @returns {void}
   */
  static initializeEarlyCommandSwitches() {
    const { app } = require('electron');

    app.commandLine.appendSwitch("try-supported-channel-layouts");

    // Disabled features
    const disabledFeatures = app.commandLine.hasSwitch("disable-features")
      ? app.commandLine.getSwitchValue("disable-features").split(",")
      : ["HardwareMediaKeyHandling"];

    // Prevent hardware media keys from interfering with Teams' built-in media controls
    // This ensures Teams' own play/pause buttons work correctly instead of conflicting
    // with system-level media key handling
    if (!disabledFeatures.includes("HardwareMediaKeyHandling"))
      disabledFeatures.push("HardwareMediaKeyHandling");

    app.commandLine.appendSwitch("disable-features", disabledFeatures.join(","));
  }

  /**
   * Initialize command line switches after config is loaded
   * Applies configuration-dependent switches (Wayland, GPU, proxy, etc.)
   * @static
   * @param {Object} config - Application configuration
   * @returns {void}
   */
  static initializeCommandSwitches(config) {
    const { app } = require('electron');

    // Wayland-specific optimization for Linux desktop environments
    // PipeWire provides better screen sharing and audio capture on Wayland
    if (process.env.XDG_SESSION_TYPE === "wayland") {
      // Disable GPU by default on Wayland unless user explicitly configured it
      // This prevents blank window issues while allowing power users to override
      if (config.disableGpuExplicitlySet) {
        console.info(`Running under Wayland, respecting user's disableGpu setting: ${config.disableGpu}`);
      } else {
        console.info("Running under Wayland, disabling GPU composition (default behavior)...");
        config.disableGpu = true;
      }

      // Enable PipeWire for screen sharing on Wayland
      console.info("Enabling PipeWire for screen sharing...");
      const features = app.commandLine.hasSwitch("enable-features")
        ? app.commandLine.getSwitchValue("enable-features").split(",")
        : [];
      if (!features.includes("WebRTCPipeWireCapturer"))
        features.push("WebRTCPipeWireCapturer");

      app.commandLine.appendSwitch("enable-features", features.join(","));
      app.commandLine.appendSwitch("use-fake-ui-for-media-stream");
    }

    // Proxy
    if (config.proxyServer) {
      app.commandLine.appendSwitch("proxy-server", config.proxyServer);
    }

    if (config.class) {
      console.info("Setting WM_CLASS property to custom value " + config.class);
      app.setName(config.class);
    }

    app.commandLine.appendSwitch(
      "auth-server-whitelist",
      config.authServerWhitelist
    );

    // GPU
    if (config.disableGpu) {
      console.info("Disabling GPU support...");
      app.commandLine.appendSwitch("disable-gpu");
      app.commandLine.appendSwitch("disable-gpu-compositing");
      app.commandLine.appendSwitch("disable-software-rasterizer");
      app.disableHardwareAcceleration();
    }

    ConfigurationDomain.applyElectronFlags(config);
  }

  /**
   * Apply custom Electron CLI flags from configuration
   * @static
   * @param {Object} config - Application configuration
   * @returns {void}
   */
  static applyElectronFlags(config) {
    const { app } = require('electron');

    if (Array.isArray(config.electronCLIFlags)) {
      for (const flag of config.electronCLIFlags) {
        if (typeof flag === "string") {
          console.debug(`Adding electron CLI flag '${flag}'`);
          app.commandLine.appendSwitch(flag);
        } else if (Array.isArray(flag) && typeof flag[0] === "string") {
          const hasValidValue = flag[1] !== undefined &&
                                 typeof flag[1] !== "object" &&
                                 typeof flag[1] !== "function";
          if (hasValidValue) {
            console.debug(
              `Adding electron CLI flag '${flag[0]}' with value '${flag[1]}'`
            );
            app.commandLine.appendSwitch(flag[0], flag[1]);
          } else {
            console.debug(`Adding electron CLI flag '${flag[0]}'`);
            app.commandLine.appendSwitch(flag[0]);
          }
        }
      }
    }
  }

  // ============================================================================
  // PARTITION MANAGEMENT (Phase 2.2 & 2.3 Migration)
  // Instance methods - require appConfiguration to be initialized
  // ============================================================================

  /**
   * Get all partitions from storage
   * @returns {Array} Array of partition objects
   */
  getPartitions() {
    if (!this._appConfiguration) {
      throw new Error('AppConfiguration not initialized');
    }
    return this._appConfiguration.settingsStore.get("app.partitions") || [];
  }

  /**
   * Get a specific partition by name
   * @param {string} name - Partition name
   * @returns {Object|undefined} Partition object or undefined if not found
   */
  getPartition(name) {
    const partitions = this.getPartitions();
    return partitions.find((p) => p.name === name);
  }

  /**
   * Save a partition (create or update)
   * @param {Object} partition - Partition object with name property
   */
  savePartition(partition) {
    if (!this._appConfiguration) {
      throw new Error('AppConfiguration not initialized');
    }

    const partitions = this.getPartitions();
    const partitionIndex = partitions.findIndex((p) => p.name === partition.name);

    if (partitionIndex >= 0) {
      partitions[partitionIndex] = partition;
    } else {
      partitions.push(partition);
    }

    this._appConfiguration.settingsStore.set("app.partitions", partitions);

    // Emit event for partition changes
    this.api.emit('configuration.partition.saved', {
      partition,
      timestamp: Date.now()
    });
  }

  /**
   * Get zoom level for a partition
   * @param {string} partitionName - Partition name
   * @returns {Promise<number>} Zoom level (0 if not set)
   */
  async getZoomLevel(partitionName) {
    const partition = this.getPartition(partitionName) || {};
    return partition.zoomLevel ? partition.zoomLevel : 0;
  }

  /**
   * Save zoom level for a partition
   * @param {Object} args - Arguments object with partition and zoomLevel
   * @param {string} args.partition - Partition name
   * @param {number} args.zoomLevel - Zoom level to save
   * @returns {Promise<void>}
   */
  async saveZoomLevel(args) {
    let partition = this.getPartition(args.partition) || {};
    partition.name = args.partition;
    partition.zoomLevel = args.zoomLevel;
    this.savePartition(partition);
  }
}

module.exports = ConfigurationDomain;
