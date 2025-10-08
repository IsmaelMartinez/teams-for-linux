const { ipcMain, BrowserWindow } = require("electron");
const path = require("path");

class StreamSelector {
  #parent;
  #window = null;
  #callback = null;
  #isClosing = false;

  /**
   * @param {BrowserWindow} parent - The parent window for the modal dialog
   */
  constructor(parent) {
    this.#parent = parent;
  }

  /**
   * Display the stream selector modal dialog
   * @param {(source: object|null) => void} callback - Called with selected source or null if cancelled
   */
  show(callback) {
    // Guard: prevent opening multiple windows
    if (this.#window && !this.#window.isDestroyed()) {
      return;
    }

    this.#callback = callback;
    this.#isClosing = false;

    this.#window = new BrowserWindow({
      parent: this.#parent,
      modal: true,
      show: false,
      width: 1000,
      height: 300,
      minWidth: 800,
      minHeight: 250,
      maxHeight: 400,
      frame: true,
      autoHideMenuBar: true,
      resizable: true,
      minimizable: false,
      maximizable: false,
      skipTaskbar: true,
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });

    this.#window.loadFile(path.join(__dirname, "index.html"));

    this.#window.once("ready-to-show", () => {
      this.#window?.show();
    });

    this.#window.once("closed", () => {
      this.#close(null);
    });

    ipcMain.once("selected-source", (_event, source) => {
      this.#close(source);
    });

    ipcMain.once("close-view", () => {
      this.#close(null);
    });
  }

  #close(source) {
    // Guard against double-execution
    if (this.#isClosing) return;
    this.#isClosing = true;

    // Cleanup IPC listeners
    ipcMain.removeAllListeners("selected-source");
    ipcMain.removeAllListeners("close-view");

    // Execute callback
    if (this.#callback) {
      this.#callback(source);
      this.#callback = null;
    }

    // Cleanup window
    if (this.#window && !this.#window.isDestroyed()) {
      this.#window.destroy();
    }
    this.#window = null;
  }
}

module.exports = { StreamSelector };
