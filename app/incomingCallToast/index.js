const { BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const Positioner = require('electron-positioner');

class IncomingCallToast {

    constructor(actionListener) {
        this.toast = new BrowserWindow({
            alwaysOnTop: true,
            autoHideMenuBar: true,
            focusable: true,
            frame: false,
            fullscreenable: false,
            height: 240,
            width: 350,
            minimizable: false,
            movable: false,
            resizable: false,
            show: false,
            skipTaskbar: true,
            webPreferences: {
                preload: path.join(__dirname, 'incomingCallToastPreload.js')
            }
        });
        this.toast.loadFile(path.join(__dirname, 'incomingCallToast.html'));
        this.positioner = new Positioner(this.toast);
        ipcMain.on('incoming-call-action', (event, action) => {
            this.hide();
            if (actionListener && typeof actionListener == 'function') {
                actionListener(action);
            }
        });
    }

    show(data) {
        ipcMain.once('incoming-call-toast-ready', () => {
            this.positioner.move('bottomRight');
            this.toast.show();
        });
        this.toast.webContents.send('incoming-call-toast-init', data);
    }

    hide() {
        this.toast.hide();
    }

}

module.exports = IncomingCallToast;