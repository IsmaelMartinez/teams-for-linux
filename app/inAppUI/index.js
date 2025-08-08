const { BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let inAppUIWindow = null;

function createInAppUIWindow() {
    if (inAppUIWindow) {
        inAppUIWindow.focus();
        return;
    }

    inAppUIWindow = new BrowserWindow({
        width: 800,
        height: 600,
        show: false,
        frame: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    inAppUIWindow.loadFile(path.join(__dirname, 'inAppUI.html'));

    inAppUIWindow.once('ready-to-show', () => {
        inAppUIWindow.show();
    });

    inAppUIWindow.on('closed', () => {
        inAppUIWindow = null;
    });
}

ipcMain.on('close-in-app-ui-window', () => {
    if (inAppUIWindow) {
        inAppUIWindow.close();
    }
});

module.exports = {
    createInAppUIWindow,
};
