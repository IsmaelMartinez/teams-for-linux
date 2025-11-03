const BasePlugin = require('../plugins/BasePlugin');
const PluginAPI = require('../plugins/PluginAPI');

/**
 * PluginManager - Manages plugin lifecycle and dependencies
 * Handles loading, activation, deactivation, and dependency resolution
 */
class PluginManager {
  /**
   * @param {Object} services - Core services to provide to plugins
   */
  constructor(services) {
    this._services = services;
    this._plugins = new Map();
    this._activePlugins = new Set();
    this._pluginState = new Map(); // For persistence
  }

  /**
   * Load a plugin
   * @param {string} id - Plugin unique identifier
   * @param {Function} PluginClass - Plugin class constructor
   * @param {Object} manifest - Plugin manifest
   * @returns {Promise<void>}
   */
  async loadPlugin(id, PluginClass, manifest) {
    if (this._plugins.has(id)) {
      throw new Error(`Plugin ${id} is already loaded`);
    }

    // Validate manifest
    this._validateManifest(manifest);

    // Create plugin API with permissions
    const permissions = manifest.permissions || [];
    const api = new PluginAPI(this._services, permissions);

    // Instantiate plugin
    const plugin = new PluginClass(id, manifest, api);

    // Verify it extends BasePlugin
    if (!(plugin instanceof BasePlugin)) {
      throw new Error(`Plugin ${id} must extend BasePlugin`);
    }

    this._plugins.set(id, plugin);

    // Emit event
    this._services.eventBus.emit('plugin.loaded', { id, manifest });
  }

  /**
   * Activate a plugin
   * @param {string} id - Plugin ID
   * @returns {Promise<void>}
   */
  async activatePlugin(id) {
    const plugin = this._plugins.get(id);
    if (!plugin) {
      throw new Error(`Plugin ${id} is not loaded`);
    }

    if (this._activePlugins.has(id)) {
      throw new Error(`Plugin ${id} is already active`);
    }

    // Check dependencies
    const deps = plugin.manifest.dependencies || [];
    await this._checkDependencies(deps);

    // Activate plugin
    await plugin.activate();
    this._activePlugins.add(id);

    // Update state
    this._pluginState.set(id, { active: true, activatedAt: Date.now() });

    // Emit event
    this._services.eventBus.emit('plugin.activated', { id });
  }

  /**
   * Deactivate a plugin
   * @param {string} id - Plugin ID
   * @returns {Promise<void>}
   */
  async deactivatePlugin(id) {
    const plugin = this._plugins.get(id);
    if (!plugin) {
      throw new Error(`Plugin ${id} is not loaded`);
    }

    if (!this._activePlugins.has(id)) {
      throw new Error(`Plugin ${id} is not active`);
    }

    // Deactivate plugin
    await plugin.deactivate();
    this._activePlugins.delete(id);

    // Update state
    this._pluginState.set(id, { active: false, deactivatedAt: Date.now() });

    // Emit event
    this._services.eventBus.emit('plugin.deactivated', { id });
  }

  /**
   * Unload a plugin (deactivate and remove)
   * @param {string} id - Plugin ID
   * @returns {Promise<void>}
   */
  async unloadPlugin(id) {
    const plugin = this._plugins.get(id);
    if (!plugin) {
      throw new Error(`Plugin ${id} is not loaded`);
    }

    // Deactivate if active
    if (this._activePlugins.has(id)) {
      await this.deactivatePlugin(id);
    }

    // Destroy plugin
    await plugin.destroy();

    // Remove from registry
    this._plugins.delete(id);
    this._pluginState.delete(id);

    // Emit event
    this._services.eventBus.emit('plugin.unloaded', { id });
  }

  /**
   * Get plugin by ID
   * @param {string} id - Plugin ID
   * @returns {BasePlugin|undefined} Plugin instance
   */
  getPlugin(id) {
    return this._plugins.get(id);
  }

  /**
   * Get all loaded plugins
   * @returns {Array<BasePlugin>} Array of plugins
   */
  getPlugins() {
    return Array.from(this._plugins.values());
  }

  /**
   * Get all active plugins
   * @returns {Array<BasePlugin>} Array of active plugins
   */
  getActivePlugins() {
    return Array.from(this._activePlugins)
      .map(id => this._plugins.get(id))
      .filter(Boolean);
  }

  /**
   * Validate plugin manifest
   * @param {Object} manifest - Plugin manifest
   * @private
   */
  _validateManifest(manifest) {
    const required = ['name', 'version'];
    const missing = required.filter(field => !manifest[field]);

    if (missing.length > 0) {
      throw new Error(`Invalid manifest: missing fields ${missing.join(', ')}`);
    }

    // Validate version format
    const versionRegex = /^\d+\.\d+\.\d+$/;
    if (!versionRegex.test(manifest.version)) {
      throw new Error(`Invalid version format: ${manifest.version}`);
    }
  }

  /**
   * Check plugin dependencies
   * @param {Array<string>} dependencies - Array of dependency plugin IDs
   * @returns {Promise<void>}
   * @private
   */
  async _checkDependencies(dependencies) {
    for (const depId of dependencies) {
      if (!this._activePlugins.has(depId)) {
        // Try to activate dependency
        if (this._plugins.has(depId)) {
          await this.activatePlugin(depId);
        } else {
          throw new Error(`Missing dependency: ${depId}`);
        }
      }
    }
  }

  /**
   * Get plugin state (for persistence)
   * @returns {Object} Plugin state
   */
  getState() {
    const state = {};
    this._pluginState.forEach((value, key) => {
      state[key] = value;
    });
    return state;
  }

  /**
   * Restore plugin state (from persistence)
   * @param {Object} state - Plugin state
   */
  restoreState(state) {
    Object.entries(state).forEach(([key, value]) => {
      this._pluginState.set(key, value);
    });
  }
}

module.exports = PluginManager;
