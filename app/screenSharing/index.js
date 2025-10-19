const { ipcMain, BrowserWindow } = require("electron");
const path = require("path");

class StreamSelector {
  #parent;
  #window = null;
  #callback = null;
  #isClosing = false;
  #sourceHandler = null;
  #closeHandler = null;
  #selectedSource = null;

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
      console.warn('[StreamSelector] Window already open, ignoring duplicate show() call');
      this.#window.focus();
      return;
    }

    this.#callback = callback;
    this.#isClosing = false;
    this.#selectedSource = null;

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
        // sandbox: false required for desktopCapturer.getSources() access
        // Security compensated by contextIsolation + nodeIntegration: false
        sandbox: false,
      },
    });

    this.#window.loadFile(path.join(__dirname, "index.html"));

    this.#window.once("ready-to-show", () => {
      this.#window.show();
    });

    this.#window.once("closed", () => {
      this.#close();
    });

    this.#sourceHandler = (_event, source) => {
      // Store source immediately to avoid race condition with window close
      this.#selectedSource = source;
      this.#close();
    };

    this.#closeHandler = () => {
      this.#close();
    };

    ipcMain.once("selected-source", this.#sourceHandler);
    ipcMain.once("close-view", this.#closeHandler);
  }

  #close() {
    // Guard against double-execution
    if (this.#isClosing) return;
    this.#isClosing = true;

    // Cleanup IPC listeners - remove only this instance's handlers
    if (this.#sourceHandler) {
      ipcMain.removeListener("selected-source", this.#sourceHandler);
      this.#sourceHandler = null;
    }
    if (this.#closeHandler) {
      ipcMain.removeListener("close-view", this.#closeHandler);
      this.#closeHandler = null;
    }

    // Execute callback with stored source (prioritizes user selection over cancellation)
    if (this.#callback) {
      this.#callback(this.#selectedSource);
      this.#callback = null;
    }

    // Cleanup window
    if (this.#window && !this.#window.isDestroyed()) {
      this.#window.destroy();
    }
    this.#window = null;
    this.#selectedSource = null;
  }
}

module.exports = { StreamSelector };
