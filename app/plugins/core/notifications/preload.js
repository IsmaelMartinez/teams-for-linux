/**
 * Notifications Plugin Preload Script
 *
 * Provides safe notification API bridge between renderer and main process.
 * Validates inputs, sanitizes data, and exposes clean API via window.teamsNotifications.
 *
 * Note: Since contextIsolation is false, this provides a cleaner API interface
 * rather than strict security isolation.
 */

const { ipcRenderer } = require('electron');

/**
 * Validate notification options
 * @param {Object} notification - Notification data
 * @returns {boolean} Valid or not
 * @private
 */
function validateNotification(notification) {
  if (!notification || typeof notification !== 'object') {
    return false;
  }

  // Title is required
  if (typeof notification.title !== 'string' || notification.title.length === 0) {
    return false;
  }

  // Body is optional but must be string if provided
  if (notification.body !== undefined && typeof notification.body !== 'string') {
    return false;
  }

  // Validate string lengths to prevent abuse
  if (notification.title.length > 500 ||
      (notification.body && notification.body.length > 2000)) {
    return false;
  }

  return true;
}

/**
 * Sanitize notification data
 * @param {Object} notification - Raw notification data
 * @returns {Object} Sanitized notification
 * @private
 */
function sanitizeNotification(notification) {
  const sanitized = {
    title: String(notification.title).substring(0, 500),
    body: notification.body ? String(notification.body).substring(0, 2000) : '',
  };

  // Optional fields with validation
  if (notification.icon && typeof notification.icon === 'string') {
    sanitized.icon = String(notification.icon).substring(0, 1000);
  }

  if (notification.tag && typeof notification.tag === 'string') {
    sanitized.tag = String(notification.tag).substring(0, 100);
  }

  if (notification.urgency && ['low', 'normal', 'critical'].includes(notification.urgency)) {
    sanitized.urgency = notification.urgency;
  }

  if (notification.silent !== undefined) {
    sanitized.silent = Boolean(notification.silent);
  }

  // Include data payload if it's a plain object
  if (notification.data && typeof notification.data === 'object') {
    try {
      // Ensure it's serializable and reasonable size
      const serialized = JSON.stringify(notification.data);
      if (serialized.length < 10000) {
        sanitized.data = notification.data;
      }
    } catch (error) {
      console.warn('Notification data is not serializable:', error);
    }
  }

  return sanitized;
}

/**
 * Notification event handlers storage
 * @private
 */
const eventHandlers = {
  shown: [],
  clicked: [],
  closed: [],
  failed: []
};

/**
 * Setup IPC event listeners
 * @private
 */
function setupEventListeners() {
  // Notification shown event
  ipcRenderer.on('notification:shown', (event, data) => {
    eventHandlers.shown.forEach(handler => {
      try {
        handler(data);
      } catch (error) {
        console.error('Error in notification shown handler:', error);
      }
    });
  });

  // Notification clicked event
  ipcRenderer.on('notification:clicked', (event, data) => {
    eventHandlers.clicked.forEach(handler => {
      try {
        handler(data);
      } catch (error) {
        console.error('Error in notification clicked handler:', error);
      }
    });
  });

  // Notification closed event
  ipcRenderer.on('notification:closed', (event, data) => {
    eventHandlers.closed.forEach(handler => {
      try {
        handler(data);
      } catch (error) {
        console.error('Error in notification closed handler:', error);
      }
    });
  });

  // Notification failed event
  ipcRenderer.on('notification:failed', (event, error) => {
    eventHandlers.failed.forEach(handler => {
      try {
        handler(error);
      } catch (error) {
        console.error('Error in notification failed handler:', error);
      }
    });
  });

  // Badge count updated
  ipcRenderer.on('notification:badge-updated', (event, data) => {
    // Emit custom event for badge updates
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('badge-count-updated', {
        detail: { count: data.count }
      }));
    }
  });
}

/**
 * Exposed notification API
 * @namespace window.teamsNotifications
 */
