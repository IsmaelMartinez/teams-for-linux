const { BrowserWindow } = require('electron');
const path = require('node:path');
const Positioner = require('electron-positioner');

class NotificationToast {
  #window;
  #positioner;
  #autoCloseTimer;
  #toastDuration;

  constructor(data, toastDuration = 5000) {
    this.#toastDuration = toastDuration;

    this.#window = new BrowserWindow({
      alwaysOnTop: true,
      autoHideMenuBar: true,
      focusable: false,
      frame: false,
      fullscreenable: false,
      height: 110,
      width: 360,
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
    this.#positioner = new Positioner(this.#window);

    this.#window.webContents.once('did-finish-load', () => {
      this.#window.webContents.send('notification-toast-init', data);
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

    this.#positioner.move('bottomRight');
    this.#window.show();

    this.#autoCloseTimer = setTimeout(() => {
      this.close();
    }, this.#toastDuration);
  }

  close() {
    this.#clearAutoClose();
    if (this.#window && !this.#window.isDestroyed()) {
      this.#window.close();
    }
  }

  #handleClick() {
    this.#clearAutoClose();
    this.close();
  }

  #clearAutoClose() {
    if (this.#autoCloseTimer) {
      clearTimeout(this.#autoCloseTimer);
      this.#autoCloseTimer = null;
    }
  }
}

module.exports = NotificationToast;


