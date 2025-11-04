const BasePlugin = require('../../BasePlugin');
const { Notification, ipcMain, app } = require('electron');

/**
 * NotificationsPlugin - Main process notification management
 *
 * Coordinates system notifications between web content and native OS.
 * Handles:
 * - Listening to notification:intercepted events from NotificationInterceptor
 * - Showing native system notifications via Electron API
 * - Managing notification sound playback
 * - Updating tray badge counts
 * - Focusing window on notification click
 * - Respecting user preferences (disable notifications, sounds, window flash)
 *
 * Events consumed:
 * - notification:intercepted - From NotificationInterceptor when web notification is captured
 * - notification:badge-updated - Badge count updates to sync with tray
 *
 * Events emitted:
 * - notification:shown - When system notification is displayed
 * - notification:clicked - When user clicks notification
 * - notification:closed - When notification is dismissed
 * - notification:permission-changed - Permission status updates
 * - notification:preferences-updated - User preferences changed
 *
 * IPC Handlers:
 * - plugin:notification:show - Show notification from renderer
 * - plugin:notification:request-permission - Request permission
 * - plugin:notification:get-permission - Get current permission
 * - plugin:notification:clear-all - Clear all notifications
 * - plugin:notification:set-badge-count - Set badge count
 * - plugin:notification:get-badge-count - Get badge count
 * - plugin:notification:set-sound-enabled - Toggle notification sounds
 * - plugin:notification:get-active-count - Get active notification count
 */
class NotificationsPlugin extends BasePlugin {
  constructor(id, manifest, api) {
    super(id, manifest, api);

    // State
    this._eventBus = null;
    this._logger = null;
    this._config = null;
    this._mainWindow = null;
    this._notifications = new Map();
    this._badgeCount = 0;
    this._preferences = {
      enabled: true,
      soundEnabled: true,
      windowFlashEnabled: true
    };
    this._ipcHandlers = new Map();
  }

