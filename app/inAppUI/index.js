const { BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let inAppUIWindow = null;

function createInAppWindow(options) {
    const { 
        width, 
        height, 
        show, 
        frame, 
        preload, 
        htmlFile, 
        alwaysOnTop, 
        partition 
    } = options;

    const window = new BrowserWindow({
        width: width || 800,
        height: height || 600,
        show: show || false,
        frame: frame !== undefined ? frame : true,
        alwaysOnTop: alwaysOnTop || false,
        webPreferences: {
            preload: path.join(__dirname, preload),
            nodeIntegration: false,
            contextIsolation: true,
            partition: partition || undefined,
        },
    });

    window.loadFile(path.join(__dirname, htmlFile));

    window.once('ready-to-show', () => {
        window.show();
    });

    window.on('closed', () => {
        // Handle window closure, e.g., set inAppUIWindow to null if it was the in-app UI
        if (htmlFile === 'inAppUI.html') {
            inAppUIWindow = null;
        }
    });

    return window;
}

function createInAppUIWindow() {
    if (inAppUIWindow) {
        inAppUIWindow.focus();
        return;
    }

    inAppUIWindow = createInAppWindow({
        width: 800,
        height: 600,
        show: false,
        frame: false,
        preload: 'preload.js',
        htmlFile: 'inAppUI.html',
    });
}

ipcMain.on('close-in-app-ui-window', () => {
    if (inAppUIWindow) {
        inAppUIWindow.close();
    }
});

function createCallPopOutWindow(config) {
    createInAppWindow({
        width: 500,
        height: 400,
        show: false,
        alwaysOnTop: config.alwaysOnTop || false,
        preload: 'callPopOutPreload.js',
        htmlFile: 'callPopOut.html',
        partition: 'persist:teams-for-linux-session',
    });
}

module.exports = {
    createInAppUIWindow,
    createCallPopOutWindow,
};
