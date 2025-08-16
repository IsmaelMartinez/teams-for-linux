const { ipcMain } = require('electron');

/**
 * Simple IPC Manager for Teams for Linux
 * 
 * Provides a basic registry for organizing IPC handlers while maintaining
 * existing JavaScript patterns and Electron security (no sandbox: false).
 * 
 * Design principles:
 * - Use existing ipcMain.handle/on patterns
 * - Simple handler organization
 * - No external runtime dependencies
 * - Maintain backward compatibility
 */
class IPCManager {
  constructor() {
    this.handlers = new Map();
    this.isInitialized = false;
  }

  /**
   * Initialize the IPC manager
   */
  initialize() {
    if (this.isInitialized) {
      console.warn('[IPC-Manager] IPC Manager already initialized');
      return;
    }

    console.info('[IPC-Manager] Initializing IPC Manager');
    this.isInitialized = true;
  }

  /**
   * Register an IPC handler using ipcMain.handle (request-response pattern)
   * @param {string} channel - IPC channel name
   * @param {Function} handler - Handler function
   * @param {Object} options - Handler options
   */
  handle(channel, handler, options = {}) {
    if (this.handlers.has(channel)) {
      console.warn(`[IPC-Manager] Handler for channel '${channel}' already registered, overwriting`);
    }

    // Wrap handler for logging and error handling
    const wrappedHandler = async (event, ...args) => {
      try {
        console.debug(`[IPC-Manager] IPC handle request: ${channel}`, { args: options.logArgs ? args : '[hidden]' });
        const result = await handler(event, ...args);
        console.debug(`[IPC-Manager] IPC handle response: ${channel}`, { result: options.logResult ? result : '[hidden]' });
        return result;
      } catch (error) {
        console.error(`[IPC-Manager] IPC handle error on channel '${channel}':`, error);
        throw error;
      }
    };

    ipcMain.handle(channel, wrappedHandler);
    
    this.handlers.set(channel, {
      type: 'handle',
      handler: wrappedHandler,
      originalHandler: handler,
      options,
      registeredAt: new Date()
    });

    console.debug(`[IPC-Manager] Registered IPC handler: ${channel}`);
  }

  /**
   * Register an IPC listener using ipcMain.on (fire-and-forget pattern)
   * @param {string} channel - IPC channel name
   * @param {Function} handler - Handler function
   * @param {Object} options - Handler options
   */
  on(channel, handler, options = {}) {
    if (this.handlers.has(channel)) {
      console.warn(`[IPC-Manager] Listener for channel '${channel}' already registered, overwriting`);
    }

    // Wrap handler for logging and error handling
    const wrappedHandler = (event, ...args) => {
      try {
        console.debug(`[IPC-Manager] IPC event received: ${channel}`, { args: options.logArgs ? args : '[hidden]' });
        handler(event, ...args);
      } catch (error) {
        console.error(`[IPC-Manager] IPC event error on channel '${channel}':`, error);
        // Don't rethrow for 'on' handlers as there's no response expected
      }
    };

    ipcMain.on(channel, wrappedHandler);
    
    this.handlers.set(channel, {
      type: 'on',
      handler: wrappedHandler,
      originalHandler: handler,
      options,
      registeredAt: new Date()
    });

    console.debug(`[IPC-Manager] Registered IPC listener: ${channel}`);
  }

  /**
   * Register an IPC listener using ipcMain.once (one-time handler)
   * @param {string} channel - IPC channel name
   * @param {Function} handler - Handler function
   * @param {Object} options - Handler options
   */
  once(channel, handler, options = {}) {
    // Wrap handler for logging
    const wrappedHandler = (event, ...args) => {
      try {
        console.debug(`[IPC-Manager] IPC once event received: ${channel}`, { args: options.logArgs ? args : '[hidden]' });
        handler(event, ...args);
        // Remove from our registry since it's a one-time handler
        this.handlers.delete(channel);
      } catch (error) {
        console.error(`[IPC-Manager] IPC once event error on channel '${channel}':`, error);
      }
    };

    ipcMain.once(channel, wrappedHandler);
    
    this.handlers.set(channel, {
      type: 'once',
      handler: wrappedHandler,
      originalHandler: handler,
      options,
      registeredAt: new Date()
    });

    console.debug(`[IPC-Manager] Registered IPC once listener: ${channel}`);
  }

  /**
   * Remove a handler for a specific channel
   * @param {string} channel - IPC channel name
   */
  removeHandler(channel) {
    const handlerInfo = this.handlers.get(channel);
    if (!handlerInfo) {
      console.warn(`[IPC-Manager] No handler found for channel '${channel}'`);
      return false;
    }

    if (handlerInfo.type === 'handle') {
      ipcMain.removeHandler(channel);
    } else {
      ipcMain.removeListener(channel, handlerInfo.handler);
    }

    this.handlers.delete(channel);
    console.debug(`[IPC-Manager] Removed IPC handler: ${channel}`);
    return true;
  }

  /**
   * Remove all registered handlers (cleanup)
   */
  removeAllHandlers() {
    console.info('Removing all IPC handlers');
    
    for (const [channel, handlerInfo] of this.handlers) {
      if (handlerInfo.type === 'handle') {
        ipcMain.removeHandler(channel);
      } else {
        ipcMain.removeListener(channel, handlerInfo.handler);
      }
    }

    this.handlers.clear();
    console.info('All IPC handlers removed');
  }

  /**
   * Get information about registered handlers
   * @returns {Array} Array of handler information
   */
  getHandlerInfo() {
    const info = [];
    for (const [channel, handlerInfo] of this.handlers) {
      info.push({
        channel,
        type: handlerInfo.type,
        registeredAt: handlerInfo.registeredAt,
        options: handlerInfo.options
      });
    }
    return info.sort((a, b) => a.channel.localeCompare(b.channel));
  }

  /**
   * Check if a handler is registered for a channel
   * @param {string} channel - IPC channel name
   * @returns {boolean}
   */
  hasHandler(channel) {
    return this.handlers.has(channel);
  }

  /**
   * Get the number of registered handlers
   * @returns {number}
   */
  getHandlerCount() {
    return this.handlers.size;
  }
}

// Export singleton instance
const ipcManager = new IPCManager();
module.exports = ipcManager;