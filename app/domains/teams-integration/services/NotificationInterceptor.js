const { Notification } = require('electron');
const path = require('path');

/**
 * NotificationInterceptor Service
 *
 * Intercepts web notifications and bridges them to native system notifications.
 * Manages notification lifecycle, sounds, permissions, and badge counts.
 *
 * Events emitted:
 * - notification:intercepted { id, title, body, data }
 * - notification:shown { id, notification }
 * - notification:clicked { id, data }
 * - notification:closed { id }
 * - notification:failed { error }
 * - notification:badge-updated { count }
 * - notification:permission-changed { permission }
 */
class NotificationInterceptor {
  constructor(config, eventBus) {
    this._config = config;
    this._eventBus = eventBus;
    this._notifications = new Map();
    this._badgeCount = 0;
    this._soundEnabled = true;
    this._permission = 'default';
    this._initialized = false;

    this._initialize();
  }

  /**
   * Initialize the interceptor
   * @private
   */
  _initialize() {
    if (this._initialized) {
      return;
    }

    // Check if notifications are supported
    if (!Notification.isSupported()) {
      console.warn('System notifications are not supported on this platform');
      this._permission = 'denied';
      return;
    }

    // Load configuration
    this._soundEnabled = this._config.get('notifications.soundEnabled', true);
    this._permission = 'granted'; // Electron doesn't need explicit permission

    this._initialized = true;
    this._emitEvent('notification:initialized', { supported: true });
  }

  /**
   * Intercept a web notification and bridge to system
   * @param {Object} notification - Notification data from web
   * @param {string} notification.title - Notification title
   * @param {string} notification.body - Notification body
   * @param {string} [notification.icon] - Notification icon URL
   * @param {string} [notification.tag] - Notification tag
   * @param {Object} [notification.data] - Additional data
   * @returns {string} Notification ID
   */
  interceptNotification(notification) {
    if (!this._initialized || this._permission !== 'granted') {
      this._emitEvent('notification:failed', {
        error: 'Notifications not initialized or permission denied'
      });
      return null;
    }

    const id = this._generateId();
    const notificationData = {
      id,
      title: notification.title || 'Microsoft Teams',
      body: notification.body || '',
      icon: notification.icon,
      tag: notification.tag,
      data: notification.data || {},
      timestamp: Date.now()
    };

    this._emitEvent('notification:intercepted', notificationData);

    // Show system notification
    this.showSystemNotification(notificationData);

    return id;
  }

  /**
   * Show native system notification
   * @param {Object} options - Notification options
   */
  showSystemNotification(options) {
    try {
      const notificationOptions = {
        title: options.title,
        body: options.body,
        silent: !this._soundEnabled,
        urgency: options.urgency || 'normal',
        timeoutType: 'default'
      };

      // Add icon if provided and valid
      if (options.icon) {
        notificationOptions.icon = this._resolveIcon(options.icon);
      }

      // Create system notification
      const systemNotification = new Notification(notificationOptions);

      // Store notification reference
      this._notifications.set(options.id, {
        system: systemNotification,
        data: options.data,
        tag: options.tag,
        timestamp: options.timestamp
      });

      // Set up event handlers
      systemNotification.on('click', () => {
        this._handleNotificationClick(options.id);
      });

      systemNotification.on('close', () => {
        this._handleNotificationClose(options.id);
      });

      systemNotification.on('failed', (error) => {
        this._handleNotificationFailed(options.id, error);
      });

      // Show notification
      systemNotification.show();

      // Update badge count
      this._incrementBadgeCount();

      // Handle sound
      if (this._soundEnabled && options.sound !== false) {
        this.handleSound(options.sound || {});
      }

      this._emitEvent('notification:shown', {
        id: options.id,
        notification: options
      });

    } catch (error) {
      this._emitEvent('notification:failed', {
        id: options.id,
        error: error.message
      });
    }
  }

  /**
   * Handle notification click
   * @private
   */
  _handleNotificationClick(id) {
    const notification = this._notifications.get(id);
    if (notification) {
      this._emitEvent('notification:clicked', {
        id,
        data: notification.data,
        tag: notification.tag
      });

      // Decrement badge count
      this._decrementBadgeCount();

      // Clean up
      this._notifications.delete(id);
    }
  }

