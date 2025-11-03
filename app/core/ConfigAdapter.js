/**
 * ConfigAdapter - Wraps a plain config object to provide get/set methods
 *
 * This adapter allows the Application architecture to work with the existing
 * plain config object from AppConfiguration by providing the get/set interface
 * expected by PluginAPI.
 */
class ConfigAdapter {
  /**
   * @param {Object} config - Plain configuration object
   */
  constructor(config) {
    this._config = config;
  }

  /**
   * Get a configuration value
   * @param {string} key - Configuration key (supports dot notation)
   * @returns {*} Configuration value
   */
  get(key) {
    if (!key) {
      return this._config;
    }

    // Support dot notation (e.g., 'cacheManagement.enabled')
    const keys = key.split('.');
    let value = this._config;

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return undefined;
      }
    }

    return value;
  }

  /**
   * Set a configuration value
   * @param {string} key - Configuration key (supports dot notation)
   * @param {*} value - Value to set
   */
  set(key, value) {
    if (!key) {
      throw new Error('Config key is required');
    }

    // Support dot notation
    const keys = key.split('.');
    const lastKey = keys.pop();
    let target = this._config;

    // Navigate to parent object
    for (const k of keys) {
      if (!(k in target)) {
        target[k] = {};
      }
      target = target[k];
    }

    // Set value
    target[lastKey] = value;
  }

  /**
   * Check if a configuration key exists
   * @param {string} key - Configuration key
   * @returns {boolean} True if key exists
   */
  has(key) {
    return this.get(key) !== undefined;
  }

  /**
   * Get the raw configuration object
   * @returns {Object} Raw config object
   */
  getRaw() {
    return this._config;
  }
}

module.exports = ConfigAdapter;
