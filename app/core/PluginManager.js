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
    // Validate required fields (minimum for backward compatibility)
    const required = ['name', 'version'];
    const missing = required.filter(field => !manifest[field]);

    if (missing.length > 0) {
      throw new Error(`Invalid manifest: missing required fields ${missing.join(', ')}`);
    }

    // Validate version format (semver)
    const versionRegex = /^\d+\.\d+\.\d+$/;
    if (!versionRegex.test(manifest.version)) {
      throw new Error(`Invalid version format: ${manifest.version}. Expected semver format (e.g., 1.0.0)`);
    }

    // Validate id format if present (recommended)
    if (manifest.id !== undefined) {
      if (typeof manifest.id !== 'string' || manifest.id.length === 0) {
        throw new Error('Manifest id must be a non-empty string');
      }
      // Check for valid id format (alphanumeric, dots, hyphens, underscores)
      if (!/^[a-zA-Z0-9._-]+$/.test(manifest.id)) {
        throw new Error(`Invalid id format: ${manifest.id}. Use only alphanumeric characters, dots, hyphens, or underscores`);
      }
    }

    // Validate description if present
    if (manifest.description !== undefined) {
      if (typeof manifest.description !== 'string' || manifest.description.length === 0) {
        throw new Error('Manifest description must be a non-empty string');
      }
      if (manifest.description.length > 500) {
        throw new Error('Manifest description too long (max 500 characters)');
      }
    }

    // Validate metadata fields if present
    if (manifest.author !== undefined && typeof manifest.author !== 'string') {
      throw new Error('Manifest author must be a string');
    }

    if (manifest.license !== undefined && typeof manifest.license !== 'string') {
      throw new Error('Manifest license must be a string');
    }

    if (manifest.repository !== undefined) {
      if (typeof manifest.repository !== 'string' && typeof manifest.repository !== 'object') {
        throw new Error('Manifest repository must be a string or object');
      }
      if (typeof manifest.repository === 'object' && !manifest.repository.url) {
        throw new Error('Manifest repository object must contain a url field');
      }
    }

    // Validate permissions array
    if (manifest.permissions !== undefined) {
      if (!Array.isArray(manifest.permissions)) {
        throw new Error('Manifest permissions must be an array');
      }

      manifest.permissions.forEach((permission, index) => {
        if (typeof permission !== 'string') {
          throw new Error(`Permission at index ${index} must be a string`);
        }

        // Validate permission format
        // Supports: wildcard (*), namespace:action (events:emit), or single-word (logging)
        if (!/^[a-zA-Z0-9_-]+(:[a-zA-Z0-9_-]+)?$/.test(permission) && permission !== '*') {
          throw new Error(`Invalid permission format: ${permission}. Expected format: "namespace:action" or single word (e.g., "events:emit", "logging")`);
        }
      });
    }

    // Validate dependencies array
    if (manifest.dependencies !== undefined) {
      if (!Array.isArray(manifest.dependencies)) {
        throw new Error('Manifest dependencies must be an array');
      }

      manifest.dependencies.forEach((dep, index) => {
        if (typeof dep !== 'string' || dep.length === 0) {
          throw new Error(`Dependency at index ${index} must be a non-empty string`);
        }
      });
    }

    // Validate entry points
    if (manifest.entryPoints !== undefined) {
      if (typeof manifest.entryPoints !== 'object' || manifest.entryPoints === null) {
        throw new Error('Manifest entryPoints must be an object');
      }

      const validEntryPoints = ['main', 'preload', 'renderer'];
      Object.keys(manifest.entryPoints).forEach(key => {
        if (!validEntryPoints.includes(key)) {
          throw new Error(`Invalid entry point: ${key}. Valid entry points are: ${validEntryPoints.join(', ')}`);
        }

        const entryPoint = manifest.entryPoints[key];
        if (typeof entryPoint !== 'string' || entryPoint.length === 0) {
          throw new Error(`Entry point "${key}" must be a non-empty string path`);
        }

        // Validate entry point path format
        if (!entryPoint.startsWith('./') && !entryPoint.startsWith('../')) {
          throw new Error(`Entry point "${key}" must be a relative path starting with ./ or ../`);
        }

        if (!entryPoint.endsWith('.js')) {
          throw new Error(`Entry point "${key}" must be a JavaScript file (.js)`);
        }
      });
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
