const { ipcMain, WebContentsView } = require("electron");
const path = require("path");

class StreamSelector {
  #parent;
  #view = null;
  #callback = null;
  #isClosing = false;
  #sourceHandler = null;
  #closeHandler = null;
  #selectedSource = null;
  #resizeHandler = null;

  /**
   * @param {BrowserWindow} parent
   */
  constructor(parent) {
    this.#parent = parent;
  }

  /**
   * Display the stream selector view
   * @param {(source: object|null) => void} callback - Called with selected source or null if cancelled
   */
  show(callback) {
    // Guard: prevent opening multiple views
    if (this.#view) {
      console.warn('[StreamSelector] View already open, ignoring duplicate show() call');
      return;
    }

    this.#callback = callback;
    this.#isClosing = false;
    this.#selectedSource = null;

    this.#view = new WebContentsView({
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
      },
    });

    this.#view.webContents.loadFile(path.join(__dirname, "index.html"));
    this.#parent.contentView.addChildView(this.#view);

    this.#resizeHandler = () => {
      this.#resizeView();
    };
    this.#resizeView();

    this.#sourceHandler = (_event, source) => {
      // Store source immediately to avoid race condition with close
      this.#selectedSource = source;
      this.#close();
    };

    this.#closeHandler = () => {
      this.#close();
    };

    this.#parent.on("resize", this.#resizeHandler);
    ipcMain.once("selected-source", this.#sourceHandler);
    ipcMain.once("close-view", this.#closeHandler);
  }

  #resizeView() {
    if (!this.#view) return;

    setTimeout(() => {
      if (!this.#view) return;
      const pbounds = this.#parent.getBounds();
      this.#view.setBounds({
        x: 0,
        y: pbounds.height - 180,
        width: pbounds.width,
        height: 180,
      });
    }, 0);
  }

  #close() {
    // Guard against double-execution
    if (this.#isClosing) return;
    this.#isClosing = true;

    // Cleanup resize listener
    if (this.#resizeHandler) {
      this.#parent.removeListener("resize", this.#resizeHandler);
      this.#resizeHandler = null;
    }

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

    // Cleanup view
    if (this.#view) {
      this.#parent.contentView.removeChildView(this.#view);
      this.#view.webContents.destroy();
      this.#view = null;
    }

    this.#selectedSource = null;
  }
}

module.exports = { StreamSelector };
