const { BrowserWindow } = require('electron');
const path = require('node:path');
const { moveWindow } = require('../utils/windowPositioner');
const { resolveToastOptions } = require('./toastOptions');

class NotificationToast {
  #window;
  #autoCloseTimer;
  #options;

  constructor(data, options = resolveToastOptions()) {
    this.#options = options;

    this.#window = new BrowserWindow({
      alwaysOnTop: true,
      autoHideMenuBar: true,
      focusable: false,
      frame: false,
      fullscreenable: false,
      height: options.height,
      width: options.width,
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

    this.#window.loadFile(path.join(__dirname, 'notificationToast.html'));

    this.#window.webContents.once('did-finish-load', () => {
      this.#window.webContents.send('notification-toast-init', data, options.style);
    });

    this.#window.on('closed', () => {
      this.#clearAutoClose();
    });
  }

  getWebContents() {
    return this.#window?.webContents;
  }

  show() {
    if (!this.#window || this.#window.isDestroyed()) {
      return;
    }

    moveWindow(this.#window, this.#options.position, this.#options.margin);
    this.#window.show();

    this.#autoCloseTimer = setTimeout(() => {
      this.close();
    }, this.#options.toastDuration);
  }

  close() {
    this.#clearAutoClose();
    if (this.#window && !this.#window.isDestroyed()) {
      this.#window.close();
    }
  }

  #clearAutoClose() {
    if (this.#autoCloseTimer) {
      clearTimeout(this.#autoCloseTimer);
      this.#autoCloseTimer = null;
    }
  }
}

module.exports = NotificationToast;


