const { shell, app, BrowserWindow } = require('electron');
const windowStateKeeper = require('electron-window-state');
const path = require('path');
const iconPath = path.join(__dirname, 'assets', 'icons', 'icon-96x96.png');
const config = require('./config')(app.getPath('userData'));
const login = require('./login');
const certificate = require('./certificate');
const customCSS = require('./customCSS');
const Menus = require('./menus');
const notifications = require('./notifications');
const onlineOffline = require('./onlineOffline');
const gotTheLock = app.requestSingleInstanceLock();

let window = null;
global.config = config;

app.commandLine.appendSwitch('auth-server-whitelist', config.authServerWhitelist);
app.commandLine.appendSwitch('enable-ntlm-v2', config.ntlmV2enabled);
app.setAsDefaultProtocolClient('msteams');

if (!gotTheLock) {
	console.warn('App already running');
	app.quit();
} else {
	app.on('second-instance', onAppSecondInstance);
	app.on('ready', onAppReady);
	app.on('certificate-error', certificate.onAppCertificateError);
}

function onAppSecondInstance (args) {
	console.log('second-instance started');
	if (window) {
		console.log('focusing on window');
		if (window.isMinimized()) window.restore();
		window.focus();
		window.webContents.send('openUrl', args[0]);
	}
}

function onAppReady() {
	window = createWindow();
	new Menus(window, config, iconPath);

	window.on('page-title-updated', (event, title) => {
		window.webContents.send('page-title', title);
	});

	if (config.enableDesktopNotificationsHack) {
		notifications.addDesktopNotificationHack(iconPath);
	}

	window.webContents.on('new-window', (event, url, frame, disposition) => {
		if (url.startsWith('https://teams.microsoft.com/l/meetup-join')) {
			event.preventDefault();
			window.loadURL(url);
		} else if ((disposition !== 'background-tab') && (url !== 'about:blank')) {
			event.preventDefault();
			shell.openExternal(url);
		}
	});

	login.handleLoginDialogTry(window);
	if (config.onlineOfflineReload) {
		onlineOffline.reloadPageWhenOfflineToOnline(window, config.url);
	}

	window.webContents.setUserAgent(config.chromeUserAgent);

	if (!config.minimized) {
		window.once('ready-to-show', () => window.show());
	}

	window.webContents.on('did-finish-load', () => {
		customCSS.onDidFinishLoad(window.webContents)
	});

	window.on('closed', () => { window = null; });

	window.loadURL(config.url);

	if (config.webDebug) {
		window.openDevTools();
	}
}

function createWindow() {
	// Load the previous state with fallback to defaults
	const windowState = windowStateKeeper({
		defaultWidth: 0,
		defaultHeight: 0,
	});

	// Create the window
	const window = new BrowserWindow({
		x: windowState.x,
		y: windowState.y,

		width: windowState.width,
		height: windowState.height,
		backgroundColor: '#fff',

		show: false,
		autoHideMenuBar: true,
		icon: iconPath,

		webPreferences: {
			partition: config.partition,
			preload: path.join(__dirname, 'browser', 'index.js'),
			nativeWindowOpen: true,
			plugins: true,
			nodeIntegration: false,
		},
	});

	windowState.manage(window);
	window.eval = global.eval = function () { // eslint-disable-line no-eval
		throw new Error('Sorry, this app does not support window.eval().');
	};

	return window;
}
