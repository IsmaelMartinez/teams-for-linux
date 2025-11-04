/**
 * EventBus - Singleton event emitter for application-wide events
 * Supports namespaced events (e.g., 'shell.window.created')
 * Provides event history for debugging
 */
class EventBus {
  constructor() {
    this._listeners = new Map();
    this._eventHistory = [];
    this._maxHistorySize = 100;
  }

  /**
   * Subscribe to an event
   * @param {string} event - Event name (supports namespaces like 'shell.window.created')
   * @param {Function} handler - Event handler function
   * @param {Object} context - Optional context for the handler
   * @returns {Function} Unsubscribe function
   */
  on(event, handler, context = null) {
    if (typeof handler !== 'function') {
      throw new TypeError('Handler must be a function');
    }

    if (!this._listeners.has(event)) {
      this._listeners.set(event, []);
    }

    const listener = { handler, context };
    this._listeners.get(event).push(listener);

    // Return unsubscribe function
    return () => this.off(event, handler);
  }

  /**
   * Emit an event to all subscribers
   * @param {string} event - Event name
   * @param {*} data - Event data
   */
  emit(event, data) {
    // Add to history for debugging
    this._addToHistory(event, data);

    // Get direct listeners
    const listeners = this._listeners.get(event) || [];

    // Get wildcard listeners for namespaced events
    const wildcardListeners = this._getWildcardListeners(event);

    const allListeners = [...listeners, ...wildcardListeners];

    allListeners.forEach(({ handler, context }) => {
      try {
        if (context) {
          handler.call(context, data);
        } else {
          handler(data);
        }
      } catch (error) {
        console.error(`Error in event handler for '${event}':`, error);
      }
    });
  }

  /**
   * Unsubscribe from an event
   * @param {string} event - Event name
   * @param {Function} handler - Handler to remove (if not provided, removes all)
   */
  off(event, handler = null) {
    if (!this._listeners.has(event)) {
      return;
    }

    if (!handler) {
      this._listeners.delete(event);
      return;
    }

    const listeners = this._listeners.get(event);
    const filtered = listeners.filter(l => l.handler !== handler);

    if (filtered.length === 0) {
      this._listeners.delete(event);
    } else {
      this._listeners.set(event, filtered);
    }
  }

  /**
   * Get wildcard listeners for namespaced events
   * @param {string} event - Event name
   * @returns {Array} Array of matching wildcard listeners
   * @private
   */
  _getWildcardListeners(event) {
    const wildcardListeners = [];
    const parts = event.split('.');

    // Check for wildcard patterns (e.g., 'shell.*' for 'shell.window.created')
    for (let i = 1; i <= parts.length; i++) {
      const pattern = parts.slice(0, i).join('.') + '.*';
      const listeners = this._listeners.get(pattern) || [];
      wildcardListeners.push(...listeners);
    }

    return wildcardListeners;
  }

  /**
   * Add event to history for debugging
   * @param {string} event - Event name
   * @param {*} data - Event data
   * @private
   */
  _addToHistory(event, data) {
    this._eventHistory.push({
      event,
      data,
      timestamp: Date.now()
    });

    // Keep history size limited
    if (this._eventHistory.length > this._maxHistorySize) {
      this._eventHistory.shift();
    }
  }

  /**
   * Get event history for debugging
   * @param {number} limit - Maximum number of events to return
   * @returns {Array} Recent events
   */
  getHistory(limit = 10) {
    return this._eventHistory.slice(-limit);
  }

  /**
   * Clear all listeners and history
   */
  clear() {
    this._listeners.clear();
    this._eventHistory = [];
  }

  /**
   * Get active listener count for an event
   * @param {string} event - Event name
   * @returns {number} Number of listeners
   */
  listenerCount(event) {
    const listeners = this._listeners.get(event) || [];
    return listeners.length;
  }
}

// Singleton instance
let instance = null;

module.exports = {
  /**
   * Get EventBus singleton instance
   * @returns {EventBus} Singleton instance
   */
  getInstance() {
    if (!instance) {
      instance = new EventBus();
    }
    return instance;
  },

  /**
   * Reset singleton instance (for testing)
   */
  resetInstance() {
    if (instance) {
      instance.clear();
    }
    instance = null;
  }
};
