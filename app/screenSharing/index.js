const { ipcMain, WebContentsView } = require("electron");
const path = require("node:path");

class StreamSelector {
  #parent;
  #view = null;
  #callback = null;
  #isClosing = false;
  #sourceHandler = null;
  #closeHandler = null;
  #selectedSource = null;
  #resizeHandler = null;
  #parentClosedHandler = null;
  #resizeTimer = null;
  // See ProfileViewManager: `closed` teardown must not touch a destroyed window.
  #boundsSource = null;

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
    // Maximize/restore under X11 reports the old size on the window-state
    // events and may skip `resize` (#2947); the contentView's `bounds-changed`
    // fires once the new size is in effect.
    this.#boundsSource = this.#parent.contentView;
    this.#boundsSource.on("bounds-changed", this.#resizeHandler);
    // Closing the parent never reaches #close() through the picker's own IPC.
    this.#parentClosedHandler = () => this.#close();
    this.#parent.once("closed", this.#parentClosedHandler);
    // Receive user's screen sharing source selection from picker UI
    ipcMain.once("selected-source", this.#sourceHandler);
    // Close the stream selector view without selection
    ipcMain.once("close-view", this.#closeHandler);
  }

  #resizeView() {
    if (!this.#view) return;

    clearTimeout(this.#resizeTimer);
    this.#resizeTimer = setTimeout(() => {
      this.#resizeTimer = null;
      if (!this.#view || this.#parent.isDestroyed()) return;
      const pbounds = this.#parent.getBounds();
      this.#view.setBounds({
        x: 0,
        y: 0,
        width: pbounds.width,
        height: pbounds.height,
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
      this.#boundsSource?.removeListener("bounds-changed", this.#resizeHandler);
      this.#boundsSource = null;
      this.#resizeHandler = null;
    }
    if (this.#parentClosedHandler) {
      this.#parent.removeListener("closed", this.#parentClosedHandler);
      this.#parentClosedHandler = null;
    }
    clearTimeout(this.#resizeTimer);
    this.#resizeTimer = null;

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
      // A destroyed parent has already torn its child views down.
      if (!this.#parent.isDestroyed()) {
        this.#parent.contentView.removeChildView(this.#view);
        this.#view.webContents.destroy();
      }
      this.#view = null;
    }

    this.#selectedSource = null;

    // Reset closing flag to allow reopening
    this.#isClosing = false;
  }
}

module.exports = { StreamSelector };
