const { BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');

class JoinMeetingDialog {
  #window = null;
  #parentWindow = null;
  #onJoin = null;
  #meetupJoinRegEx = null;

  constructor(parentWindow, meetupJoinRegEx) {
    this.#parentWindow = parentWindow;
    this.#meetupJoinRegEx = meetupJoinRegEx;
  }

  show(clipboardText, onJoin) {
    this.#onJoin = onJoin;

    // If window already exists, update it and show
    if (this.#window) {
      if (this.#window.isMinimized()) {
        this.#window.restore();
      }
      this.#window.show();
      this.#window.focus();
      this.#window.webContents.send('init-dialog', {
        clipboardText: clipboardText || '',
        regexPattern: this.#meetupJoinRegEx,
      });
      return;
    }

    // Set up IPC handlers before creating window
    this.#setupIpcHandlers();

    // Create dialog window
    this.#window = new BrowserWindow({
      title: 'Join Meeting',
      width: 500,
      height: 250,
      resizable: false,
      minimizable: false,
      maximizable: false,
      modal: true,
      parent: this.#parentWindow,
      show: false,
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        preload: path.join(__dirname, 'preload.js'),
      },
    });

    // Load the dialog HTML file
    this.#window.loadFile(path.join(__dirname, 'joinMeeting.html'));

    // Show window when ready and send initial data
    this.#window.once('ready-to-show', () => {
      this.#window.webContents.send('init-dialog', {
        clipboardText: clipboardText || '',
        regexPattern: this.#meetupJoinRegEx,
      });
      this.#window.show();
      this.#window.focus();
    });

    // Clean up when window is closed
    this.#window.on('closed', () => {
      this.#removeIpcHandlers();
      this.#window = null;
    });
  }

  #setupIpcHandlers() {
    ipcMain.on('join-meeting-submit', this.#handleSubmit);
    ipcMain.on('join-meeting-cancel', this.#handleCancel);
  }

  #removeIpcHandlers() {
    ipcMain.removeListener('join-meeting-submit', this.#handleSubmit);
    ipcMain.removeListener('join-meeting-cancel', this.#handleCancel);
  }

  #handleSubmit = (_event, url) => {
    if (this.#onJoin && url && typeof url === 'string') {
      try {
        const pattern = new RegExp(this.#meetupJoinRegEx);
        if (pattern.test(url)) {
          this.#onJoin(url);
        }
      } catch (error) {
        console.error('Error validating meeting URL:', error);
      }
    }
    this.close();
  };

  #handleCancel = () => {
    this.close();
  };

  close() {
    if (this.#window) {
      this.#window.close();
    }
  }

  isVisible() {
    return this.#window && this.#window.isVisible();
  }
}

module.exports = JoinMeetingDialog;
