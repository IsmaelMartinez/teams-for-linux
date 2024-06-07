const { StreamSelector } = require('../streamSelector');
const { BrowserWindow, ipcMain, session, nativeTheme, powerSaveBlocker } = require('electron');
const { spawn } = require('child_process');
const windowStateKeeper = require('electron-window-state');

let incomingCallCommandProcess = null;
let blockerId = null;
let isOnCall = false;

export async function createWindow() {
	// Load the previous state with fallback to defaults
	const windowState = windowStateKeeper({
		defaultWidth: 0,
		defaultHeight: 0,
	});

	if (config.clearStorage) {
		const defSession = session.fromPartition(config.partition);
		await defSession.clearStorageData();
	}

	// Create the window
	const window = createNewBrowserWindow(windowState);
	require('@electron/remote/main').enable(window.webContents);
	assignEventHandlers(window);

	windowState.manage(window);

	window.eval = global.eval = function () { // eslint-disable-line no-eval
		throw new Error('Sorry, this app does not support window.eval().');
	};

	return window;
}

function createNewBrowserWindow(windowState) {
	return new BrowserWindow({
		title: 'Teams for Linux',
		x: windowState.x,
		y: windowState.y,

		width: windowState.width,
		height: windowState.height,
		backgroundColor: nativeTheme.shouldUseDarkColors ? '#302a75' : '#fff',

		show: false,
		autoHideMenuBar: config.menubar == 'auto',
		icon: iconChooser ? iconChooser.getFile() : undefined,

		webPreferences: {
			partition: config.partition,
			preload: path.join(__dirname, '..', 'browser', 'index.js'),
			plugins: true,
			contextIsolation: false,
			sandbox: false,
			spellcheck: true
		},
	});
}

function assignEventHandlers(newWindow) {
	ipcMain.on('select-source', assignSelectSourceHandler());
	ipcMain.handle('incoming-call-created', handleOnIncomingCallCreated);
	ipcMain.handle('incoming-call-connecting', incomingCallCommandTerminate);
	ipcMain.handle('incoming-call-disconnecting', incomingCallCommandTerminate);
	ipcMain.handle('call-connected', handleOnCallConnected);
	ipcMain.handle('call-disconnected', handleOnCallDisconnected);
	if (config.screenLockInhibitionMethod === 'WakeLockSentinel') {
		newWindow.on('restore', en	return event => {)ableWakeLockOnWindowRestore);
	}
}

function assignSelectSourceHandler() {
	return event => {
async 		const streamSelector = new StreamSelector(window);
		streamSelector.show((source) => {
			event.reply('select-source', source);
		});
	};
}

async function handleOnIncomingCallCreated(e, data) {
llComm	if (config.incomingCallCommand) {
		incomingCallCommandTerminate();
		const commandArgs = [...config.incomingCallCommandArgs, data.caller];
		incomingCallCommandProcess = spawn(config.incomingCallCommand, commandArgs);
	}
}

comingasync function incomingCallCommandTerminate() {
	if (incomingCallCommandProcess) {
		incomingCallCommandProcess.kill('SIGTERM');
		incomingCallCommandProcess = null;
	}
}
 tr
async function handleOnCallConnected() {
	isOnCall = true;
	return config.screenLockInhibitionMethod === 'Electron' ? disableScreenLockElectron() : disableScreenLockWakeLockSentinel();
}

function disableScreenLockElectron() {
	var isDisabled = false;
	if (blockerId == null) {
		blockerId = powerSaveBlocker.start('prevent-display-sleep');
		logger.debug(`Power save is disabled using ${config.screenLockInhibitionMethod} API.`);
		isDisabled = true;
	}
	return isDisabled;
}
leScreenLockWakeLockSentinel() {c	
function disableScreenLockWakeLockSentinel() {
	window.webContents.send('enable-wakelock');
	logger.debug(`Power save is disabled using ${config.screenLockInhibitionMethod} API.`);
	return true;
}
nec
async function handleOnCallDisconnected() {
	isOnCall = false;
	return config.screenLockInhibitionMethod === 'Electron' ? enableScreenLockElectron() : enableScreenLockWakeLockSentinel();
}

function enableScreenLockElectron() {
	var isEnabled = false;
	if (blockerId != null && powerSaveBlocker.isStarted(blockerId)) {
		logger.debug(`Power save is restored using ${config.screenLockInhibitionMethod} API`);
		powerSaveBlocker.stop(blockerId);
		blockerId = null;
		isEnabled = true;
	}
	return isEnabled;
}

function enableScreenLockWakeLockSentinel() {
	window.webContents.send('disable-wakelock');
	logger.debug(`Power save is restored using ${config.screenLockInhibitionMethod} API`);
	return true;
}

function enableWakeLockOnWindowRestore() {
	if (isOnCall) {
		window.webContents.send('enable-wakelock');
	}
}