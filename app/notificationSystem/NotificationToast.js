const { BrowserWindow } = require('electron');
const path = require('node:path');
const Positioner = require('electron-positioner');

/**
 * NotificationToast class for displaying custom in-app notifications
 * Follows the pattern established by IncomingCallToast
 * MVP: Shows a temporary toast notification that auto-dismisses
 */
class NotificationToast {
  #window;
  #positioner;
  #onClickCallback;
  #autoCloseTimer;
  #toastDuration;

  constructor(data, onClickCallback, toastDuration = 5000) {
    this.#onClickCallback = onClickCallback;
    this.#toastDuration = toastDuration;

    // Create BrowserWindow for toast notification
    this.#window = new BrowserWindow({
      alwaysOnTop: true,
      autoHideMenuBar: true,
      focusable: false,
      frame: false,
      fullscreenable: false,
      height: 120,
      width: 350,
      minimizable: false,
      movable: false,
      resizable: false,
      show: false,
      skipTaskbar: true,
      transparent: true,
      webPreferences: {
        preload: path.join(__dirname, 'notificationToastPreload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    // Load the toast HTML UI
    this.#window.loadFile(path.join(__dirname, 'notificationToast.html'));

    // Position toast at bottom-right corner with multi-monitor support
    this.#positioner = new Positioner(this.#window);

    // Handle window ready event
    this.#window.webContents.once('did-finish-load', () => {
      // Send notification data to renderer
      this.#window.webContents.send('notification-toast-init', data);
    });

    // Clean up when window is closed
    this.#window.on('closed', () => {
      this.#clearAutoClose();
    });
  }

  /**
   * Display the toast notification
   */
  show() {
    if (!this.#window || this.#window.isDestroyed()) {
      return;
    }

    // Position at bottom-right
    this.#positioner.move('bottomRight');

    // Show window
    this.#window.show();

    // Set auto-close timer
    this.#autoCloseTimer = setTimeout(() => {
      this.close();
    }, this.#toastDuration);
  }

  /**
   * Close the toast notification
   */
  close() {
    this.#clearAutoClose();
    if (this.#window && !this.#window.isDestroyed()) {
      this.#window.close();
    }
  }

  /**
   * Trigger the click callback and close the toast
   * Called when user clicks on the notification
   */
  #handleClick() {
    this.#clearAutoClose();
    if (this.#onClickCallback && typeof this.#onClickCallback === 'function') {
      this.#onClickCallback();
    }
    this.close();
  }

  /**
   * Clear the auto-close timer
   */
  #clearAutoClose() {
    if (this.#autoCloseTimer) {
      clearTimeout(this.#autoCloseTimer);
      this.#autoCloseTimer = null;
    }
  }
}

module.exports = NotificationToast;
