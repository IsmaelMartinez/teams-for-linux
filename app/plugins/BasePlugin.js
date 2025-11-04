/**
 * BasePlugin - Abstract base class for all plugins
 * Defines lifecycle hooks and plugin interface
 */
class BasePlugin {
  /**
   * @param {string} id - Plugin unique identifier
   * @param {Object} manifest - Plugin manifest
   * @param {Object} api - Plugin API instance
   */
  constructor(id, manifest, api) {
    if (new.target === BasePlugin) {
      throw new TypeError('Cannot instantiate abstract class BasePlugin');
    }

    this._id = id;
    this._manifest = manifest;
    this._api = api;
    this._active = false;
  }

  /**
   * Get plugin ID
   * @returns {string} Plugin ID
   */
  get id() {
    return this._id;
  }

  /**
   * Get plugin manifest
   * @returns {Object} Plugin manifest
   */
  get manifest() {
    return this._manifest;
  }

  /**
   * Check if plugin is active
   * @returns {boolean} Active status
   */
  get isActive() {
    return this._active;
  }

  /**
   * Get plugin API
   * @returns {Object} Plugin API
   */
  get api() {
    return this._api;
  }

  /**
   * Lifecycle hook: Called when plugin is activated
   * Must be implemented by subclasses
   * @abstract
   * @returns {Promise<void>}
   */
  async onActivate() {
    throw new Error('onActivate() must be implemented by subclass');
  }

  /**
   * Lifecycle hook: Called when plugin is deactivated
   * Must be implemented by subclasses
   * @abstract
   * @returns {Promise<void>}
   */
  async onDeactivate() {
    throw new Error('onDeactivate() must be implemented by subclass');
  }

  /**
   * Lifecycle hook: Called when plugin is destroyed
   * Optional - default implementation cleans up API
   * @returns {Promise<void>}
   */
  async onDestroy() {
    if (this._api && typeof this._api.cleanup === 'function') {
      this._api.cleanup();
    }
  }

  /**
   * Activate the plugin
   * @returns {Promise<void>}
   */
  async activate() {
    if (this._active) {
      throw new Error(`Plugin ${this._id} is already active`);
    }

    await this.onActivate();
    this._active = true;
  }

  /**
   * Deactivate the plugin
   * @returns {Promise<void>}
   */
  async deactivate() {
    if (!this._active) {
      throw new Error(`Plugin ${this._id} is not active`);
    }

    await this.onDeactivate();
    this._active = false;
  }

  /**
   * Destroy the plugin (cleanup)
   * @returns {Promise<void>}
   */
  async destroy() {
    if (this._active) {
      await this.deactivate();
    }

    await this.onDestroy();
  }
}

module.exports = BasePlugin;
