/**
 * PluginAPI - Provides access to core services for plugins
 * All internal plugins are trusted and have full access to services
 */
class PluginAPI {
  /**
   * @param {Object} services - Core services
   * @param {Object} services.eventBus - Event bus instance
   * @param {Object} services.config - Configuration instance
   * @param {Object} services.logger - Logger instance
   */
  constructor(services) {
    this._services = services;
    this._eventSubscriptions = [];
  }

  /**
   * Subscribe to events
   * @param {string} event - Event name
   * @param {Function} handler - Event handler
   * @returns {Function} Unsubscribe function
   */
  on(event, handler) {
    const unsubscribe = this._services.eventBus.on(event, handler);
    this._eventSubscriptions.push(unsubscribe);
    return unsubscribe;
  }

  /**
   * Emit events
   * @param {string} event - Event name
   * @param {*} data - Event data
   */
  emit(event, data) {
    this._services.eventBus.emit(event, data);
  }

  /**
   * Get configuration
   * @param {string} key - Config key
   * @returns {*} Configuration value
   */
  getConfig(key) {
    return this._services.config.get(key);
  }

  /**
   * Set configuration
   * @param {string} key - Config key
   * @param {*} value - Config value
   */
  setConfig(key, value) {
    this._services.config.set(key, value);
  }

  /**
   * Log message
   * @param {string} level - Log level (debug, info, warn, error)
   * @param {string} message - Log message
   * @param {*} data - Additional data
   */
  log(level, message, data) {
    if (this._services.logger && typeof this._services.logger[level] === 'function') {
      this._services.logger[level](message, data);
    } else {
      console[level](message, data);
    }
  }

  /**
   * Get a loaded domain by ID (for inter-domain communication)
   * @param {string} domainId - Domain identifier
   * @returns {Object|null} Domain instance or null if not loaded
   */
  getDomain(domainId) {
    if (!this._services.application) {
      return null;
    }
    return this._services.application.getDomain(domainId);
  }

  /**
   * Cleanup all subscriptions
   */
  cleanup() {
    this._eventSubscriptions.forEach(unsubscribe => unsubscribe());
    this._eventSubscriptions = [];
  }
}

module.exports = PluginAPI;
