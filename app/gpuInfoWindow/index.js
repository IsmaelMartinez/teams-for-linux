const { BrowserWindow } = require('electron');

/**
 * Window for displaying chrome://gpu information
 * Shows GPU and graphics acceleration details for debugging
 */
class GpuInfoWindow {
  window = null;

  show() {
    // Reuse existing window if already open
    if (this.window) {
      if (this.window.isMinimized()) {
        this.window.restore();
      }
      this.window.show();
      this.window.focus();
      return;
    }

    // Create new window
    this.window = new BrowserWindow({
      title: 'GPU Information',
      width: 1000,
      height: 800,
      minWidth: 600,
      minHeight: 400,
      show: false,
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
      },
    });

    this.window.loadURL('chrome://gpu');

    this.window.once('ready-to-show', () => {
      this.window.show();
      this.window.focus();
    });

    this.window.on('closed', () => {
      this.window = null;
    });
  }

  close() {
    if (this.window) {
      this.window.close();
    }
  }

  isVisible() {
    return this.window?.isVisible() ?? false;
  }
}

module.exports = GpuInfoWindow;
