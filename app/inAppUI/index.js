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

function createCallPopOutWindow(config) {
    const callPopOutWindow = new BrowserWindow({
        width: 1000,
        height: 800,
        show: false,
        alwaysOnTop: config.alwaysOnTop || false,
        webPreferences: {
            preload: path.join(__dirname, 'callPopOutPreload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            partition: 'persist:teams-for-linux-session' // Share session
        },
    });

    callPopOutWindow.loadFile(path.join(__dirname, 'callPopOut.html'));

    callPopOutWindow.once('ready-to-show', () => {
        callPopOutWindow.show();
    });
}

module.exports = {
    createInAppUIWindow,
    createCallPopOutWindow,
};
