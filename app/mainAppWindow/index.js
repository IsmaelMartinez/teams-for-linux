require('@electron/remote/main').initialize();
const { shell, BrowserWindow, ipcMain, app, session, nativeTheme } = require('electron');
const isDarkMode = nativeTheme.shouldUseDarkColors;
const windowStateKeeper = require('electron-window-state');
const path = require('path');
const login = require('../login');
const customCSS = require('../customCSS');
const Menus = require('../menus');
const notifications = require('../notifications');
const onlineOffline = require('../onlineOffline');
const { StreamSelector } = require('../streamSelector');
const { LucidLog } = require('lucid-log');

/**
 * @type {LucidLog}
 */
let logger;

let aboutBlankRequestCount = 0;
let config;

/**
 * @type {BrowserWindow}
 */
let window = null;

exports.onAppReady = async function onAppReady(mainConfig) {
	config = mainConfig;
	logger = new LucidLog({
		levels: config.appLogLevels.split(',')
	});

	window = await createWindow();
	new Menus(window, config, config.appIcon);

	window.on('page-title-updated', (event, title) => {
		window.webContents.send('page-title', title);
	});

	window.webContents.on('new-window', onNewWindow);

	window.webContents.session.webRequest.onBeforeRequest({ urls: ['https://*/*'] }, onBeforeRequestHandler);

	login.handleLoginDialogTry(window);

	window.webContents.on('did-finish-load', onDidFinishLoad);

	window.on('closed', () => {
		logger.debug('window closed');
		window = null;
		app.quit();
	});

	const url = processArgs(process.argv);
	window.loadURL(url ? url : config.url, { userAgent: config.chromeUserAgent });

	applyAppConfiguration(config, window);
};

let allowFurtherRequests = true;

exports.onAppSecondInstance = function onAppSecondInstance(event, args) {
	logger.debug('second-instance started');
	if (window) {
		event.preventDefault();
		const url = processArgs(args);
		if (url && allowFurtherRequests) {
			allowFurtherRequests = false;
			setTimeout(() => { allowFurtherRequests = true; }, 5000);
			window.loadURL(url, { userAgent: config.chromeUserAgent });
		}

		restoreWindow();
	}
};

/**
 * Applies the configuration passed as arguments when executing the app.
 * @param config Configuration object.
 * @param {BrowserWindow} window The browser window.
 */
function applyAppConfiguration(config, window) {
	if (config.enableDesktopNotificationsHack) {
		// eslint-disable-next-line no-undef
		notifications.addDesktopNotificationHack(iconPath);
	}

	applySpellCheckerConfiguration(config.spellCheckerLanguages, window);

	if (config.onlineOfflineReload) {
		onlineOffline.reloadPageWhenOfflineToOnline(window, config);
	}

	if (typeof config.clientCertPath !== 'undefined') {
		app.importCertificate({ certificate: config.clientCertPath, password: config.clientCertPassword }, (result) => {
			logger.info('Loaded certificate: ' + config.clientCertPath + ', result: ' + result);
		});
	}

	window.webContents.setUserAgent(config.chromeUserAgent);

	if (!config.minimized) {
		window.show();
	} else {
		window.hide();
	}

	if (config.webDebug) {
		window.openDevTools();
	}
}

/**
 * Applies Electron's spell checker capabilities if language codes are provided.
 * @param {Array<string>} languages Array of language codes to use with spell checker.
 * @param {BrowserWindow} window The browser window.
 */
function applySpellCheckerConfiguration(languages, window) {
	if (languages) {
		try {
			window.webContents.session.setSpellCheckerLanguages(languages);
		} catch (error) {
			logger.warn('Specified languages are not correct. Falling back to en-US');
			window.webContents.session.setSpellCheckerLanguages(['en-US']);
		}
	}
}

function onDidFinishLoad() {
	logger.debug('did-finish-load');
	window.webContents.executeJavaScript(`
			openBrowserButton = document.querySelector('[data-tid=joinOnWeb]');
			openBrowserButton && openBrowserButton.click();
		`);
	window.webContents.executeJavaScript(`
			tryAgainLink = document.getElementById('try-again-link');
			tryAgainLink && tryAgainLink.click()
		`);
	customCSS.onDidFinishLoad(window.webContents, config);
}

function restoreWindow() {
	// If minimized, restore.
	if (window.isMinimized()) {
		window.restore();
	}

	// If closed to tray, show.
	else if (!window.isVisible()) {
		window.show();
	}

	window.focus();
}

function processArgs(args) {
	logger.debug('processArgs:', args);
	for (const arg of args) {
		if (arg.startsWith('https://teams.microsoft.com/l/meetup-join/')) {
			logger.debug('meetup-join argument received with https protocol');
			window.show();
			return arg;
		}
		if (arg.startsWith('msteams:/l/meetup-join/')) {
			logger.debug('meetup-join argument received with msteams protocol');
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
		logger.debug('DEBUG - webRequest to  ' + details.url + ' intercepted!');
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
		logger.debug('DEBUG - captured about:blank');
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

async function createWindow() {
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
	ipcMain.on('select-source', assignSelectSourceHandler(window));

	windowState.manage(window);

	window.eval = global.eval = function () { // eslint-disable-line no-eval
		throw new Error('Sorry, this app does not support window.eval().');
	};

	return window;
}

function createNewBrowserWindow(windowState) {
	return new BrowserWindow({
		x: windowState.x,
		y: windowState.y,

		width: windowState.width,
		height: windowState.height,
		backgroundColor: isDarkMode ? '#302a75' : '#fff',

		show: false,
		autoHideMenuBar: true,
		icon: config.appIcon,

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

function assignSelectSourceHandler(window) {
	return event => {
		const streamSelector = new StreamSelector(window);
		streamSelector.show((source) => {
			event.reply('select-source', source);
		});
	};
}
