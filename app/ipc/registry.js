const ipcManager = require('./manager');

/**
 * IPC Handler Registry
 * 
 * Provides utilities for registering and organizing IPC handlers
 * following existing JavaScript patterns.
 */
class IPCRegistry {
  constructor() {
    this.modules = new Map();
  }

  /**
   * Register a module's IPC handlers
   * @param {string} moduleName - Name of the module
   * @param {Object} handlers - Object containing handler definitions
   */
  registerModule(moduleName, handlers) {
    if (this.modules.has(moduleName)) {
      console.warn(`[IPC-Registry] Module '${moduleName}' already registered, overwriting`);
    }

    const registeredHandlers = [];

    for (const [channel, handlerDef] of Object.entries(handlers)) {
      try {
        this.registerHandler(channel, handlerDef);
        registeredHandlers.push(channel);
      } catch (error) {
        console.error(`[IPC-Registry] Failed to register handler '${channel}' for module '${moduleName}':`, error);
      }
    }

    this.modules.set(moduleName, {
      handlers: registeredHandlers,
      registeredAt: new Date()
    });

    console.info(`[IPC-Registry] Registered module '${moduleName}' with ${registeredHandlers.length} handlers`);
  }

  /**
   * Register a single IPC handler
   * @param {string} channel - IPC channel name
   * @param {Object|Function} handlerDef - Handler definition or function
   */
  registerHandler(channel, handlerDef) {
    // Support both function and object definitions
    if (typeof handlerDef === 'function') {
      // Default to 'handle' type for functions
      ipcManager.handle(channel, handlerDef);
    } else if (typeof handlerDef === 'object' && handlerDef.handler) {
      const { type = 'handle', handler, options = {} } = handlerDef;
      
      switch (type) {
        case 'handle':
          ipcManager.handle(channel, handler, options);
          break;
        case 'on':
          ipcManager.on(channel, handler, options);
          break;
        case 'once':
          ipcManager.once(channel, handler, options);
          break;
        default:
          throw new Error(`Unknown handler type: ${type}`);
      }
    } else {
      throw new Error(`Invalid handler definition for channel '${channel}'`);
    }
  }

  /**
   * Unregister a module's handlers
   * @param {string} moduleName - Name of the module
   */
  unregisterModule(moduleName) {
    const moduleInfo = this.modules.get(moduleName);
    if (!moduleInfo) {
      console.warn(`[IPC-Registry] Module '${moduleName}' not found`);
      return false;
    }

    let removedCount = 0;
    for (const channel of moduleInfo.handlers) {
      if (ipcManager.removeHandler(channel)) {
        removedCount++;
      }
    }

    this.modules.delete(moduleName);
    console.info(`[IPC-Registry] Unregistered module '${moduleName}', removed ${removedCount} handlers`);
    return true;
  }

  /**
   * Get information about registered modules
   * @returns {Array} Array of module information
   */
  getModuleInfo() {
    const info = [];
    for (const [moduleName, moduleInfo] of this.modules) {
      info.push({
        name: moduleName,
        handlerCount: moduleInfo.handlers.length,
        handlers: moduleInfo.handlers,
        registeredAt: moduleInfo.registeredAt
      });
    }
    return info.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Validate that all registered handlers are working
   * @returns {Object} Validation results
   */
  validateHandlers() {
    const results = {
      total: 0,
      valid: 0,
      invalid: [],
      modules: {}
    };

    for (const [moduleName, moduleInfo] of this.modules) {
      const moduleResults = {
        total: moduleInfo.handlers.length,
        valid: 0,
        invalid: []
      };

      for (const channel of moduleInfo.handlers) {
        results.total++;
        moduleResults.total++;

        if (ipcManager.hasHandler(channel)) {
          results.valid++;
          moduleResults.valid++;
        } else {
          const issue = `Handler for '${channel}' not found in IPC manager`;
          results.invalid.push({ channel, module: moduleName, issue });
          moduleResults.invalid.push({ channel, issue });
        }
      }

      results.modules[moduleName] = moduleResults;
    }

    return results;
  }

  /**
   * Get the number of registered modules
   * @returns {number}
   */
  getModuleCount() {
    return this.modules.size;
  }

  /**
   * Check if a module is registered
   * @param {string} moduleName - Name of the module
   * @returns {boolean}
   */
  hasModule(moduleName) {
    return this.modules.has(moduleName);
  }
}

// Export singleton instance
const ipcRegistry = new IPCRegistry();
module.exports = ipcRegistry;