  /**
   * Handle notification close
   * @private
   */
  _handleNotificationClose(id) {
    const notification = this._notifications.get(id);
    if (notification) {
      this._emitEvent('notification:closed', { id });

      // Decrement badge count if not clicked
      this._decrementBadgeCount();

      // Clean up
      this._notifications.delete(id);
    }
  }

  /**
   * Handle notification failure
   * @private
   */
  _handleNotificationFailed(id, error) {
    this._emitEvent('notification:failed', {
      id,
      error: error.message
    });
    this._notifications.delete(id);
  }

  /**
   * Update badge count
   * @param {number} count - New badge count
   */
  updateBadgeCount(count) {
    this._badgeCount = Math.max(0, count);
    this._emitEvent('notification:badge-updated', {
      count: this._badgeCount
    });
  }

  /**
   * Increment badge count
   * @private
   */
  _incrementBadgeCount() {
    this._badgeCount++;
    this._emitEvent('notification:badge-updated', {
      count: this._badgeCount
    });
  }

  /**
   * Decrement badge count
   * @private
   */
  _decrementBadgeCount() {
    if (this._badgeCount > 0) {
      this._badgeCount--;
      this._emitEvent('notification:badge-updated', {
        count: this._badgeCount
      });
    }
  }

  /**
   * Handle notification sound
   * @param {Object} soundConfig - Sound configuration
   */
  handleSound(soundConfig = {}) {
    if (!this._soundEnabled) {
      return;
    }

    // System notifications handle sound automatically
    // This method is a hook for custom sound handling if needed
    this._emitEvent('notification:sound-played', soundConfig);
  }

  /**
   * Toggle sound enabled/disabled
   * @param {boolean} enabled - Enable or disable sound
   */
  setSoundEnabled(enabled) {
    this._soundEnabled = enabled;
    this._config.set('notifications.soundEnabled', enabled);
    this._emitEvent('notification:sound-toggled', { enabled });
  }

  /**
   * Check notification permission
   * @returns {string} Permission status: 'granted', 'denied', or 'default'
   */
  checkPermission() {
    return this._permission;
  }

  /**
   * Request notification permission
   * @returns {Promise<string>} Permission status
   */
  async requestPermission() {
    // Electron automatically has permission for system notifications
    if (Notification.isSupported()) {
      this._permission = 'granted';
    } else {
      this._permission = 'denied';
    }

    this._emitEvent('notification:permission-changed', {
      permission: this._permission
    });

    return this._permission;
  }

  /**
   * Clear all active notifications
   */
  clearAll() {
    this._notifications.forEach((notification, id) => {
      try {
        notification.system.close();
      } catch (error) {
        console.error(`Failed to close notification ${id}:`, error);
      }
    });

    this._notifications.clear();
    this.updateBadgeCount(0);
    this._emitEvent('notification:all-cleared', {});
  }

  /**
   * Get active notification count
   * @returns {number}
   */
  getActiveCount() {
    return this._notifications.size;
  }

  /**
   * Get badge count
   * @returns {number}
   */
  getBadgeCount() {
    return this._badgeCount;
  }

  /**
   * Resolve icon path
   * @private
   */
  _resolveIcon(iconPath) {
    if (!iconPath) {
      return null;
    }

    // If it's a URL, return as-is
    if (iconPath.startsWith('http://') || iconPath.startsWith('https://')) {
      return iconPath;
    }

    // If it's an absolute path, return as-is
    if (path.isAbsolute(iconPath)) {
      return iconPath;
    }

    // Resolve relative to app
    return path.join(__dirname, '../../../', iconPath);
  }

  /**
   * Generate unique notification ID
   * @private
   */
  _generateId() {
    return `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Emit event through EventBus
   * @private
   */
  _emitEvent(eventName, data) {
    if (this._eventBus && typeof this._eventBus.emit === 'function') {
      this._eventBus.emit(eventName, data);
    }
  }

  /**
   * Cleanup and destroy
   */
  destroy() {
    this.clearAll();
    this._notifications.clear();
    this._eventBus = null;
    this._config = null;
    this._initialized = false;
  }
}

module.exports = NotificationInterceptor;
