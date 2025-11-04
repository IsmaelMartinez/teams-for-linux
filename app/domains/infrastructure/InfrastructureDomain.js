const BasePlugin = require('../../plugins/BasePlugin');

/**
 * InfrastructureDomain - Core infrastructure services
 *
 * Provides foundational services for the application:
 * - Logger: Structured logging with levels and contexts
 * - CacheManager: Automatic cache cleanup and management
 * - NetworkMonitor: Network connectivity monitoring and recovery
 *
 * This domain implements the Infrastructure Domain from ADR-004,
 * providing cross-cutting concerns for all other domains and plugins.
 */
class InfrastructureDomain extends BasePlugin {
  /**
   * @param {string} id - Domain identifier
   * @param {Object} manifest - Domain manifest
   * @param {Object} api - Plugin API instance
   */
  constructor(id, manifest, api) {
    super(id, manifest, api);

    // Service instances (initialized during activation)
    this._services = new WeakMap();
    this._servicesData = {
      logger: null,
      cacheManager: null,
      networkMonitor: null
    };
    this._services.set(this, this._servicesData);
  }

  /**
   * Get services data from WeakMap
   * @private
   */
  _getServices() {
    return this._services.get(this);
  }

  /**
   * Activate the infrastructure domain
   * Initializes all core infrastructure services
   * @returns {Promise<void>}
   */
  async onActivate() {
    const services = this._getServices();

    try {
      // Import service modules
      const Logger = require('./services/Logger');
      const CacheManager = require('../../cacheManager');
      const NetworkMonitor = require('./services/NetworkMonitor');

      // Get config from API
      const config = this.api.getConfig();

      // Initialize Logger (always first for debugging other services)
      services.logger = new Logger({
        level: config.logLevel || 'info',
        namespace: 'infrastructure'
      });
      services.logger.info('Infrastructure Domain activating...');

      // Initialize CacheManager
      services.cacheManager = new CacheManager(config);
      services.logger.info('CacheManager initialized', {
        maxSize: `${config.maxCacheSizeMB || 600}MB`,
        checkInterval: `${(config.cacheCheckIntervalMs || 3600000) / 1000}s`
      });

      // Initialize NetworkMonitor
      services.networkMonitor = new NetworkMonitor(config);
      services.logger.info('NetworkMonitor initialized');

      // Emit domain activation event
      this.api.emit('infrastructure.activated', {
        services: Object.keys(services)
      });

      services.logger.info('Infrastructure Domain activated successfully');
    } catch (error) {
      const logger = services.logger || console;
      logger.error('Failed to activate Infrastructure Domain', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Deactivate the infrastructure domain
   * Stops all running services gracefully
   * @returns {Promise<void>}
   */
  async onDeactivate() {
    const services = this._getServices();
    const logger = services.logger || console;

    try {
      logger.info('Infrastructure Domain deactivating...');

      // Stop CacheManager monitoring
      if (services.cacheManager) {
        services.cacheManager.stop();
        logger.info('CacheManager stopped');
      }

      // Stop NetworkMonitor
      if (services.networkMonitor) {
        services.networkMonitor.stop();
        logger.info('NetworkMonitor stopped');
      }

      // Emit deactivation event
      this.api.emit('infrastructure.deactivated');

      logger.info('Infrastructure Domain deactivated successfully');
    } catch (error) {
      logger.error('Error during Infrastructure Domain deactivation', {
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
    const services = this._getServices();
    const logger = services.logger || console;

    try {
      logger.info('Infrastructure Domain cleaning up...');

      // Ensure all services are stopped
      if (services.cacheManager) {
        services.cacheManager.stop();
      }

      if (services.networkMonitor) {
        services.networkMonitor.cleanup();
      }

      // Clear service references
      services.logger = null;
      services.cacheManager = null;
      services.networkMonitor = null;

      // Note: Logger cleanup happens last
      if (logger.info) {
        logger.info('Infrastructure Domain destroyed');
      }
    } catch (error) {
      console.error('Error during Infrastructure Domain cleanup:', error);
    }
  }

  /**
   * Get the Logger service
   * @returns {Object} Logger instance
   */
  getLogger() {
    const services = this._getServices();
    if (!services.logger) {
      throw new Error('Logger not initialized. Domain must be activated first.');
    }
    return services.logger;
  }

  /**
   * Get the CacheManager service
   * @returns {Object} CacheManager instance
   */
  getCacheManager() {
    const services = this._getServices();
    if (!services.cacheManager) {
      throw new Error('CacheManager not initialized. Domain must be activated first.');
    }
    return services.cacheManager;
  }

  /**
   * Get the NetworkMonitor service
   * @returns {Object} NetworkMonitor instance
   */
  getNetworkMonitor() {
    const services = this._getServices();
    if (!services.networkMonitor) {
      throw new Error('NetworkMonitor not initialized. Domain must be activated first.');
    }
    return services.networkMonitor;
  }

  /**
   * Get all infrastructure services
   * @returns {Object} Object containing all services
   */
  getServices() {
    const services = this._getServices();
    return {
      logger: services.logger,
      cacheManager: services.cacheManager,
      networkMonitor: services.networkMonitor
    };
  }

  /**
   * Check if all services are operational
   * @returns {boolean} True if all services are ready
   */
  isHealthy() {
    const services = this._getServices();
    return !!(
      services.logger &&
      services.cacheManager &&
      services.networkMonitor
    );
  }
}

module.exports = InfrastructureDomain;
