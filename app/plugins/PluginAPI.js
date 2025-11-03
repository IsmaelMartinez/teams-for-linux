/**
 * PluginAPI - Provides controlled access to core services for plugins
 * Implements permission-based access control
 */
class PluginAPI {
  /**
   * @param {Object} services - Core services
   * @param {Object} services.eventBus - Event bus instance
   * @param {Object} services.config - Configuration instance
   * @param {Object} services.logger - Logger instance
   * @param {Array<string>} permissions - Plugin permissions
   */
  constructor(services, permissions = []) {
    this._services = services;
    this._permissions = new Set(permissions);
    this._eventSubscriptions = [];
  }

  /**
   * Check if plugin has permission
   * @param {string} permission - Permission to check
   * @returns {boolean} Has permission
   * @private
   */
  _hasPermission(permission) {
    return this._permissions.has('*') || this._permissions.has(permission);
  }

  /**
   * Require permission or throw error
   * @param {string} permission - Required permission
   * @private
   */
  _requirePermission(permission) {
    if (!this._hasPermission(permission)) {
      throw new Error(`Permission denied: ${permission}`);
    }
  }

  /**
   * Subscribe to events (requires 'events:subscribe' permission)
   * @param {string} event - Event name
   * @param {Function} handler - Event handler
   * @returns {Function} Unsubscribe function
   */
  on(event, handler) {
    this._requirePermission('events:subscribe');

    const unsubscribe = this._services.eventBus.on(event, handler);
    this._eventSubscriptions.push(unsubscribe);

    return unsubscribe;
  }

  /**
   * Emit events (requires 'events:emit' permission)
   * @param {string} event - Event name
   * @param {*} data - Event data
   */
  emit(event, data) {
    this._requirePermission('events:emit');
    this._services.eventBus.emit(event, data);
  }

  /**
   * Get configuration (requires 'config:read' permission)
   * @param {string} key - Config key
   * @returns {*} Configuration value
   */
  getConfig(key) {
    this._requirePermission('config:read');
    return this._services.config.get(key);
  }

  /**
   * Set configuration (requires 'config:write' permission)
   * @param {string} key - Config key
   * @param {*} value - Config value
   */
  setConfig(key, value) {
    this._requirePermission('config:write');
    this._services.config.set(key, value);
  }

  /**
   * Log message (requires 'logging' permission)
   * @param {string} level - Log level (debug, info, warn, error)
   * @param {string} message - Log message
   * @param {*} data - Additional data
   */
  log(level, message, data) {
    this._requirePermission('logging');

    if (this._services.logger && typeof this._services.logger[level] === 'function') {
      this._services.logger[level](message, data);
    } else {
      console[level](message, data);
    }
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
