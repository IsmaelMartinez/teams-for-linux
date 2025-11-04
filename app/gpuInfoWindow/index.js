const { BrowserWindow } = require('electron');

class GpuInfoWindow {
  window = null;

  show() {
    // If window already exists, just show and focus it
    if (this.window) {
      if (this.window.isMinimized()) {
        this.window.restore();
      }
      this.window.show();
      this.window.focus();
      return;
    }

    // Create new GPU info window
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

    // Load the chrome://gpu URL
    this.window.loadURL('chrome://gpu');

    // Show window when ready
    this.window.once('ready-to-show', () => {
      this.window.show();
      this.window.focus();
    });

    // Clean up when window is closed
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
    return this.window && this.window.isVisible();
  }
}

module.exports = GpuInfoWindow;
