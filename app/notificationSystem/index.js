const { ipcMain } = require('electron');
const NotificationToast = require('./NotificationToast');

/**
 * CustomNotificationManager
 *
 * Manages custom in-app toast notifications as an alternative to OS notifications.
 * This system provides a third option for notification delivery, suitable for users
 * experiencing issues with native OS notification systems (especially on Linux).
 *
 * MVP Features:
 * - Toast notifications with auto-dismiss
 * - Click-to-focus main window
 * - Teams design language
 * - Multi-monitor support via electron-positioner
 *
 * Future enhancements (Phase 2+):
 * - Notification center/history
 * - Action buttons (View, Dismiss, Reply)
 * - Toast queue management
 * - Do Not Disturb mode integration
 */
class CustomNotificationManager {
  #config;
  #mainWindow;
  #toastDuration;

  /**
   * Initialize the CustomNotificationManager
   * @param {Object} config - Application configuration
   * @param {Object} mainWindow - Reference to the main application window
   */
  constructor(config, mainWindow) {
    this.#config = config;
    this.#mainWindow = mainWindow;
    this.#toastDuration = config?.customNotification?.toastDuration || 5000;
  }

  /**
   * Initialize the notification system and register IPC handlers
   */
  initialize() {
    // Listen for notification-show-toast IPC channel
    ipcMain.on('notification-show-toast', this.#handleShowToast.bind(this));

    console.info('[CustomNotificationManager] Initialized and listening on "notification-show-toast" channel');
  }

  /**
   * Handle incoming notification toast requests
   * @param {Event} event - IPC event
   * @param {Object} data - Notification data with title, body, icon
   */
  #handleShowToast(event, data) {
    // Basic validation
    if (!data || !data.title) {
      console.warn('[CustomNotificationManager] Invalid notification data, missing title');
      return;
    }

    try {
      // Create and display toast notification
      const toast = new NotificationToast(
        data,
        () => this.#handleToastClick(),
        this.#toastDuration
      );

      toast.show();
      console.debug(`[CustomNotificationManager] Toast displayed: "${data.title}"`);
    } catch (error) {
      console.error('[CustomNotificationManager] Error displaying toast:', error);
    }
  }

  /**
   * Handle click on notification toast
   * Focuses the main window
   */
  #handleToastClick() {
    try {
      if (this.#mainWindow && !this.#mainWindow.isDestroyed()) {
        this.#mainWindow.show();
        this.#mainWindow.focus();
        console.debug('[CustomNotificationManager] Notification clicked, focused main window');
      }
    } catch (error) {
      console.error('[CustomNotificationManager] Error handling toast click:', error);
    }
  }
}

module.exports = CustomNotificationManager;
