const { BrowserWindow } = require('electron');
const path = require('node:path');
const Positioner = require('electron-positioner');

/**
 * Quick Chat Modal Window
 *
 * A modal window for quick access to chat contacts.
 * Uses People API for search and deep links for navigation.
 */
class QuickChatModal {
  #window;
  #positioner;

  constructor(mainWindow) {
    this.#window = new BrowserWindow({
      parent: mainWindow,
      modal: false,
      alwaysOnTop: true,
      autoHideMenuBar: true,
      frame: false,
      fullscreenable: false,
      height: 400,
      width: 350,
      minimizable: false,
      resizable: false,
      show: false,
      skipTaskbar: true,
      transparent: true,
      webPreferences: {
        preload: path.join(__dirname, 'quickChatModalPreload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    this.#window.loadFile(path.join(__dirname, 'quickChatModal.html'));
    this.#positioner = new Positioner(this.#window);

    // Hide on blur (clicking outside)
    this.#window.on('blur', () => {
      this.hide();
    });

    // Handle escape key
    this.#window.webContents.on('before-input-event', (event, input) => {
      if (input.key === 'Escape') {
        this.hide();
      }
    });
  }

  getWebContents() {
    return this.#window?.webContents;
  }

  show() {
    if (!this.#window || this.#window.isDestroyed()) {
      return;
    }

    // Position near the main window's top-right
    this.#positioner.move('topRight');
    this.#window.show();
    this.#window.focus();

    // Send focus event to search input
    this.#window.webContents.send('quick-chat-focus');
  }

  hide() {
    if (this.#window && !this.#window.isDestroyed()) {
      this.#window.hide();
    }
  }

  isVisible() {
    return this.#window && !this.#window.isDestroyed() && this.#window.isVisible();
  }

  toggle() {
    if (this.isVisible()) {
      this.hide();
    } else {
      this.show();
    }
  }

  destroy() {
    if (this.#window && !this.#window.isDestroyed()) {
      this.#window.destroy();
    }
  }
}

module.exports = QuickChatModal;
