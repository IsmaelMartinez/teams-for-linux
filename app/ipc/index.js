/**
 * IPC Module Entry Point
 * 
 * Provides a unified interface to the IPC organization system.
 * This module exports all the key components for managing IPC handlers.
 */

const ipcManager = require('./manager');
const ipcRegistry = require('./registry');
const ipcCompatibility = require('./compatibility');
const ipcBenchmark = require('./benchmark');

/**
 * Initialize the IPC system
 * @param {Object} options - Initialization options
 */
function initializeIPC(options = {}) {
  console.info('[IPC] Initializing IPC organization system');
  
  // Initialize core components
  ipcManager.initialize();
  ipcCompatibility.initialize();
  
  // Log system ready
  console.info('[IPC] IPC organization system ready');
  console.debug('[IPC] Available components:', {
    manager: 'Core IPC handler management',
    registry: 'Module-based handler registration',
    compatibility: 'Backward compatibility and migration support',
    benchmark: 'Performance monitoring and baseline tracking'
  });
}

/**
 * Get system status information
 * @returns {Object} Status information
 */
function getSystemStatus() {
  return {
    manager: {
      initialized: ipcManager.isInitialized,
      handlerCount: ipcManager.getHandlerCount(),
      handlers: ipcManager.getHandlerInfo()
    },
    registry: {
      moduleCount: ipcRegistry.getModuleCount(),
      modules: ipcRegistry.getModuleInfo()
    },
    compatibility: {
      trackedHandlers: ipcCompatibility.getTrackedHandlers().length
    },
    benchmark: {
      channelCount: ipcBenchmark.getAllMetrics().length,
      summary: ipcBenchmark.getSummary()
    }
  };
}

/**
 * Shutdown and cleanup IPC system
 */
function shutdownIPC() {
  console.info('[IPC] Shutting down IPC organization system');
  
  // Clean up components
  ipcManager.removeAllHandlers();
  ipcCompatibility.cleanup();
  ipcBenchmark.clearMetrics();
  
  console.info('[IPC] IPC organization system shutdown complete');
}

// Export components and utilities
module.exports = {
  // Core components
  manager: ipcManager,
  registry: ipcRegistry,
  compatibility: ipcCompatibility,
  benchmark: ipcBenchmark,
  
  // System management
  initialize: initializeIPC,
  getStatus: getSystemStatus,
  shutdown: shutdownIPC,
  
  // Convenience methods for common operations
  registerHandler: (channel, handler, options) => ipcManager.handle(channel, handler, options),
  registerListener: (channel, handler, options) => ipcManager.on(channel, handler, options),
  registerModule: (name, handlers) => ipcRegistry.registerModule(name, handlers),
  removeHandler: (channel) => ipcManager.removeHandler(channel),
  
  // Performance monitoring
  wrapHandler: (channel, handler) => ipcBenchmark.wrapHandler(channel, handler),
  getMetrics: () => ipcBenchmark.getAllMetrics(),
  saveBaseline: (name) => ipcBenchmark.saveBaseline(name)
};