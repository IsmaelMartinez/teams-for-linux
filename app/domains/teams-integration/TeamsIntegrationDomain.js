const BasePlugin = require('../../plugins/BasePlugin');

/**
 * TeamsIntegrationDomain - Microsoft Teams-specific integration services
 *
 * Provides Teams-specific services for the application:
 * - ReactBridge: Communication bridge between Electron and React UI
 * - TokenCache: Authentication token caching and management
 * - NotificationInterceptor: Teams notification handling and processing
 *
 * This domain implements the Teams Integration Domain from ADR-004,
 * managing all Teams-specific functionality and integrations.
 */
class TeamsIntegrationDomain extends BasePlugin {
  /**
   * @param {string} id - Domain identifier
   * @param {Object} manifest - Domain manifest
   * @param {Object} api - Plugin API instance
   */
  constructor(id, manifest, api) {
    super(id, manifest, api);

    // Service instances (initialized during activation)
    this._reactBridge = null;
    this._tokenCache = null;
    this._notificationInterceptor = null;
    this._config = null;
    this._logger = null;
    this._eventBus = null;
  }

  /**
   * Activate the Teams integration domain
   * Initializes Teams-specific services
   * @returns {Promise<void>}
   */
  async onActivate() {
    try {
      // Get logger (fallback to console)
      try {
        const infraDomain = this.api.getDomain('infrastructure');
        this._logger = infraDomain ? infraDomain.getLogger().child('teams-integration') : console;
      } catch (e) {
        this._logger = console;
      }

      this._logger.info('Teams Integration Domain activating...');

      // Get configuration domain
      const configDomain = this.api.getDomain('configuration');
      if (!configDomain) {
        throw new Error('Configuration domain not available. Teams Integration domain depends on configuration.');
      }
      this._config = configDomain.getAppConfiguration();

      // Get event bus from API
      this._eventBus = this.api.getEventBus ? this.api.getEventBus() : null;

      // Import and initialize services
      try {
        // Try to load all services (some may not be implemented yet)
        let servicesInitialized = 0;
        const servicesStatus = {
          reactBridge: false,
          tokenCache: false,
          notificationInterceptor: false
        };

        // Initialize ReactBridge (if available)
        try {
          const ReactBridge = require('./services/ReactBridge');
          this._reactBridge = new ReactBridge(this._config, this._logger);
          servicesStatus.reactBridge = true;
          servicesInitialized++;
          this._logger.info('ReactBridge initialized');
        } catch (error) {
          this._logger.warn('ReactBridge not yet implemented', { error: error.message });
        }

        // Initialize TokenCache (if available)
        try {
          const TokenCache = require('./services/TokenCache');
          this._tokenCache = new TokenCache(this._config, this._logger);
          servicesStatus.tokenCache = true;
          servicesInitialized++;
          this._logger.info('TokenCache initialized');
        } catch (error) {
          this._logger.warn('TokenCache not yet implemented', { error: error.message });
        }

        // Initialize NotificationInterceptor (if available)
        try {
          const NotificationInterceptor = require('./services/NotificationInterceptor');
          this._notificationInterceptor = new NotificationInterceptor(this._config, this._logger);
          servicesStatus.notificationInterceptor = true;
          servicesInitialized++;
          this._logger.info('NotificationInterceptor initialized');
        } catch (error) {
          this._logger.warn('NotificationInterceptor not available', { error: error.message });
        }

        // Determine activation status
        const activationStatus = servicesInitialized === 3 ? 'ready' :
                                servicesInitialized > 0 ? 'partial' : 'pending';

        // Emit activation event
        this.api.emit('teams.activated', {
          status: activationStatus,
          services: servicesStatus,
          servicesCount: servicesInitialized,
          timestamp: Date.now()
        });

        if (activationStatus === 'ready') {
          this._logger.info('Teams Integration Domain activated successfully', {
            services: servicesStatus
          });
        } else if (activationStatus === 'partial') {
          this._logger.warn('Teams Integration Domain partially activated', {
            services: servicesStatus,
            message: 'Some services pending implementation'
          });
        } else {
          this._logger.warn('Teams Integration Domain activated with no services', {
            message: 'All services pending implementation'
          });
        }
      } catch (error) {
        // Critical error during service initialization
        this._logger.error('Critical error during Teams Integration service initialization', {
          error: error.message,
          stack: error.stack
        });
        throw error;
      }
    } catch (error) {
      (this._logger || console).error('Failed to activate Teams Integration Domain', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Deactivate the Teams integration domain
   * Stops all running services gracefully
   * @returns {Promise<void>}
   */
  async onDeactivate() {
    const logger = this._logger || console;

    try {
      logger.info('Teams Integration Domain deactivating...');

      // Cleanup NotificationInterceptor
      if (this._notificationInterceptor && typeof this._notificationInterceptor.cleanup === 'function') {
        this._notificationInterceptor.cleanup();
        logger.info('NotificationInterceptor cleaned up');
      }

      // Cleanup TokenCache
      if (this._tokenCache && typeof this._tokenCache.clear === 'function') {
        this._tokenCache.clear();
        logger.info('TokenCache cleared');
      }

      // Cleanup ReactBridge
      if (this._reactBridge && typeof this._reactBridge.disconnect === 'function') {
        this._reactBridge.disconnect();
        logger.info('ReactBridge disconnected');
      }

      // Emit deactivation event
      this.api.emit('teams.deactivated', {
        timestamp: Date.now()
      });

      logger.info('Teams Integration Domain deactivated successfully');
    } catch (error) {
      logger.error('Error during Teams Integration Domain deactivation', {
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
    const logger = this._logger || console;

    try {
      logger.info('Teams Integration Domain cleaning up...');

      // Ensure all services are cleaned up
      if (this._notificationInterceptor) {
        this._notificationInterceptor = null;
      }

      if (this._tokenCache) {
        this._tokenCache = null;
      }

      if (this._reactBridge) {
        this._reactBridge = null;
      }

      // Clear references
      this._config = null;
      this._eventBus = null;
      this._logger = null;

      logger.info('Teams Integration Domain destroyed');
    } catch (error) {
      console.error('Error during Teams Integration Domain cleanup:', error);
    }
  }

  /**
   * Get the ReactBridge service
   * @returns {Object} ReactBridge instance
   * @throws {Error} If ReactBridge not initialized
   */
  getReactBridge() {
    if (!this._reactBridge) {
      throw new Error('ReactBridge not initialized. Domain must be activated first or service not yet implemented.');
    }
    return this._reactBridge;
  }

  /**
   * Get the TokenCache service
   * @returns {Object} TokenCache instance
   * @throws {Error} If TokenCache not initialized
   */
  getTokenCache() {
    if (!this._tokenCache) {
      throw new Error('TokenCache not initialized. Domain must be activated first or service not yet implemented.');
    }
    return this._tokenCache;
  }

  /**
   * Get the NotificationInterceptor service
   * @returns {Object} NotificationInterceptor instance
   * @throws {Error} If NotificationInterceptor not initialized
   */
  getNotificationInterceptor() {
    if (!this._notificationInterceptor) {
      throw new Error('NotificationInterceptor not initialized. Domain must be activated first or service not yet implemented.');
    }
    return this._notificationInterceptor;
  }

  /**
   * Get all Teams integration services
   * @returns {Object} Object containing all services
   */
  getServices() {
    return {
      reactBridge: this._reactBridge,
      tokenCache: this._tokenCache,
      notificationInterceptor: this._notificationInterceptor
    };
  }

  /**
   * Check if all services are operational
   * @returns {boolean} True if all services are ready
   */
  isHealthy() {
    return !!(
      this._reactBridge &&
      this._tokenCache &&
      this._notificationInterceptor
    );
  }

  /**
   * Get domain statistics
   * @returns {Object} Domain statistics including service status
   */
  getStats() {
    const stats = {
      healthy: this.isHealthy(),
      services: {
        reactBridge: !!this._reactBridge,
        tokenCache: !!this._tokenCache,
        notificationInterceptor: !!this._notificationInterceptor
      }
    };

    // Add service-specific stats if available
    if (this._tokenCache && typeof this._tokenCache.getStats === 'function') {
      stats.tokenCache = this._tokenCache.getStats();
    }

    if (this._notificationInterceptor && typeof this._notificationInterceptor.getStats === 'function') {
      stats.notifications = this._notificationInterceptor.getStats();
    }

    if (this._reactBridge && typeof this._reactBridge.getStats === 'function') {
      stats.reactBridge = this._reactBridge.getStats();
    }

    return stats;
  }
}

module.exports = TeamsIntegrationDomain;