const teamsNotifications = {
  /**
   * Show a notification
   * @param {Object} notification - Notification options
   * @param {string} notification.title - Notification title (required)
   * @param {string} [notification.body] - Notification body
   * @param {string} [notification.icon] - Notification icon URL
   * @param {string} [notification.tag] - Notification tag for grouping
   * @param {string} [notification.urgency] - Urgency level: 'low', 'normal', 'critical'
   * @param {boolean} [notification.silent] - Silent notification (no sound)
   * @param {Object} [notification.data] - Custom data payload
   * @returns {Promise<string>} Notification ID
   */
  show(notification) {
    return new Promise((resolve, reject) => {
      // Validate input
      if (!validateNotification(notification)) {
        reject(new Error('Invalid notification options'));
        return;
      }

      // Sanitize data
      const sanitized = sanitizeNotification(notification);

      // Send to main process
      ipcRenderer.invoke('plugin:notification:show', sanitized)
        .then(notificationId => {
          resolve(notificationId);
        })
        .catch(error => {
          reject(new Error(`Failed to show notification: ${error.message}`));
        });
    });
  },

  /**
   * Request notification permission
   * @returns {Promise<string>} Permission status: 'granted', 'denied', or 'default'
   */
  requestPermission() {
    return ipcRenderer.invoke('plugin:notification:request-permission');
  },

  /**
   * Get current notification permission
   * @returns {Promise<string>} Permission status
   */
  getPermission() {
    return ipcRenderer.invoke('plugin:notification:get-permission');
  },

  /**
   * Clear all active notifications
   * @returns {Promise<void>}
   */
  clearAll() {
    return ipcRenderer.invoke('plugin:notification:clear-all');
  },

  /**
   * Set badge count
   * @param {number} count - Badge count
   * @returns {Promise<void>}
   */
  setBadgeCount(count) {
    if (typeof count !== 'number' || count < 0 || count > 9999) {
      return Promise.reject(new Error('Invalid badge count'));
    }
    return ipcRenderer.invoke('plugin:notification:set-badge-count', count);
  },

  /**
   * Get current badge count
   * @returns {Promise<number>} Badge count
   */
  getBadgeCount() {
    return ipcRenderer.invoke('plugin:notification:get-badge-count');
  },

  /**
   * Set sound enabled/disabled
   * @param {boolean} enabled - Enable or disable sound
   * @returns {Promise<void>}
   */
  setSoundEnabled(enabled) {
    return ipcRenderer.invoke('plugin:notification:set-sound-enabled', Boolean(enabled));
  },

  /**
   * Get notification count
   * @returns {Promise<number>} Active notification count
   */
  getActiveCount() {
    return ipcRenderer.invoke('plugin:notification:get-active-count');
  },

  /**
   * Register event handler for notification shown
   * @param {Function} callback - Event handler
   * @returns {Function} Unsubscribe function
   */
  onShown(callback) {
    if (typeof callback !== 'function') {
      throw new Error('Callback must be a function');
    }
    eventHandlers.shown.push(callback);

    // Return unsubscribe function
    return () => {
      const index = eventHandlers.shown.indexOf(callback);
      if (index > -1) {
        eventHandlers.shown.splice(index, 1);
      }
    };
  },

  /**
   * Register event handler for notification clicked
   * @param {Function} callback - Event handler
   * @returns {Function} Unsubscribe function
   */
  onClicked(callback) {
    if (typeof callback !== 'function') {
      throw new Error('Callback must be a function');
    }
    eventHandlers.clicked.push(callback);

    return () => {
      const index = eventHandlers.clicked.indexOf(callback);
      if (index > -1) {
        eventHandlers.clicked.splice(index, 1);
      }
    };
  },

  /**
   * Register event handler for notification closed
   * @param {Function} callback - Event handler
   * @returns {Function} Unsubscribe function
   */
  onClosed(callback) {
    if (typeof callback !== 'function') {
      throw new Error('Callback must be a function');
    }
    eventHandlers.closed.push(callback);

    return () => {
      const index = eventHandlers.closed.indexOf(callback);
      if (index > -1) {
        eventHandlers.closed.splice(index, 1);
      }
    };
  },

  /**
   * Register event handler for notification failed
   * @param {Function} callback - Event handler
   * @returns {Function} Unsubscribe function
   */
  onFailed(callback) {
    if (typeof callback !== 'function') {
      throw new Error('Callback must be a function');
    }
    eventHandlers.failed.push(callback);

    return () => {
      const index = eventHandlers.failed.indexOf(callback);
      if (index > -1) {
        eventHandlers.failed.splice(index, 1);
      }
    };
  },

  /**
   * Remove all event listeners
   */
  removeAllListeners() {
    eventHandlers.shown = [];
    eventHandlers.clicked = [];
    eventHandlers.closed = [];
    eventHandlers.failed = [];
  }
};

// Initialize event listeners
setupEventListeners();

// Expose API to renderer process
// Since contextIsolation is false, we can directly assign to window
if (typeof window !== 'undefined') {
  window.teamsNotifications = teamsNotifications;
}

// Also expose via globalThis for consistency
if (typeof globalThis !== 'undefined') {
  globalThis.teamsNotifications = teamsNotifications;
}

module.exports = teamsNotifications;
