const { BrowserWindow, ipcMain, session, nativeTheme, powerSaveBlocker } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const windowStateKeeper = require('electron-window-state');
const { StreamSelector } = require('../streamSelector');

class BrowserWindowManager {

    constructor(properties) {
        this.config = properties.config;
        this.iconChooser = properties.iconChooser;
        this.isOnCall = false;
        this.incomingCallCommandProcess = null;
        this.blockerId = null;
        this.window = null;
    }

    async createWindow() {
        // Load the previous state with fallback to defaults
        const windowState = windowStateKeeper({
            defaultWidth: 0,
            defaultHeight: 0,
        });

        if (this.config.clearStorage) {
            const defSession = session.fromPartition(this.config.partition);
            await defSession.clearStorageData();
        }

        // Create the window
        this.window = this.createNewBrowserWindow(windowState);
        require('@electron/remote/main').enable(this.window.webContents);
        this.assignEventHandlers();

        windowState.manage(this.window);

        this.window.eval = global.eval = function () { // eslint-disable-line no-eval
            throw new Error('Sorry, this app does not support window.eval().');
        };

        return this.window;
    }

    createNewBrowserWindow(windowState) {
        return new BrowserWindow({
            title: 'Teams for Linux',
            x: windowState.x,
            y: windowState.y,

            width: windowState.width,
            height: windowState.height,
            backgroundColor: nativeTheme.shouldUseDarkColors ? '#302a75' : '#fff',

            show: false,
            autoHideMenuBar: this.config.menubar == 'auto',
            icon: this.iconChooser ? this.iconChooser.getFile() : undefined,

            webPreferences: {
                partition: this.config.partition,
                preload: path.join(__dirname, '..', 'browser', 'index.js'),
                plugins: true,
                contextIsolation: this.config.contextIsolation,
                sandbox: this.config.sandbox,
                spellcheck: true
            },
        });
    }

    assignEventHandlers() {
        ipcMain.on('select-source', this.assignSelectSourceHandler());
        ipcMain.handle('incoming-call-created', this.handleOnIncomingCallCreated);
        ipcMain.handle('incoming-call-connecting', this.incomingCallCommandTerminate);
        ipcMain.handle('incoming-call-disconnecting', this.incomingCallCommandTerminate);
        ipcMain.handle('call-connected', this.handleOnCallConnected);
        ipcMain.handle('call-disconnected', this.handleOnCallDisconnected);
        if (this.config.screenLockInhibitionMethod === 'WakeLockSentinel') {
            this.window.on('restore', this.enableWakeLockOnWindowRestore);
        }
    }

    assignSelectSourceHandler() {
        return event => {
            const streamSelector = new StreamSelector(this.window);
            streamSelector.show((source) => {
                event.reply('select-source', source);
            });
        };
    }
    
    async handleOnIncomingCallCreated(e, data) {
        if (this.config.incomingCallCommand) {
            this.incomingCallCommandTerminate();
            const commandArgs = [...this.config.incomingCallCommandArgs, data.caller];
            this.incomingCallCommandProcess = spawn(this.config.incomingCallCommand, commandArgs);
        }
    }

    async incomingCallCommandTerminate() {
        if (this.incomingCallCommandProcess) {
            this.incomingCallCommandProcess.kill('SIGTERM');
            this.incomingCallCommandProcess = null;
        }
    }
    
    async handleOnCallConnected() {
        this.isOnCall = true;
        return this.config.screenLockInhibitionMethod === 'Electron' ? this.disableScreenLockElectron() : this.disableScreenLockWakeLockSentinel();
    }

    disableScreenLockElectron() {
        if (this.blockerId == null) {
            this.blockerId = powerSaveBlocker.start('prevent-display-sleep');
            console.debug(`Power save is disabled using ${this.config.screenLockInhibitionMethod} API.`);
            return true;
        }
        return false;
    }
    
    disableScreenLockWakeLockSentinel() {
        this.window.webContents.send('enable-wakelock');
        console.debug(`Power save is disabled using ${this.config.screenLockInhibitionMethod} API.`);
        return true;
    }
    
    async handleOnCallDisconnected() {
        this.isOnCall = false;
        return this.config.screenLockInhibitionMethod === 'Electron' ? this.enableScreenLockElectron() : this.enableScreenLockWakeLockSentinel();
    }
    
    enableScreenLockElectron() {
        if (this.blockerId != null && powerSaveBlocker.isStarted(this.blockerId)) {
            console.debug(`Power save is restored using ${this.config.screenLockInhibitionMethod} API`);
            powerSaveBlocker.stop(this.blockerId);
            this.blockerId = null;
            return true;
        }
        return false;
    }
    
    enableScreenLockWakeLockSentinel() {
        this.window.webContents.send('disable-wakelock');
        console.debug(`Power save is restored using ${this.config.screenLockInhibitionMethod} API`);
        return true;
    }
    
    enableWakeLockOnWindowRestore() {
        if (this.isOnCall) {
            this.window.webContents.send('enable-wakelock');
        }
    }
}

module.exports = BrowserWindowManager;
