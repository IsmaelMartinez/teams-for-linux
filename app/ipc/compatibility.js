const { ipcMain } = require('electron');

/**
 * Backward Compatibility Layer for IPC
 * 
 * Ensures existing ipcMain handlers continue working during migration.
 * Provides utilities to detect and handle conflicts between old and new handlers.
 */
class IPCCompatibility {
  constructor() {
    this.existingHandlers = new Set();
    this.initialized = false;
  }

  /**
   * Initialize compatibility layer by scanning existing handlers
   */
  initialize() {
    if (this.initialized) {
      return;
    }

    // Note: Electron doesn't provide a way to enumerate existing handlers,
    // so we'll track them as they're registered through our system
    console.info('IPC Compatibility layer initialized');
    this.initialized = true;
  }

  /**
   * Check if a channel has an existing handler
   * @param {string} channel - IPC channel name
   * @returns {boolean}
   */
  hasExistingHandler(channel) {
    return this.existingHandlers.has(channel);
  }

  /**
   * Register an existing handler (for tracking purposes)
   * @param {string} channel - IPC channel name
   * @param {string} type - Handler type ('handle', 'on', 'once')
   */
  trackExistingHandler(channel, type = 'unknown') {
    this.existingHandlers.add(channel);
    console.debug(`[IPC-Compatibility] Tracking existing ${type} handler: ${channel}`);
  }

  /**
   * Remove tracking for a handler
   * @param {string} channel - IPC channel name
   */
  untrackHandler(channel) {
    this.existingHandlers.delete(channel);
    console.debug(`[IPC-Compatibility] Stopped tracking handler: ${channel}`);
  }

  /**
   * Safely register a new handler, checking for conflicts
   * @param {string} channel - IPC channel name
   * @param {Function} handler - Handler function
   * @param {string} type - Handler type ('handle', 'on', 'once')
   * @param {Object} options - Registration options
   */
  safeRegister(channel, handler, type = 'handle', options = {}) {
    if (this.hasExistingHandler(channel)) {
      if (options.overwrite) {
        console.warn(`[IPC-Compatibility] Overwriting existing ${type} handler for channel: ${channel}`);
        this.removeExistingHandler(channel, type);
      } else {
        console.error(`[IPC-Compatibility] Handler already exists for channel '${channel}' and overwrite not allowed`);
        throw new Error(`Handler conflict for channel: ${channel}`);
      }
    }

    // Register the new handler
    switch (type) {
      case 'handle':
        ipcMain.handle(channel, handler);
        break;
      case 'on':
        ipcMain.on(channel, handler);
        break;
      case 'once':
        ipcMain.once(channel, handler);
        break;
      default:
        throw new Error(`Unknown handler type: ${type}`);
    }

    this.trackExistingHandler(channel, type);
    console.debug(`[IPC-Compatibility] Safely registered ${type} handler: ${channel}`);
  }

  /**
   * Remove an existing handler
   * @param {string} channel - IPC channel name
   * @param {string} type - Handler type
   */
  removeExistingHandler(channel, type) {
    try {
      if (type === 'handle') {
        ipcMain.removeHandler(channel);
      } else {
        // For 'on' and 'once', we can't remove specific handlers without the reference,
        // so we log a warning
        console.warn(`[IPC-Compatibility] Cannot automatically remove '${type}' handler for channel '${channel}' - manual cleanup required`);
      }
      
      this.untrackHandler(channel);
    } catch (error) {
      console.error(`[IPC-Compatibility] Failed to remove existing handler for '${channel}':`, error);
    }
  }

  /**
   * Get a list of all tracked handlers
   * @returns {Array} Array of channel names
   */
  getTrackedHandlers() {
    return Array.from(this.existingHandlers).sort();
  }

  /**
   * Clean up all tracked handlers
   */
  cleanup() {
    const channels = Array.from(this.existingHandlers);
    
    for (const channel of channels) {
      try {
        // Try to remove handle-type handlers
        ipcMain.removeHandler(channel);
        console.debug(`[IPC-Compatibility] Cleaned up handler: ${channel}`);
      } catch (error) {
        // Ignore errors - handler might not be a 'handle' type
      }
    }

    this.existingHandlers.clear();
    console.info('Cleaned up all tracked handlers');
  }

  /**
   * Create a migration helper for gradually moving handlers
   * @param {string} oldChannel - Old channel name
   * @param {string} newChannel - New channel name
   * @param {Function} handler - Handler function
   * @param {string} type - Handler type
   */
  createMigrationBridge(oldChannel, newChannel, handler, type = 'handle') {
    // Register the new handler
    this.safeRegister(newChannel, handler, type, { overwrite: false });

    // Create a bridge from old to new
    const bridgeHandler = async (event, ...args) => {
      console.warn(`[IPC-Compatibility] Deprecated IPC channel used: '${oldChannel}' - please migrate to '${newChannel}'`);
      
      // Forward to the new handler
      if (type === 'handle') {
        return await handler(event, ...args);
      } else {
        handler(event, ...args);
      }
    };

    this.safeRegister(oldChannel, bridgeHandler, type, { overwrite: true });
    
    console.info(`[IPC-Compatibility] Created migration bridge: ${oldChannel} -> ${newChannel}`);
  }
}

// Export singleton instance
const ipcCompatibility = new IPCCompatibility();
module.exports = ipcCompatibility;