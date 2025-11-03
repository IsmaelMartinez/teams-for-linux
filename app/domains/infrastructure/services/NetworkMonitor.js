const { net } = require('electron');
const EventBus = require('../../../core/EventBus');

/**
 * NetworkMonitor Service - Network connectivity monitoring
 *
 * Extracted from ConnectionManager to provide:
 * - Connection state tracking (online/offline)
 * - Network quality monitoring (latency, method used)
 * - Multiple connectivity check methods (HTTPS, DNS, native)
 * - Event-driven network state changes via EventBus
 *
 * Emits events:
 * - 'network.online' - Network connection established
 * - 'network.offline' - Network connection lost
 * - 'network.changed' - Network state changed
 *
 * Usage:
 *   const monitor = new NetworkMonitor(config);
 *   monitor.start();
 *   monitor.on('stateChange', (state) => console.log(state));
 */
class NetworkMonitor {
  /**
   * @param {Object} config - Configuration object
   * @param {string} config.url - URL to test connectivity against
   */
  constructor(config = {}) {
    // Private fields using WeakMap pattern
    this._state = new WeakMap();
    this._config = new WeakMap();
    this._listeners = new WeakMap();

    const stateData = {
      isOnline: null, // null = unknown, true = online, false = offline
      lastCheck: null,
      lastMethod: null, // Which method succeeded (https, dns, native)
      checkInterval: null,
      isRunning: false
    };

    this._state.set(this, stateData);
    this._config.set(this, {
      url: config.url || 'https://teams.microsoft.com',
      checkIntervalMs: config.networkCheckIntervalMs || 30000, // 30 seconds
      retryDelayMs: config.networkRetryDelayMs || 500
    });
    this._listeners.set(this, new Set());

    this._eventBus = EventBus.getInstance();
  }

  /**
   * Get state data
   * @private
   */
  _getState() {
    return this._state.get(this);
  }

  /**
   * Get config data
   * @private
   */
  _getConfig() {
    return this._config.get(this);
  }

  /**
   * Get listeners set
   * @private
   */
  _getListeners() {
    return this._listeners.get(this);
  }

  /**
   * Start network monitoring
   */
  start() {
    const state = this._getState();
    const config = this._getConfig();

    if (state.isRunning) {
      return;
    }

    state.isRunning = true;

    // Initial check
    this.checkConnectivity();

    // Set up periodic checks
    state.checkInterval = setInterval(() => {
      this.checkConnectivity();
    }, config.checkIntervalMs);
  }

  /**
   * Stop network monitoring
   */
  stop() {
    const state = this._getState();

    if (!state.isRunning) {
      return;
    }

    state.isRunning = false;

    if (state.checkInterval) {
      clearInterval(state.checkInterval);
      state.checkInterval = null;
    }
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    this.stop();

    // Clear listeners
    const listeners = this._getListeners();
    listeners.clear();
  }

  /**
   * Check network connectivity using multiple methods
   * @returns {Promise<boolean>} True if online
   */
  async checkConnectivity() {
    const state = this._getState();
    const previousState = state.isOnline;

    try {
      const online = await this.isOnline();
      const now = Date.now();

      state.isOnline = online;
      state.lastCheck = now;

      // Emit state change events if state changed
      if (previousState !== null && previousState !== online) {
        this._emitStateChange(online);
      }

      return online;
    } catch (error) {
      console.error('Network check failed:', error);
      return false;
    }
  }

  /**
   * Emit network state change events
   * @private
   * @param {boolean} isOnline - Current online state
   */
  _emitStateChange(isOnline) {
    const state = this._getState();

    // Emit to EventBus for domain coordination
    this._eventBus.emit('network.changed', {
      isOnline,
      method: state.lastMethod,
      timestamp: state.lastCheck
    });

    if (isOnline) {
      this._eventBus.emit('network.online', {
        method: state.lastMethod,
        timestamp: state.lastCheck
      });
    } else {
      this._eventBus.emit('network.offline', {
        timestamp: state.lastCheck
      });
    }

    // Emit to local listeners
    const listeners = this._getListeners();
    listeners.forEach(callback => {
      try {
        callback(isOnline);
      } catch (error) {
        console.error('Error in network state listener:', error);
      }
    });
  }

