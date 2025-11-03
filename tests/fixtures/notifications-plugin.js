/**
 * NotificationsPlugin - Fixture implementation for testing
 * Extends BasePlugin to handle system notifications, sounds, and badge counts
 */

const BasePlugin = require('../../app/plugins/BasePlugin');

class NotificationsPlugin extends BasePlugin {
  constructor(id, manifest, api) {
    super(id, manifest, api);

    // Internal state
    this._listeners = [];
    this._notificationQueue = [];
    this._badgeCount = 0;
    this._config = {
      enabled: true,
      soundEnabled: true,
      badgeEnabled: true,
      maxQueueSize: 100
    };
  }

  /**
   * Activate the plugin
   */
  async onActivate() {
    // Subscribe to notification events
    const listener = this.api.on('notification:intercepted', this._handleNotification.bind(this));
    this._listeners.push(listener);

    // Load preferences
    await this._loadPreferences();

    this.api.logger.info('NotificationsPlugin activated');
  }

  /**
   * Deactivate the plugin
   */
  async onDeactivate() {
    // Unsubscribe from all events
    this._listeners.forEach(listener => {
      if (typeof listener === 'function') {
        listener();
      }
    });
    this._listeners = [];

    // Clear notification queue
    this._notificationQueue = [];
    this._badgeCount = 0;

    this.api.logger.info('NotificationsPlugin deactivated');
  }

  /**
   * Destroy the plugin
   */
  async onDestroy() {
    // Only deactivate if still active (parent destroy already handles this)
    // But we need to cleanup listeners even if not active
    if (this._listeners.length > 0) {
      this._listeners.forEach(listener => {
        if (typeof listener === 'function') {
          listener();
        }
      });
      this._listeners = [];
    }

    this._notificationQueue = [];
    this._badgeCount = 0;

    await super.onDestroy();
  }

  /**
   * Handle intercepted notification
   * @private
   */
  async _handleNotification(data) {
    if (!this._config.enabled) {
      return;
    }

    try {
      // Add to queue
      this._notificationQueue.push(data);
      if (this._notificationQueue.length > this._config.maxQueueSize) {
        this._notificationQueue.shift();
      }

      // Show system notification
      await this._showNotification(data);

      // Play sound
      if (this._config.soundEnabled) {
        await this._playSound(data);
      }

      // Update badge count
      if (this._config.badgeEnabled) {
        this._badgeCount++;
        await this._updateBadge();
      }

      // Emit shown event
      this.api.emit('notification:shown', {
        id: data.id,
        timestamp: Date.now()
      });
    } catch (error) {
      this.api.logger.error('Failed to handle notification', error);
      // Don't re-throw to prevent unhandled rejections in tests
    }
  }

  /**
   * Show system notification
   * @private
   */
  async _showNotification(data) {
    const notification = {
      title: data.title || 'Notification',
      body: data.body || '',
      icon: data.icon,
      tag: data.tag
    };

    // Emit to show notification (would call Electron Notification in real app)
    this.api.emit('system:notification:show', notification);

    // Track click events
    if (data.onClick) {
      this.api.once('notification:click', () => {
        data.onClick();
      });
    }
  }

  /**
   * Play notification sound
   * @private
   */
  async _playSound(data) {
    const soundFile = data.sound || 'default';
    this.api.emit('sound:play', { file: soundFile });
  }

  /**
   * Update badge count
   * @private
   */
  async _updateBadge() {
    this.api.emit('badge:update', { count: this._badgeCount });
  }

  /**
   * Load user preferences
   * @private
   */
  async _loadPreferences() {
    const prefs = await this.api.state.get('notifications');
    if (prefs) {
      this._config = { ...this._config, ...prefs };
    }
  }

  /**
   * Configure notifications
   */
  async configure(options) {
    this._config = { ...this._config, ...options };
    await this.api.state.set('notifications', this._config);
  }

  /**
   * Get configuration
   */
  getConfig() {
    return { ...this._config };
  }

  /**
   * Clear badge count
   */
  async clearBadge() {
    this._badgeCount = 0;
    await this._updateBadge();
  }

  /**
   * Get notification queue
   */
  getQueue() {
    return [...this._notificationQueue];
  }

  /**
   * Clear notification queue
   */
  clearQueue() {
    this._notificationQueue = [];
  }

  /**
   * Get badge count
   */
  getBadgeCount() {
    return this._badgeCount;
  }
}

module.exports = NotificationsPlugin;
