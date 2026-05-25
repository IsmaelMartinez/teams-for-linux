const { ipcMain } = require('electron');
const path = require('node:path');
const createDialogWindow = require('../_shared/createDialogWindow');

// Only one JoinMeetingDialog instance exists; its handlers dispatch via this
// pointer so listeners are registered once and survive across dialog opens.
let activeHandlers = null;
let handlersRegistered = false;

function ensureIpcHandlers() {
  if (handlersRegistered) return;
  handlersRegistered = true;
  // Handle join meeting dialog submission
  ipcMain.on('join-meeting-submit', (_event, url) => {
    activeHandlers?.onSubmit(url);
  });
  // Handle join meeting dialog cancel
  ipcMain.on('join-meeting-cancel', () => {
    activeHandlers?.onCancel();
  });
}

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
    ensureIpcHandlers();
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

    this.#window = createDialogWindow({
      title: 'Join Meeting',
      width: 500,
      height: 250,
      parent: this.#parentWindow,
      preload: path.join(__dirname, 'preload.js'),
    });

    activeHandlers = {
      onSubmit: this.#handleSubmit,
      onCancel: this.#handleCancel,
    };

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

    // Release dispatch pointer when window is closed
    this.#window.on('closed', () => {
      activeHandlers = null;
      this.#window = null;
    });
  }

  #handleSubmit = (url) => {
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
