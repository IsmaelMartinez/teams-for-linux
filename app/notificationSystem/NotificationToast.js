const { BrowserWindow } = require('electron');
const path = require('node:path');
const { moveWindow } = require('../utils/windowPositioner');
const { resolveToastOptions } = require('./toastOptions');

// How long show() waits for the page to apply its init style before showing
// the toast anyway. Measured init takes ~60-150 ms once a toast page has
// loaded in this process, and ~185-230 ms on a cold start before that.
const READY_TIMEOUT_MS = 200;
const COLD_READY_TIMEOUT_MS = 300;

// Set once any toast page has sent its ready ack; until then show() waits
// for the cold-start timeout.
let warm = false;

class NotificationToast {
  #window;
  #autoCloseTimer;
  #readyTimer;
  #options;
  #ready = false;
  #showRequested = false;
  #shown = false;

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

    // The toast page has applied its init style and can be shown. Scoped to
    // this toast's webContents, so concurrent toasts don't see each other's ack.
    this.#window.webContents.ipc.once('notification-toast-ready', () => {
      this.#ready = true;
      warm = true;
      if (this.#showRequested) this.#display();
    });

    this.#window.on('closed', () => {
      this.#clearTimers();
    });
  }

  getWebContents() {
    return this.#window?.webContents;
  }

  // Shows the toast once its page has applied the init style, so a custom
  // background is never painted in the default colour first. If the page
  // isn't ready within the timeout (longer on a cold start), it's shown anyway.
  show() {
    if (!this.#window || this.#window.isDestroyed() || this.#showRequested) {
      return;
    }
    this.#showRequested = true;

    if (this.#ready) {
      this.#display();
      return;
    }
    const timeout = warm ? READY_TIMEOUT_MS : COLD_READY_TIMEOUT_MS;
    this.#readyTimer = setTimeout(() => {
      this.#readyTimer = null;
      console.warn(`[NotificationToast] Page not ready after ${timeout} ms, showing toast anyway`);
      this.#display();
    }, timeout);
  }

  close() {
    this.#clearTimers();
    if (this.#window && !this.#window.isDestroyed()) {
      this.#window.close();
    }
  }

  #display() {
    if (this.#shown || !this.#window || this.#window.isDestroyed()) {
      return;
    }
    this.#shown = true;
    this.#clearTimers();

    moveWindow(this.#window, this.#options.position, this.#options.margin);
    this.#window.show();

    // Counted from when the toast appears, so a late page doesn't shorten it.
    this.#autoCloseTimer = setTimeout(() => {
      this.close();
    }, this.#options.toastDuration);
  }

  #clearTimers() {
    clearTimeout(this.#readyTimer);
    clearTimeout(this.#autoCloseTimer);
    this.#readyTimer = null;
    this.#autoCloseTimer = null;
  }
}

NotificationToast.READY_TIMEOUT_MS = READY_TIMEOUT_MS;
NotificationToast.COLD_READY_TIMEOUT_MS = COLD_READY_TIMEOUT_MS;

module.exports = NotificationToast;


