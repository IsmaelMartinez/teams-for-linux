const { BrowserWindow } = require('electron');
const path = require('node:path');

class DocumentationWindow {
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

    // Create new documentation window
    this.window = new BrowserWindow({
      title: 'Teams for Linux - Documentation',
      width: 1200,
      height: 800,
      minWidth: 800,
      minHeight: 600,
      show: false,
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
      },
    });

    // Load the documentation HTML file
    this.window.loadFile(path.join(__dirname, 'documentation.html'));

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
    return this.window?.isVisible() ?? false;
  }
}

module.exports = DocumentationWindow;
