const EventBus = require('./EventBus');
const PluginManager = require('./PluginManager');

/**
 * Application - Main orchestrator for Teams for Linux
 * Coordinates domain initialization and plugin lifecycle
 */
class Application {
  /**
   * @param {Object} config - Application configuration
   * @param {Object} logger - Logger instance
   */
  constructor(config, logger = console) {
    this._config = config;
    this._logger = logger;
    this._eventBus = EventBus.getInstance();
    this._pluginManager = null;
    this._initialized = false;
    this._started = false;
    this._domains = new Map();
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
}

module.exports = Application;