  /**
   * Add listener for network state changes
   * @param {Function} callback - Callback function (receives isOnline boolean)
   */
  on(event, callback) {
    if (event === 'stateChange' && typeof callback === 'function') {
      const listeners = this._getListeners();
      listeners.add(callback);
    }
  }

  /**
   * Remove listener for network state changes
   * @param {Function} callback - Callback function to remove
   */
  off(event, callback) {
    if (event === 'stateChange') {
      const listeners = this._getListeners();
      listeners.delete(callback);
    }
  }

  /**
   * Check if currently online using multiple methods
   * Tries HTTPS, DNS, and native checks with retries
   * @returns {Promise<boolean>} True if online
   */
  async isOnline() {
    const config = this._getConfig();
    const state = this._getState();

    const onlineCheckMethods = [
      {
        method: 'https',
        tries: 10,
        networkTest: async () => {
          return await this._isOnlineHttps(config.url);
        }
      },
      {
        method: 'dns',
        tries: 5,
        networkTest: async () => {
          const testDomain = new URL(config.url).hostname;
          return await this._isOnlineDns(testDomain);
        }
      },
      {
        method: 'native',
        tries: 5,
        networkTest: async () => {
          return net.isOnline();
        }
      },
      {
        method: 'none',
        tries: 1,
        networkTest: async () => {
          console.warn('Network test disabled, assuming online');
          return true;
        }
      }
    ];

    for (const checkMethod of onlineCheckMethods) {
      for (let i = 1; i <= checkMethod.tries; i++) {
        const online = await checkMethod.networkTest();
        if (online) {
          state.lastMethod = checkMethod.method;
          return true;
        }
        await this._sleep(config.retryDelayMs);
      }
    }

    state.lastMethod = null;
    return false;
  }

  /**
   * Check connectivity via HTTPS request
   * @private
   * @param {string} testUrl - URL to test
   * @returns {Promise<boolean>}
   */
  _isOnlineHttps(testUrl) {
    return new Promise((resolve) => {
      const req = net.request({
        url: testUrl,
        method: 'HEAD'
      });

      req.on('response', () => {
        resolve(true);
      });

      req.on('error', () => {
        resolve(false);
      });

      req.end();
    });
  }

  /**
   * Check connectivity via DNS resolution
   * @private
   * @param {string} testDomain - Domain to resolve
   * @returns {Promise<boolean>}
   */
  _isOnlineDns(testDomain) {
    return new Promise((resolve) => {
      net.resolveHost(testDomain)
        .then(() => resolve(true))
        .catch(() => resolve(false));
    });
  }

  /**
   * Sleep utility
   * @private
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current network state
   * @returns {Object} Current state
   */
  getState() {
    const state = this._getState();
    return {
      isOnline: state.isOnline,
      lastCheck: state.lastCheck,
      lastMethod: state.lastMethod,
      isRunning: state.isRunning
    };
  }

  /**
   * Get current online status
   * @returns {boolean|null} True if online, false if offline, null if unknown
   */
  isCurrentlyOnline() {
    const state = this._getState();
    return state.isOnline;
  }

  /**
   * Force immediate connectivity check
   * @returns {Promise<boolean>} Current online status
   */
  async forceCheck() {
    return await this.checkConnectivity();
  }

  /**
   * Get network monitor statistics
   * @returns {Object} Statistics
   */
  getStats() {
    const state = this._getState();
    const config = this._getConfig();
    const listeners = this._getListeners();

    return {
      isOnline: state.isOnline,
      lastCheck: state.lastCheck,
      lastMethod: state.lastMethod,
      isRunning: state.isRunning,
      checkIntervalMs: config.checkIntervalMs,
      listenerCount: listeners.size,
      testUrl: config.url
    };
  }
}

module.exports = NetworkMonitor;
