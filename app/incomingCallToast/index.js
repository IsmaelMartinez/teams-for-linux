const { BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const Positioner = require('electron-positioner');

class IncomingCallToast {

    constructor(actionListener) {
        this.actionListener = actionListener;
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
    }

    show(data) {
        this.toast.webContents.send('incoming-call-toast-init', data);
        this.positioner.move('bottomRight');
        this.toast.show();
    }

    hide() {
        this.toast.hide();
    }
    
    handleAction(action) {
        this.hide();
        if (this.actionListener && typeof this.actionListener == 'function') {
            this.actionListener(action);
        }
    }

}

module.exports = IncomingCallToast;