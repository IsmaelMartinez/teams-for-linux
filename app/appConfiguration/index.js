const Store = require("electron-store");

// WeakMap-based private fields pattern provides true privacy without relying on newer
// JavaScript private field syntax (#property). This ensures compatibility with older
// Node.js versions while preventing external access to internal state.
let _AppConfiguration_configPath = new WeakMap();
let _AppConfiguration_startupConfig = new WeakMap();
let _AppConfiguration_legacyConfigStore = new WeakMap();
let _AppConfiguration_settingsStore = new WeakMap();

/**
 * Manages application configuration including startup settings and persistent stores.
 * Uses WeakMaps for true private fields to ensure configuration data cannot be accessed
 * or modified externally, providing a secure configuration management layer.
 */
class AppConfiguration {
  /**
   * @param {string} configPath - Path to the configuration directory
   * @param {string} appVersion - Current application version for config compatibility
   */
  constructor(configPath, appVersion) {
    _AppConfiguration_configPath.set(this, configPath);
    _AppConfiguration_startupConfig.set(
      this,
      require("../config")(configPath, appVersion)
    );
    _AppConfiguration_legacyConfigStore.set(
      this,
      new Store({
        name: "config",
        clearInvalidConfig: true,
      })
    );
    _AppConfiguration_settingsStore.set(
      this,
      new Store({
        name: "settings",
        clearInvalidConfig: true,
      })
    );
  }

  get configPath() {
    return _AppConfiguration_configPath.get(this);
  }

  get startupConfig() {
    return _AppConfiguration_startupConfig.get(this);
  }

  get legacyConfigStore() {
    return _AppConfiguration_legacyConfigStore.get(this);
  }

  get settingsStore() {
    return _AppConfiguration_settingsStore.get(this);
  }

  /**
   * Get token refresh configuration
   * @returns {object} Token refresh configuration with defaults
   */
  getTokenRefreshConfig() {
    const startupConfig = _AppConfiguration_startupConfig.get(this);
    const tokenRefresh = startupConfig?.tokenRefresh || {};

    return {
      enabled: tokenRefresh.enabled !== undefined ? tokenRefresh.enabled : true,
      refreshIntervalMinutes: tokenRefresh.refreshIntervalMinutes || 5,
      // Keep backwards compatibility
      refreshIntervalHours: tokenRefresh.refreshIntervalHours || (tokenRefresh.refreshIntervalMinutes ? tokenRefresh.refreshIntervalMinutes / 60 : 1)
    };
  }
}

module.exports = { AppConfiguration };
