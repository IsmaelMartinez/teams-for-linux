const EventBus = require('./EventBus');
const PluginManager = require('./PluginManager');

/**
 * Application - Main orchestrator for Teams for Linux
 * Coordinates domain initialization and plugin lifecycle
 */
class Application {
  /**
   * @param {Object} options - Application options
   * @param {Object} options.config - Application configuration
   * @param {Object} options.logger - Logger instance
   * @param {Array<string>} options.domains - Domain IDs to load
   */
  constructor(options = {}) {
    this._config = options.config;
    this._logger = options.logger || console;
    this._eventBus = EventBus.getInstance();
    this._pluginManager = null;
    this._initialized = false;
    this._started = false;
    this._domains = new Map();
    this._domainsToLoad = options.domains || [];
  }

  /**
   * Initialize the application
   * Sets up core services and plugin manager
   * @returns {Promise<void>}
   */
  async init() {
    if (this._initialized) {
      throw new Error('Application already initialized');
    }

    try {
      this._logger.info('Initializing application...');

      // Initialize core services
      const services = {
        eventBus: this._eventBus,
        config: this._config,
        logger: this._logger
      };

      // Initialize plugin manager
      this._pluginManager = new PluginManager(services);

      // Load and activate domains
      await this._loadDomains();

      // Emit initialization event
      this._eventBus.emit('app.initialized', { services });

      this._initialized = true;
      this._logger.info('Application initialized successfully');
    } catch (error) {
      this._logger.error('Failed to initialize application:', error);
      throw error;
    }
  }

  /**
   * Load and activate domains
   * @private
   * @returns {Promise<void>}
   */
  async _loadDomains() {
    const domainRegistry = {
      infrastructure: {
        path: '../domains/infrastructure/InfrastructureDomain',
        manifest: {
          name: 'Infrastructure Domain',
          version: '1.0.0',
          description: 'Core infrastructure services (logging, monitoring)',
          permissions: ['*']
        }
      },
      configuration: {
        path: '../domains/configuration/ConfigurationDomain',
        manifest: {
          name: 'Configuration Domain',
          version: '1.0.0',
          description: 'Configuration management and state',
          dependencies: ['domain.infrastructure'],
          permissions: ['*']
        }
      },
      shell: {
        path: '../domains/shell/ShellDomain',
        manifest: {
          name: 'Shell Domain',
          version: '1.0.0',
          description: 'Window and tray management',
          dependencies: ['domain.configuration'],
          permissions: ['*']
        }
      },
      'teams-integration': {
        path: '../domains/teams-integration/TeamsIntegrationDomain',
        manifest: {
          name: 'Teams Integration Domain',
          version: '1.0.0',
          description: 'Microsoft Teams integration services',
          dependencies: ['domain.configuration'],
          permissions: ['*']
        }
      }
    };

    // Load requested domains
    for (const domainId of this._domainsToLoad) {
      const domainInfo = domainRegistry[domainId];
      if (!domainInfo) {
        this._logger.warn(`Unknown domain: ${domainId}`);
        continue;
      }

      try {
        this._logger.debug(`Loading domain: ${domainId}`);
        const DomainClass = require(domainInfo.path);
        const fullId = `domain.${domainId}`;

        // Load plugin
        await this._pluginManager.loadPlugin(fullId, DomainClass, domainInfo.manifest);

        // Activate plugin
        await this._pluginManager.activatePlugin(fullId);

        // Store reference
        this._domains.set(domainId, this._pluginManager.getPlugin(fullId));

        this._logger.info(`Domain loaded: ${domainId}`);
      } catch (error) {
        this._logger.error(`Failed to load domain ${domainId}:`, error);
        // Don't throw - allow app to continue with partial domains
      }
    }
  }

  /**
   * Start the application
   * Initializes domains and activates plugins
   * @returns {Promise<void>}
   */
  async start() {
    if (!this._initialized) {
      throw new Error('Application not initialized. Call init() first');
    }

    if (this._started) {
      throw new Error('Application already started');
    }

    try {
      this._logger.info('Starting application...');

      // Emit start event
      this._eventBus.emit('app.starting', {});

      // Domain initialization would happen here
      // await this._initializeDomains();

      this._started = true;

      // Emit started event
      this._eventBus.emit('app.started', {});

      this._logger.info('Application started successfully');
    } catch (error) {
      this._logger.error('Failed to start application:', error);
      throw error;
    }
  }

  /**
   * Shutdown the application
   * Deactivates plugins and cleans up resources
   * @returns {Promise<void>}
   */
  async shutdown() {
    if (!this._started) {
      return;
    }

    try {
      this._logger.info('Shutting down application...');

      // Emit shutdown event
      this._eventBus.emit('app.shutting_down', {});

      // Deactivate all active plugins
      const activePlugins = this._pluginManager.getActivePlugins();
      for (const plugin of activePlugins) {
        try {
          await this._pluginManager.deactivatePlugin(plugin.id);
        } catch (error) {
          this._logger.error(`Error deactivating plugin ${plugin.id}:`, error);
        }
      }

      this._started = false;

      // Emit shutdown complete event
      this._eventBus.emit('app.shutdown', {});

      this._logger.info('Application shutdown complete');
    } catch (error) {
      this._logger.error('Error during shutdown:', error);
      throw error;
    }
  }

  /**
   * Get plugin manager
   * @returns {PluginManager} Plugin manager instance
   */
  get pluginManager() {
    return this._pluginManager;
  }

  /**
   * Get event bus
   * @returns {EventBus} Event bus instance
   */
  get eventBus() {
    return this._eventBus;
  }

  /**
   * Check if application is initialized
   * @returns {boolean} Initialized status
   */
  get isInitialized() {
    return this._initialized;
  }

  /**
   * Check if application is started
   * @returns {boolean} Started status
   */
  get isStarted() {
    return this._started;
  }

  /**
   * Get domain by ID
   * @param {string} domainId - Domain identifier
   * @returns {Object|null} Domain instance
   */
  getDomain(domainId) {
    return this._domains.get(domainId) || null;
  }

  /**
   * Get all loaded domains
   * @returns {Map<string, Object>} Map of domain instances
   */
  getDomains() {
    return this._domains;
  }

  /**
   * Get configuration
   * @returns {Object} Configuration object
   */
  get config() {
    return this._config;
  }
}

module.exports = Application;
