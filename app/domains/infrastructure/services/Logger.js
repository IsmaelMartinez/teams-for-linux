const log = require('electron-log');
const path = require('path');

/**
 * Logger Service - Structured logging with levels and contexts
 *
 * Wraps electron-log to provide:
 * - Multiple log levels (debug, info, warn, error)
 * - Contextual logging (domain, plugin, user ID)
 * - Structured log data (JSON-friendly)
 * - Log level filtering
 * - Automatic log rotation via electron-log
 *
 * Usage:
 *   const logger = new Logger({ level: 'info', namespace: 'domain-name' });
 *   logger.info('Message', { key: 'value' });
 */
class Logger {
  /**
   * @param {Object} options - Logger configuration
   * @param {string} options.level - Minimum log level (debug|info|warn|error)
   * @param {string} options.namespace - Logger namespace (domain/plugin name)
   * @param {Object} options.context - Additional context (userId, etc.)
   */
  constructor(options = {}) {
    // Private fields using WeakMap pattern
    this._config = new WeakMap();
    this._context = new WeakMap();

    const config = {
      level: options.level || 'info',
      namespace: options.namespace || 'app',
      format: options.format || 'text', // 'text' or 'json'
    };

    this._config.set(this, config);
    this._context.set(this, options.context || {});

    // Configure electron-log
    this._configureElectronLog();
  }

  /**
   * Configure electron-log settings
   * @private
   */
  _configureElectronLog() {
    const config = this._config.get(this);

    // Set log level
    log.transports.file.level = config.level;
    log.transports.console.level = config.level;

    // Configure file transport
    log.transports.file.maxSize = 10 * 1024 * 1024; // 10MB
    log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';

    // Configure console transport with colors
    log.transports.console.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';
  }

  /**
   * Get configuration
   * @private
   */
  _getConfig() {
    return this._config.get(this);
  }

  /**
   * Get context
   * @private
   */
  _getContext() {
    return this._context.get(this);
  }

  /**
   * Check if a log level should be logged
   * @private
   * @param {string} level - Log level to check
   * @returns {boolean}
   */
  _shouldLog(level) {
    const config = this._getConfig();
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    return levels[level] >= levels[config.level];
  }

  /**
   * Format log message with context
   * @private
   * @param {string} message - Log message
   * @param {Object} data - Additional data
   * @returns {string}
   */
  _formatMessage(message, data = {}) {
    const config = this._getConfig();
    const context = this._getContext();

    // Merge namespace, context, and data
    const logData = {
      namespace: config.namespace,
      ...context,
      ...data
    };

    // Format based on configuration
    if (config.format === 'json') {
      return JSON.stringify({ message, ...logData });
    }

    // Text format with structured data
    const dataStr = Object.keys(logData).length > 0
      ? ` ${JSON.stringify(logData)}`
      : '';

    return `[${config.namespace}] ${message}${dataStr}`;
  }

  /**
   * Log debug message
   * @param {string} message - Log message
   * @param {Object} data - Additional structured data
   */
  debug(message, data = {}) {
    if (!this._shouldLog('debug')) return;
    const formatted = this._formatMessage(message, data);
    log.debug(formatted);
  }

  /**
   * Log info message
   * @param {string} message - Log message
   * @param {Object} data - Additional structured data
   */
  info(message, data = {}) {
    if (!this._shouldLog('info')) return;
    const formatted = this._formatMessage(message, data);
    log.info(formatted);
  }

  /**
   * Log warning message
   * @param {string} message - Log message
   * @param {Object} data - Additional structured data
   */
  warn(message, data = {}) {
    if (!this._shouldLog('warn')) return;
    const formatted = this._formatMessage(message, data);
    log.warn(formatted);
  }

  /**
   * Log error message
   * @param {string} message - Log message
   * @param {Object} data - Additional structured data (error, stack, etc.)
   */
  error(message, data = {}) {
    if (!this._shouldLog('error')) return;
    const formatted = this._formatMessage(message, data);
    log.error(formatted);
  }

  /**
   * Create a child logger with additional context
   * @param {string} namespace - Child namespace
   * @param {Object} additionalContext - Additional context to merge
   * @returns {Logger} New logger instance with merged context
   */
  child(namespace, additionalContext = {}) {
    const config = this._getConfig();
    const context = this._getContext();

    return new Logger({
      level: config.level,
      namespace: namespace,
      format: config.format,
      context: { ...context, ...additionalContext }
    });
  }

  /**
   * Update context for this logger instance
   * @param {Object} newContext - Context to merge with existing
   */
  updateContext(newContext) {
    const context = this._getContext();
    Object.assign(context, newContext);
  }

  /**
   * Set log level dynamically
   * @param {string} level - New log level (debug|info|warn|error)
   */
  setLevel(level) {
    const validLevels = ['debug', 'info', 'warn', 'error'];
    if (!validLevels.includes(level)) {
      throw new Error(`Invalid log level: ${level}. Must be one of: ${validLevels.join(', ')}`);
    }

    const config = this._getConfig();
    config.level = level;

    // Update electron-log transports
    log.transports.file.level = level;
    log.transports.console.level = level;
  }

  /**
   * Get current log level
   * @returns {string} Current log level
   */
  getLevel() {
    const config = this._getConfig();
    return config.level;
  }

  /**
   * Get current namespace
   * @returns {string} Current namespace
   */
  getNamespace() {
    const config = this._getConfig();
    return config.namespace;
  }

  /**
   * Get log file path
   * @returns {string} Path to log file
   */
  getLogFilePath() {
    return log.transports.file.getFile().path;
  }

  /**
   * Clear log file (use with caution)
   * @returns {Promise<void>}
   */
  async clearLogs() {
    try {
      const logFile = log.transports.file.getFile();
      await logFile.clear();
      this.info('Log file cleared');
    } catch (error) {
      this.error('Failed to clear log file', { error: error.message });
      throw error;
    }
  }

  /**
   * Get logger statistics
   * @returns {Object} Logger stats (level, namespace, logFile)
   */
  getStats() {
    const config = this._getConfig();
    const context = this._getContext();

    return {
      level: config.level,
      namespace: config.namespace,
      format: config.format,
      context: { ...context },
      logFile: this.getLogFilePath()
    };
  }
}

module.exports = Logger;
