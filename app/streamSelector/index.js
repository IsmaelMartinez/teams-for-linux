const { ipcMain, WebContentsView } = require("electron");
const path = require("path");

let _StreamSelector_parent = new WeakMap();
let _StreamSelector_window = new WeakMap();
let _StreamSelector_selectedSource = new WeakMap();
let _StreamSelector_callback = new WeakMap();
class StreamSelector {
  /**
   * @param {BrowserWindow} parent
   */
  constructor(parent) {
    _StreamSelector_parent.set(this, parent);
    _StreamSelector_window.set(this, null);
    _StreamSelector_selectedSource.set(this, null);
    _StreamSelector_callback.set(this, null);
  }

  /**
   * @type {BrowserWindow}
   */
  get parent() {
    return _StreamSelector_parent.get(this);
  }

  /**
   * @type {WebContentsView}
   */
  get view() {
    return _StreamSelector_window.get(this);
  }

  set view(value) {
    _StreamSelector_window.set(this, value);
  }

  get selectedSource() {
    return _StreamSelector_selectedSource.get(this);
  }

  set selectedSource(value) {
    _StreamSelector_selectedSource.set(this, value);
  }

  get callback() {
    return _StreamSelector_callback.get(this);
  }

  set callback(value) {
    if (typeof value == "function") {
      _StreamSelector_callback.set(this, value);
    }
  }

  show(callback) {
    console.log("StreamSelector: show() called");
    let self = this;
    self.callback = callback;
    self.callbackCalled = false; // Ensure callback is only called once

    self.view = new WebContentsView({
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        sandbox: true, // Enable sandbox for better security
      },
    });

    self.view.webContents.loadFile(path.join(__dirname, "index.html"));
    self.parent.contentView.addChildView(self.view);

    console.log("StreamSelector: View created and added to parent");

    // Add debugging for when the view finishes loading
    self.view.webContents.once("did-finish-load", () => {
      console.log("StreamSelector: View finished loading");
    });

    let _resize = () => {
      resizeView(self);
    };
    resizeView(self);

    let _close = (_event, source) => {
      // Close without selecting a source (user cancelled)
      if (!self.callbackCalled) {
        self.callbackCalled = true;
        closeView({
          view: self,
          _resize,
          _close,
          _sourceSelected,
          source: null,
        });
      }
    };

    let _sourceSelected = (_event, source) => {
      // User selected a source
      console.log(
        "StreamSelector: Source selected via IPC:",
        source ? source.id : "null"
      );
      if (!self.callbackCalled) {
        self.callbackCalled = true;
        closeView({ view: self, _resize, _close, _sourceSelected, source });
      }
    };

    this.parent.on("resize", _resize);
    ipcMain.once("close-view", _close);
    ipcMain.once("source-selected", _sourceSelected);
  }
}

function closeView(properties) {
  // Clean up the view
  if (properties.view.view && properties.view.view.webContents) {
    if (!properties.view.view.webContents.isDestroyed()) {
      properties.view.view.webContents.destroy();
    }
  }

  // Remove the view from parent
  if (properties.view.parent && properties.view.parent.contentView) {
    properties.view.parent.contentView.removeChildView(properties.view.view);
  }

  properties.view.view = null;

  // Remove event listeners
  properties.view.parent.removeListener("resize", properties._resize);
  ipcMain.removeListener("close-view", properties._close);
  ipcMain.removeListener("source-selected", properties._sourceSelected);

  // Call the callback with the selected source (or null if cancelled)
  if (properties.view.callback) {
    console.log(
      "Calling callback with source:",
      properties.source ? properties.source.id : "null"
    );
    properties.view.callback(properties.source);
  }
}

function resizeView(view) {
  setTimeout(() => {
    const pbounds = view.parent.getBounds();
    view.view.setBounds({
      x: 0,
      y: pbounds.height - 180,
      width: pbounds.width,
      height: 180,
    });
  }, 0);
}

module.exports = { StreamSelector };
