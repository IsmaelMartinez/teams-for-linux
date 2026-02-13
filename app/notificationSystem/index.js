const { ipcMain } = require('electron');
const NotificationToast = require('./NotificationToast');

// Dedup window in ms — notifications with the same title arriving within
// this interval are treated as duplicates (activityHub + window.Notification
// can both fire for the same message).
const DEDUP_WINDOW_MS = 3000;

class CustomNotificationManager {
  #mainWindow;
  #toastDuration;
  #activeToasts;
  #recentTitles;

  constructor(config, mainWindow) {
    this.#mainWindow = mainWindow;
    this.#toastDuration = config?.customNotification?.toastDuration || 5000;
    this.#activeToasts = new Set();
    this.#recentTitles = new Map();
  }

  initialize() {
    // Display custom in-app toast notification in bottom-right corner
    ipcMain.on('notification-show-toast', this.#handleShowToast.bind(this));
    // Handle toast clicks - close the window and focus main window
    ipcMain.on('notification-toast-click', this.#handleToastClick.bind(this));

    console.info('[CustomNotificationManager] Initialized and listening on "notification-show-toast" channel');
  }

  #isDuplicate(title) {
    const now = Date.now();
    const lastSeen = this.#recentTitles.get(title);
    if (lastSeen && (now - lastSeen) < DEDUP_WINDOW_MS) {
      return true;
    }
    this.#recentTitles.set(title, now);
    // Prune old entries to avoid unbounded growth
    if (this.#recentTitles.size > 50) {
      for (const [key, ts] of this.#recentTitles) {
        if (now - ts > DEDUP_WINDOW_MS) this.#recentTitles.delete(key);
      }
    }
    return false;
  }

  #handleShowToast(event, data) {
    if (!data || !data.title) {
      console.warn('[CustomNotificationManager] Invalid notification data, missing title');
      return;
    }

    if (this.#isDuplicate(data.title)) {
      console.debug(`[CustomNotificationManager] Duplicate suppressed: "${data.title}"`);
      return;
    }

    try {
      const toast = new NotificationToast(
        data,
        this.#toastDuration
      );

      this.#activeToasts.add(toast);

      // Clean up tracking when toast window closes (handles both manual close and auto-close)
      toast.onClosed(() => {
        this.#activeToasts.delete(toast);
      });

      toast.show();
      console.debug(`[CustomNotificationManager] Toast displayed: "${data.title}"`);
    } catch (error) {
      console.error('[CustomNotificationManager] Error displaying toast:', error);
    }
  }

  #handleToastClick(event) {
    try {
      // Find and close the toast window that was clicked
      for (const toast of this.#activeToasts) {
        if (toast.getWebContents() === event.sender) {
          toast.close();
          break;
        }
      }

      // Focus main window
      const window = this.#mainWindow?.getWindow?.() || this.#mainWindow;
      if (window && !window.isDestroyed()) {
        window.show();
        window.focus();
      }
    } catch (error) {
      console.error('[CustomNotificationManager] Error handling toast click:', error);
    }
  }
}

module.exports = CustomNotificationManager;

