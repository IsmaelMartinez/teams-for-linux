const { BrowserWindow, ipcMain, BrowserView } = require("electron");
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
   * @type {BrowserView}
   */
  get view() {
    return _StreamSelector_window.get(this);
  }

  set view(value) {
    _StreamSelector_window.set(this, value);
  }

  /**
   * @type {string}
   */
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
    if (typeof (value) == "function") {
      _StreamSelector_callback.set(this, value);
    }
  }

  /**
   * 
   * @param {(sourceId:string)=>void} callback 
   */
  show(callback) {
    let self = this;
    self.callback = callback;
    self.view = new BrowserView({
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });
    self.view.webContents.loadFile(path.join(__dirname, "index.html"));
    self.parent.addBrowserView(self.view);
    
    let _resize = () => {
      setTimeout(() => {
        const pbounds = self.parent.getBounds();
        self.view.setBounds({
          x: 0,
          y: pbounds.height - 200,
          width: pbounds.width,
          height: 200
        });
      }, 0);
    };
    _resize();

    let _close = (event, sourceId) => {
      self.parent.removeBrowserView(self.view);
      self.view = null;
      self.parent.removeListener("resize", _resize);
      ipcMain.removeListener("selected-source", _close);
      ipcMain.removeListener("close-view", _close);
      if (self.callback) {
        self.callback(sourceId);
      }
    };

    this.parent.on("resize", _resize);
    ipcMain.once("selected-source", _close);
    ipcMain.once("close-view", _close);
  }
}

module.exports = { StreamSelector };