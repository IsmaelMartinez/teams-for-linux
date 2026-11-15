const { ipcMain } = require('electron');
const NotificationToast = require('./NotificationToast');
const { resolveToastOptions } = require('./toastOptions');

class CustomNotificationManager {
  #mainWindow;
  #toastOptions;
  #activeToasts;
  // toast → the renderer that raised it, so a click can bring that profile
  // forward (multi-account).
  #toastOrigins = new WeakMap();
  #activateProfile = null;

  constructor(config, mainWindow) {
    this.#mainWindow = mainWindow;
    this.#toastOptions = resolveToastOptions(config?.customNotification);
    this.#activeToasts = new Set();
  }

  setProfileActivator(activate) {
    this.#activateProfile = activate;
  }

  initialize() {
    // Display custom in-app toast notification (corner set by customNotification.position)
    ipcMain.on('notification-show-toast', this.#handleShowToast.bind(this));
    // Handle toast clicks - close the window and focus main window
    ipcMain.on('notification-toast-click', this.#handleToastClick.bind(this));

    console.info('[CustomNotificationManager] Initialized and listening on "notification-show-toast" channel');
  }

  #handleShowToast(event, data) {
    if (!data?.title) {
      console.warn('[CustomNotificationManager] Invalid notification data, missing title');
      return;
    }

    try {
      const toast = new NotificationToast(
        data,
        this.#toastOptions
      );

      this.#activeToasts.add(toast);
      this.#toastOrigins.set(toast, event.sender);

      // Remove from tracking when toast closes
      const originalClose = toast.close.bind(toast);
      toast.close = function() {
        originalClose();
        this.#activeToasts.delete(toast);
      }.bind(this);

      toast.show();
      console.debug('[CustomNotificationManager] Toast displayed');
    } catch (error) {
      console.error('[CustomNotificationManager] Error displaying toast:', error);
    }
  }

  #handleToastClick(event) {
    try {
      // Find and close the toast window that was clicked
      for (const toast of this.#activeToasts) {
        if (toast.getWebContents() === event.sender) {
          this.#activateProfile?.(this.#toastOrigins.get(toast));
          toast.close();
          break;
        }
      }

      // Focus main window
      if (this.#mainWindow && !this.#mainWindow.isDestroyed()) {
        this.#mainWindow.show();
        this.#mainWindow.focus();
      }
    } catch (error) {
      console.error('[CustomNotificationManager] Error handling toast click:', error);
    }
  }
}

module.exports = CustomNotificationManager;

