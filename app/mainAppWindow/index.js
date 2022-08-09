require('@electron/remote/main').initialize();
const { shell, BrowserWindow, ipcMain } = require('electron');
const windowStateKeeper = require('electron-window-state');
const path = require('path');
const login = require('../login');
const iconPath = path.join(__dirname, '..', 'assets', 'icons', 'icon-96x96.png');
const customCSS = require('../customCSS');
const Menus = require('../menus');
const notifications = require('../notifications');
const onlineOffline = require('../onlineOffline');
const { StreamSelector } = require('../streamSelector');

let aboutBlankRequestCount = 0;

let config;
let window = null;

exports.onAppReady = function onAppReady(mainConfig) {
	config = mainConfig;
	window = createWindow();
	new Menus(window, config, iconPath);

	window.on('page-title-updated', (event, title) => {
		window.webContents.send('page-title', title);
	});

	if (config.enableDesktopNotificationsHack) {
		notifications.addDesktopNotificationHack(iconPath);
	}

	window.webContents.on('new-window', onNewWindow);

	window.webContents.session.webRequest.onBeforeRequest({ urls: ['https://*/*'] }, onBeforeRequestHandler);

	login.handleLoginDialogTry(window);
	if (config.onlineOfflineReload) {
		onlineOffline.reloadPageWhenOfflineToOnline(window, config);
	}

	window.webContents.setUserAgent(config.chromeUserAgent);

	if (!config.minimized) {
		window.once('ready-to-show', () => window.show());
	}

	window.webContents.on('did-finish-load', () => {
		console.log('did-finish-load');
		window.webContents.executeJavaScript(`
			openBrowserButton = document.getElementById('openTeamsClientInBrowser');
			openBrowserButton && openBrowserButton.click();
		`);
		window.webContents.executeJavaScript(`
			tryAgainLink = document.getElementById('try-again-link');
			tryAgainLink && tryAgainLink.click()
		`);
		customCSS.onDidFinishLoad(window.webContents, config);
	});

	window.on('close', () => {
		console.log('window close');
		window.webContents.session.flushStorageData();
	});
	window.on('closed', () => {
		console.log('window closed');
		window = null;
	});

	const url = processArgs(process.argv);
	window.loadURL(url ? url : config.url, { userAgent: config.chromeUserAgent });

	if (config.webDebug) {
		window.openDevTools();
	}
};

let allowFurtherRequests = true;

exports.onAppSecondInstance = function onAppSecondInstance(event, args) {
	console.log('second-instance started');
	if (window) {
		event.preventDefault();
		const url = processArgs(args);
		if (url && allowFurtherRequests) {
			allowFurtherRequests = false;
			setTimeout(() => { allowFurtherRequests = true; }, 5000);
			window.loadURL(url, { userAgent: config.chromeUserAgent });
		}
		if (window.isMinimized()) window.restore();
		window.focus();
	}
};

function processArgs(args) {
	console.debug('processArgs', args);
	for (const arg of args) {
		if (arg.startsWith('https://teams.microsoft.com/l/meetup-join/')) {
			console.log('meetup-join argument received with https protocol');
			window.show();
			return arg;
		}
		if (arg.startsWith('msteams:/l/meetup-join/')) {
			console.log('meetup-join argument received with msteams protocol');
			window.show();
			return config.url + arg.substring(8, arg.length);
		}
	}
}

function onBeforeRequestHandler(details, callback) {
	// Check if the counter was incremented
	if (aboutBlankRequestCount < 1) {
		// Proceed normally
		callback({});
	} else {
		// Open the request externally
		console.debug('DEBUG - webRequest to  ' + details.url + ' intercepted!');
		shell.openExternal(details.url);
		// decrement the counter
		aboutBlankRequestCount -= 1;
		callback({ cancel: true });
	}
}

function onNewWindow(event, url, frame, disposition, options) {
	if (url.startsWith('https://teams.microsoft.com/l/meetup-join')) {
		event.preventDefault();
	} else if (url === 'about:blank' || url === 'about:blank#blocked') {
		event.preventDefault();
		// Increment the counter
		aboutBlankRequestCount += 1;
		// Create a new hidden window to load the request in the background
		console.debug('DEBUG - captured about:blank');
		const win = new BrowserWindow({
			webContents: options.webContents, // use existing webContents if provided
			show: false
		});

		// Close the new window once it is done loading.
		win.once('ready-to-show', () => win.close());

		event.newGuest = win;
	} else if (disposition !== 'background-tab') {
		event.preventDefault();
		shell.openExternal(url);
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
			preload: path.join(__dirname, '..', 'browser', 'index.js'),
			plugins: true,
			contextIsolation: false,
			sandbox:false
		},
	});
	require('@electron/remote/main').enable(window.webContents);

	ipcMain.on('select-source', event => {
		const streamSelector = new StreamSelector(window);
		streamSelector.show((source) => {
			event.reply('select-source', source);
		});
	});

	windowState.manage(window);
	window.eval = global.eval = function () { // eslint-disable-line no-eval
		throw new Error('Sorry, this app does not support window.eval().');
	};

	return window;
}
