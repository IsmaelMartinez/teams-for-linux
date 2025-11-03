/**
 * CompatibilityBridge - Backward compatibility layer for app/index.js migration
 *
 * This bridge ensures that the old app/index.js code paths continue to work
 * during the transition to the new Application class architecture.
 *
 * STRANGLER FIG PATTERN:
 * This file will be gradually removed as old code is migrated to domains.
 * It bridges global variables and functions from the old monolithic index.js
 * to the new domain-based architecture.
 *
 * @see ADR-004 for architecture details
 */

class CompatibilityBridge {
  /**
   * @param {Application} application - Application instance
   * @param {Object} options - Bridge configuration
   */
  constructor(application, options = {}) {
    this._application = application;
    this._stateManager = null;
    this._config = null;
    this._logger = options.logger || console;
    this._legacyGlobals = new Map();

    // Store legacy references
    this._picker = null;
    this._player = null;

    this._logger.debug('[CompatibilityBridge] Initializing backward compatibility layer');
  }

  /**
   * Initialize the bridge - connects to domains
   * @returns {Promise<void>}
   */
  async init() {
    try {
      this._logger.debug('[CompatibilityBridge] Connecting to application domains');

      // Wait for application to be initialized
      if (!this._application.isInitialized) {
        throw new Error('Application must be initialized before bridge');
      }

      // Get StateManager from configuration domain
      const configDomain = this._getDomain('configuration');
      if (configDomain) {
        this._stateManager = configDomain.getStateManager();
        this._config = configDomain.getAppConfiguration();
        this._logger.debug('[CompatibilityBridge] Connected to StateManager');
      }

      this._setupGlobalCompatibility();
      this._logger.info('[CompatibilityBridge] Backward compatibility layer initialized');
    } catch (error) {
      this._logger.error('[CompatibilityBridge] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Setup global variable compatibility
   * Maps old global variables to StateManager
   * @private
   */
  _setupGlobalCompatibility() {
    // Setup global variable accessors using globalThis
    // This allows old code to access userStatus, idleTimeUserStatus, etc.

    if (this._stateManager) {
      // Map userStatus to StateManager
      Object.defineProperty(globalThis, 'userStatus', {
        get: () => this._stateManager.getUserStatus(),
        set: (value) => this._stateManager.setUserStatus(value),
        configurable: true
      });

      // Map idleTimeUserStatus to StateManager
      Object.defineProperty(globalThis, 'idleTimeUserStatus', {
        get: () => this._stateManager.getIdleTimeUserStatus(),
        set: (value) => this._stateManager.setIdleTimeUserStatus(value),
        configurable: true
      });

      // Map screen sharing source to StateManager
      Object.defineProperty(globalThis, 'selectedScreenShareSource', {
        get: () => this._stateManager.getCurrentScreenShareSourceId(),
        set: (value) => this._stateManager.setCurrentScreenShareSourceId(value),
        configurable: true
      });

      this._logger.debug('[CompatibilityBridge] Global variables mapped to StateManager');
    }

    // Store picker reference (used by screen picker)
    this._legacyGlobals.set('picker', null);
    Object.defineProperty(globalThis, 'picker', {
      get: () => this._picker,
      set: (value) => { this._picker = value; },
      configurable: true
    });

    // Store previewWindow reference (used by screen sharing)
    Object.defineProperty(globalThis, 'previewWindow', {
      get: () => this._stateManager?.getCustomState('previewWindow', null),
      set: (value) => this._stateManager?.setCustomState('previewWindow', value),
      configurable: true
    });
  }

  /**
   * Get domain by ID
   * @param {string} domainId - Domain identifier
   * @returns {Object|null} Domain instance
   * @private
   */
  _getDomain(domainId) {
    try {
      // Access through plugin manager when available
      if (this._application.pluginManager) {
        const plugin = this._application.pluginManager._plugins.get(`domain.${domainId}`);
        return plugin?.instance || null;
      }
      return null;
    } catch (error) {
      this._logger.warn(`[CompatibilityBridge] Failed to get domain ${domainId}:`, error);
      return null;
    }
  }

  /**
   * Get StateManager instance
   * @returns {StateManager} StateManager instance
   */
  getStateManager() {
    if (!this._stateManager) {
      throw new Error('StateManager not available. Bridge must be initialized first.');
    }
    return this._stateManager;
  }

  /**
   * Get configuration
   * @returns {Object} Configuration object
   */
  getConfig() {
    return this._config;
  }

  /**
   * Set picker reference (legacy screen picker)
   * @param {BrowserWindow|null} picker - Picker window instance
   */
  setPicker(picker) {
    this._picker = picker;
    this._legacyGlobals.set('picker', picker);
  }

  /**
   * Get picker reference
   * @returns {BrowserWindow|null} Picker window instance
   */
  getPicker() {
    return this._picker;
  }

  /**
   * Set player reference (legacy audio player)
   * @param {Object|null} player - Audio player instance
   */
  setPlayer(player) {
    this._player = player;
    this._legacyGlobals.set('player', player);
  }

  /**
   * Get player reference
   * @returns {Object|null} Audio player instance
   */
  getPlayer() {
    return this._player;
  }

  /**
   * Get legacy global value
   * @param {string} key - Global variable name
   * @param {*} defaultValue - Default value if not found
   * @returns {*} Global value
   */
  getLegacyGlobal(key, defaultValue = undefined) {
    return this._legacyGlobals.has(key)
      ? this._legacyGlobals.get(key)
      : defaultValue;
  }

  /**
   * Set legacy global value
   * @param {string} key - Global variable name
   * @param {*} value - Value to set
   */
  setLegacyGlobal(key, value) {
    this._legacyGlobals.set(key, value);
  }

  /**
   * Export legacy functions for old code
   * @returns {Object} Legacy function exports
   */
  getLegacyExports() {
    return {
      // State accessors
      getUserStatus: () => this._stateManager?.getUserStatus() ?? -1,
      setUserStatus: (status) => this._stateManager?.setUserStatus(status),
      getIdleTimeUserStatus: () => this._stateManager?.getIdleTimeUserStatus() ?? -1,
      setIdleTimeUserStatus: (status) => this._stateManager?.setIdleTimeUserStatus(status),

      // Screen sharing accessors
      getScreenShareSource: () => this._stateManager?.getCurrentScreenShareSourceId(),
      setScreenShareSource: (sourceId) => this._stateManager?.setCurrentScreenShareSourceId(sourceId),
      isScreenSharingActive: () => this._stateManager?.isScreenSharingActive() ?? false,
      setScreenSharingActive: (active) => this._stateManager?.setScreenSharingActive(active),

      // Legacy accessors
      getPicker: () => this._picker,
      setPicker: (picker) => { this._picker = picker; },
      getPlayer: () => this._player,
      setPlayer: (player) => { this._player = player; },

      // Configuration
      getConfig: () => this._config
    };
  }

  /**
   * Cleanup bridge resources
   */
  async cleanup() {
    this._logger.debug('[CompatibilityBridge] Cleaning up compatibility layer');

    // Remove global property definitions
    try {
      delete globalThis.userStatus;
      delete globalThis.idleTimeUserStatus;
      delete globalThis.selectedScreenShareSource;
      delete globalThis.picker;
      delete globalThis.previewWindow;
    } catch (error) {
      this._logger.warn('[CompatibilityBridge] Error removing global properties:', error);
    }

    // Clear references
    this._stateManager = null;
    this._config = null;
    this._picker = null;
    this._player = null;
    this._legacyGlobals.clear();

    this._logger.info('[CompatibilityBridge] Compatibility layer cleaned up');
  }

  /**
   * Get bridge statistics
   * @returns {Object} Bridge statistics
   */
  getStats() {
    return {
      initialized: !!this._stateManager,
      legacyGlobalsCount: this._legacyGlobals.size,
      hasPicker: !!this._picker,
      hasPlayer: !!this._player,
      stateManagerAvailable: !!this._stateManager,
      configAvailable: !!this._config
    };
  }
}

module.exports = CompatibilityBridge;
