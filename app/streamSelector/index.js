const { BrowserWindow, ipcMain } = require("electron");
const path = require("path");

let _StreamSelector_parent = new WeakMap();
let _StreamSelector_window = new WeakMap();
let _StreamSelector_selectedSource = new WeakMap();
class StreamSelector {
  /**
   * @param {BrowserWindow} parent 
   */
  constructor(parent) {
    _StreamSelector_parent.set(this, parent);
    _StreamSelector_window.set(this, null);
    _StreamSelector_selectedSource.set(this, null);
  }

  /**
   * @type {BrowserWindow}
   */
  get parent() {
    return _StreamSelector_parent.get(this);
  }

  /**
   * @type {BrowserWindow}
   */
  get window() {
    return _StreamSelector_window.get(this);
  }

  set window(value) {
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

  show() {
    this.window = new BrowserWindow({
      show: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      },
      parent: this.parent,
      modal: true,
      width: 600,
      height: 210
    });
    this.window.setMenu(null);
    this.window.loadFile(path.join(__dirname, "index.html"));
    this.window.show();
    return new Promise((resolve, reject) => {
      ipcMain.once("selected-source", (event, sourceId) => {
        this.selectedSource = sourceId;
        this.window.close();
      });

      this.window.once('closed', () => {
        this.window = null;
        if (this.selectedSource) {
          resolve(this.selectedSource);
        } else {
          reject();
        }
      });
    });
  }
}

module.exports = { StreamSelector };