  /**
   * Lifecycle: Activate plugin
   * @returns {Promise<void>}
   */
  async onActivate() {
    try {
      // Get services via PluginAPI
      this._eventBus = this._getEventBus();
      this._logger = this._getLogger();
      this._config = this._getConfig();

      // Get main window reference (assuming it's available via config or global)
      this._mainWindow = this._getMainWindow();

      // Load preferences
      this._loadPreferences();

      // Subscribe to notification events
      this._setupEventListeners();

      // Register IPC handlers for renderer communication
      this._registerIpcHandlers();

      this._logger.info('Notifications plugin activated', {
        preferences: this._preferences,
        platform: process.platform
      });

    } catch (error) {
      this._logger.error('Failed to activate notifications plugin', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Lifecycle: Deactivate plugin
   * @returns {Promise<void>}
   */
  async onDeactivate() {
    try {
      // Unregister IPC handlers
      this._unregisterIpcHandlers();

      // Clear all active notifications
      this._clearAllNotifications();

      // Clean up event listeners (handled by PluginAPI.cleanup())

      this._logger.info('Notifications plugin deactivated');

    } catch (error) {
      this._logger.error('Failed to deactivate notifications plugin', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Lifecycle: Destroy plugin
   * @returns {Promise<void>}
   */
  async onDestroy() {
    try {
      this._clearAllNotifications();
      this._notifications.clear();
      this._eventBus = null;
      this._logger = null;
      this._config = null;
      this._mainWindow = null;

      await super.onDestroy();

      if (this._logger) {
        this._logger.info('Notifications plugin destroyed');
      }

    } catch (error) {
      console.error('Failed to destroy notifications plugin:', error);
    }
  }

  /**
   * Get EventBus from PluginAPI
   * @private
   * @returns {Object} EventBus instance
   */
  _getEventBus() {
    // PluginAPI provides 'on' and 'emit' methods directly
    return {
      on: (event, handler) => this.api.on(event, handler),
      emit: (event, data) => this.api.emit(event, data)
    };
  }

  /**
   * Get Logger from PluginAPI
   * @private
   * @returns {Object} Logger instance
   */
  _getLogger() {
    return {
      debug: (msg, data) => this.api.log('debug', msg, data),
      info: (msg, data) => this.api.log('info', msg, data),
      warn: (msg, data) => this.api.log('warn', msg, data),
      error: (msg, data) => this.api.log('error', msg, data)
    };
  }

  /**
   * Get Config from PluginAPI
   * @private
   * @returns {Object} Config accessor
   */
  _getConfig() {
    return {
      get: (key, defaultValue) => {
        try {
          return this.api.getConfig(key) ?? defaultValue;
        } catch (error) {
          return defaultValue;
        }
      },
      set: (key, value) => {
        try {
          this.api.setConfig(key, value);
        } catch (error) {
          this._logger?.warn('Failed to set config', { key, error: error.message });
        }
      }
    };
  }

  /**
   * Get main window reference
   * @private
   * @returns {BrowserWindow|null}
   */
  _getMainWindow() {
    // Attempt to get window from BrowserWindow.getAllWindows()
    // This assumes the main window is the first or primary window
    const { BrowserWindow } = require('electron');
    const windows = BrowserWindow.getAllWindows();
    return windows.length > 0 ? windows[0] : null;
  }

  /**
   * Load notification preferences from config
   * @private
   */
  _loadPreferences() {
    this._preferences = {
      enabled: !this._config.get('disableNotifications', false),
      soundEnabled: !this._config.get('disableNotificationSound', false),
      windowFlashEnabled: !this._config.get('disableNotificationWindowFlash', false)
    };

    this._logger.debug('Loaded notification preferences', this._preferences);
  }

  /**
   * Setup event listeners for notification events
   * @private
   */
  _setupEventListeners() {
    // Listen to notification:intercepted from NotificationInterceptor
    this._eventBus.on('notification:intercepted', this._handleNotificationIntercepted.bind(this));

    // Listen to badge updates
    this._eventBus.on('notification:badge-updated', this._handleBadgeUpdated.bind(this));

    this._logger.debug('Event listeners setup complete');
  }

  /**
   * Handle notification:intercepted event
   * @private
   * @param {Object} data - Notification data
   */
  _handleNotificationIntercepted(data) {
    if (!this._preferences.enabled) {
      this._logger.debug('Notifications disabled, ignoring', { id: data.id });
      return;
    }

    try {
      this._showSystemNotification(data);
    } catch (error) {
      this._logger.error('Failed to handle intercepted notification', {
        id: data.id,
        error: error.message
      });
    }
  }

  /**
   * Handle badge count update
   * @private
   * @param {Object} data - Badge data
   */
  _handleBadgeUpdated(data) {
    this._badgeCount = data.count || 0;

    // Update app badge (macOS, Linux)
    if (process.platform === 'darwin' || process.platform === 'linux') {
      app.setBadgeCount(this._badgeCount);
    }

    this._logger.debug('Badge count updated', { count: this._badgeCount });
  }

  /**
   * Show native system notification
   * @private
   * @param {Object} options - Notification options
   */
  _showSystemNotification(options) {
    // Check if notifications are supported
    if (!Notification.isSupported()) {
      this._logger.warn('System notifications not supported on this platform');
      return;
    }

    try {
      const notificationOptions = {
        title: options.title || 'Microsoft Teams',
        body: options.body || '',
        silent: !this._preferences.soundEnabled || options.silent === true,
        urgency: options.urgency || 'normal',
        timeoutType: 'default'
      };

      // Add icon if provided (cross-platform)
      if (options.icon) {
        notificationOptions.icon = this._resolveIconPath(options.icon);
      }

      // Create system notification
      const notification = new Notification(notificationOptions);

      // Store notification reference
      this._notifications.set(options.id, {
        notification,
        data: options.data || {},
        tag: options.tag,
        timestamp: options.timestamp || Date.now()
      });

      // Setup event handlers
      notification.on('click', () => this._handleNotificationClick(options.id));
      notification.on('close', () => this._handleNotificationClose(options.id));
      notification.on('failed', (event, error) => this._handleNotificationFailed(options.id, error));

      // Show notification
      notification.show();

      // Flash window if enabled and not focused
      if (this._preferences.windowFlashEnabled && this._mainWindow && !this._mainWindow.isFocused()) {
        this._mainWindow.flashFrame(true);
      }

      // Emit shown event
      this._eventBus.emit('notification:shown', {
        id: options.id,
        notification: options
      });

      this._logger.debug('System notification shown', {
        id: options.id,
        title: options.title
      });

    } catch (error) {
      this._logger.error('Failed to show system notification', {
        id: options.id,
        error: error.message
      });

      this._eventBus.emit('notification:failed', {
        id: options.id,
        error: error.message
      });
    }
  }

  /**
   * Handle notification click
   * @private
   * @param {string} id - Notification ID
   */
  _handleNotificationClick(id) {
    const notificationData = this._notifications.get(id);

    if (notificationData) {
      // Focus main window
      if (this._mainWindow) {
        if (this._mainWindow.isMinimized()) {
          this._mainWindow.restore();
        }
        this._mainWindow.focus();
        this._mainWindow.flashFrame(false);
      }

      // Emit clicked event
      this._eventBus.emit('notification:clicked', {
        id,
        data: notificationData.data,
        tag: notificationData.tag
      });

      this._logger.debug('Notification clicked', { id });

      // Clean up
      this._notifications.delete(id);
    }
  }

  /**
   * Handle notification close
   * @private
   * @param {string} id - Notification ID
   */
  _handleNotificationClose(id) {
    if (this._notifications.has(id)) {
      this._eventBus.emit('notification:closed', { id });
      this._logger.debug('Notification closed', { id });
      this._notifications.delete(id);
    }
  }

  /**
   * Handle notification failure
   * @private
   * @param {string} id - Notification ID
   * @param {string} error - Error message
   */
  _handleNotificationFailed(id, error) {
    this._eventBus.emit('notification:failed', {
      id,
      error: error || 'Unknown error'
    });

    this._logger.error('Notification failed', { id, error });
    this._notifications.delete(id);
  }

  /**
   * Resolve icon path (handle URLs, absolute, relative)
   * @private
   * @param {string} iconPath - Icon path or URL
   * @returns {string} Resolved path
   */
  _resolveIconPath(iconPath) {
    if (!iconPath) {
      return null;
    }

    // If URL, return as-is
    if (iconPath.startsWith('http://') || iconPath.startsWith('https://')) {
      return iconPath;
    }

    // If absolute path, return as-is
    const path = require('path');
    if (path.isAbsolute(iconPath)) {
      return iconPath;
    }

    // Resolve relative to app resources
    return path.join(__dirname, '../../../', iconPath);
  }

  /**
   * Clear all active notifications
   * @private
   */
  _clearAllNotifications() {
    this._notifications.forEach((notificationData, id) => {
      try {
        notificationData.notification.close();
      } catch (error) {
        this._logger.warn('Failed to close notification', { id, error: error.message });
      }
    });

    this._notifications.clear();
    this._badgeCount = 0;

    // Reset app badge
    if (process.platform === 'darwin' || process.platform === 'linux') {
      app.setBadgeCount(0);
    }

    this._logger.debug('All notifications cleared');
  }

  /**
   * Register IPC handlers for renderer communication
   * @private
   */
  _registerIpcHandlers() {
    // Show notification
    const showHandler = async (event, notification) => {
      if (!this._preferences.enabled) {
        throw new Error('Notifications are disabled');
      }

      const id = this._generateId();
      const notificationData = {
        id,
        title: notification.title,
        body: notification.body,
        icon: notification.icon,
        tag: notification.tag,
        data: notification.data,
        silent: notification.silent,
        urgency: notification.urgency,
        timestamp: Date.now()
      };

      this._showSystemNotification(notificationData);
      return id;
    };

    // Request permission (always granted in Electron)
    const requestPermissionHandler = async () => {
      return Notification.isSupported() ? 'granted' : 'denied';
    };

    // Get permission
    const getPermissionHandler = async () => {
      return Notification.isSupported() ? 'granted' : 'denied';
    };

    // Clear all notifications
    const clearAllHandler = async () => {
      this._clearAllNotifications();
    };

    // Set badge count
    const setBadgeCountHandler = async (event, count) => {
      this._badgeCount = Math.max(0, count);
      if (process.platform === 'darwin' || process.platform === 'linux') {
        app.setBadgeCount(this._badgeCount);
      }
      this._eventBus.emit('notification:badge-updated', { count: this._badgeCount });
    };

    // Get badge count
    const getBadgeCountHandler = async () => {
      return this._badgeCount;
    };

    // Set sound enabled
    const setSoundEnabledHandler = async (event, enabled) => {
      this._preferences.soundEnabled = enabled;
      this._config.set('disableNotificationSound', !enabled);
      this._eventBus.emit('notification:preferences-updated', this._preferences);
    };

    // Get active count
    const getActiveCountHandler = async () => {
      return this._notifications.size;
    };

    // Register handlers
    ipcMain.handle('plugin:notification:show', showHandler);
    ipcMain.handle('plugin:notification:request-permission', requestPermissionHandler);
    ipcMain.handle('plugin:notification:get-permission', getPermissionHandler);
    ipcMain.handle('plugin:notification:clear-all', clearAllHandler);
    ipcMain.handle('plugin:notification:set-badge-count', setBadgeCountHandler);
    ipcMain.handle('plugin:notification:get-badge-count', getBadgeCountHandler);
    ipcMain.handle('plugin:notification:set-sound-enabled', setSoundEnabledHandler);
    ipcMain.handle('plugin:notification:get-active-count', getActiveCountHandler);

    // Store handlers for cleanup
    this._ipcHandlers.set('plugin:notification:show', showHandler);
    this._ipcHandlers.set('plugin:notification:request-permission', requestPermissionHandler);
    this._ipcHandlers.set('plugin:notification:get-permission', getPermissionHandler);
    this._ipcHandlers.set('plugin:notification:clear-all', clearAllHandler);
    this._ipcHandlers.set('plugin:notification:set-badge-count', setBadgeCountHandler);
    this._ipcHandlers.set('plugin:notification:get-badge-count', getBadgeCountHandler);
    this._ipcHandlers.set('plugin:notification:set-sound-enabled', setSoundEnabledHandler);
    this._ipcHandlers.set('plugin:notification:get-active-count', getActiveCountHandler);

    this._logger.debug('IPC handlers registered', {
      count: this._ipcHandlers.size
    });
  }

  /**
   * Unregister IPC handlers
   * @private
   */
  _unregisterIpcHandlers() {
    this._ipcHandlers.forEach((handler, channel) => {
      ipcMain.removeHandler(channel);
    });

    this._ipcHandlers.clear();
    this._logger.debug('IPC handlers unregistered');
  }

  /**
   * Generate unique notification ID
   * @private
   * @returns {string} Unique ID
   */
  _generateId() {
    return `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

module.exports = NotificationsPlugin;
