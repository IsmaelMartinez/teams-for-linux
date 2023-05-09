require('@electron/remote/main').initialize();
const { shell, BrowserWindow, ipcMain, app, session, nativeTheme, powerSaveBlocker, dialog } = require('electron');
const isDarkMode = nativeTheme.shouldUseDarkColors;
const windowStateKeeper = require('electron-window-state');
const path = require('path');
const login = require('../login');
const customCSS = require('../customCSS');
const Menus = require('../menus');
const onlineOffline = require('../onlineOffline');
const { StreamSelector } = require('../streamSelector');
const { LucidLog } = require('lucid-log');
const { SpellCheckProvider } = require('../spellCheckProvider');

let blockerId = null;

let isOnCall = false;

let isControlPressed = false;

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

	addEventHandlers();

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
	const spellCheckProvider = new SpellCheckProvider(window, logger);
	if (spellCheckProvider.setLanguages(languages).length == 0) {
		// If failed to set user supplied languages, fallback to system locale.
		const systemList = [app.getLocale()];
		if (app.getLocale() !== app.getSystemLocale()) {
			systemList.push(app.getSystemLocale());
		}
		spellCheckProvider.setLanguages(systemList);
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

/**
 * @param {Electron.OnBeforeRequestListenerDetails} details 
 * @param {Electron.CallbackResponse} callback 
 */
function onBeforeRequestHandler(details, callback) {
	if (details.url.startsWith('https://statics.teams.cdn.office.net/teams-for-linux/custom-bg/')) {
		const imgUrl = details.url.replace('https://statics.teams.cdn.office.net/teams-for-linux/custom-bg/', 'http://localhost/');
		callback({ redirectURL: imgUrl });
	}
	// Check if the counter was incremented
	else if (aboutBlankRequestCount < 1) {
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

/**
 * @param {Electron.OnHeadersReceivedListenerDetails} details 
 * @param {Electron.HeadersReceivedResponse} callback 
 */
function onHeadersReceivedHandler(details, callback) {
	if (details.responseHeaders['content-security-policy']) {
		const policies = details.responseHeaders['content-security-policy'][0].split(';');
		setImgSrcSecurityPolicy(policies);
		setConnectSrcSecurityPolicy(policies);
		details.responseHeaders['content-security-policy'][0] = policies.join(';');
	}
	callback({
		responseHeaders: details.responseHeaders
	});
}

function setConnectSrcSecurityPolicy(policies) {
	const connectsrcIndex = policies.findIndex(f => f.indexOf('connect-src') >= 0);
	if (connectsrcIndex >= 0) {
		policies[connectsrcIndex] = policies[connectsrcIndex] + ' http://localhost:*';
	}
}

function setImgSrcSecurityPolicy(policies) {
	const imgsrcIndex = policies.findIndex(f => f.indexOf('img-src') >= 0);
	if (imgsrcIndex >= 0) {
		policies[imgsrcIndex] = policies[imgsrcIndex] + ' http://localhost:*';
	}
}

/**
 * @param {Electron.OnBeforeSendHeadersListenerDetails} detail 
 * @param {Electron.BeforeSendResponse} callback 
 */
function onBeforeSendHeadersHandler(detail, callback) {
	if (detail.url.startsWith('http://localhost/')) {
		detail.requestHeaders['Access-Control-Allow-Origin'] = '*';
	}
	callback({
		requestHeaders: detail.requestHeaders
	});
}

/**
 * @param {Electron.HandlerDetails} details 
 * @returns {{action: 'deny'} | {action: 'allow', outlivesOpener?: boolean, overrideBrowserWindowOptions?: Electron.BrowserWindowConstructorOptions}}
 */
function onNewWindow(details) {
	if (details.url.startsWith('https://teams.microsoft.com/l/meetup-join')) {
		logger.debug('DEBUG - captured meetup-join url');
		return { action: 'deny' };
	} else if (details.url === 'about:blank' || details.url === 'about:blank#blocked') {
		// Increment the counter
		aboutBlankRequestCount += 1;
		// Create a new hidden window to load the request in the background
		logger.debug('DEBUG - captured about:blank');
		const win = new BrowserWindow({
			webContents: details.options.webContents, // use existing webContents if provided
			show: false
		});

		// Close the new window once it is done loading.
		win.once('ready-to-show', () => win.close());

		return { action: 'deny' };
	}

	return secureOpenLink(details);
}

function onPageTitleUpdated(event, title) {
	window.webContents.send('page-title', title);
}

function onWindowClosed() {
	logger.debug('window closed');
	window = null;
	app.quit();
}

function addEventHandlers() {
	window.on('page-title-updated', onPageTitleUpdated);
	window.webContents.setWindowOpenHandler(onNewWindow);
	window.webContents.session.webRequest.onBeforeRequest({ urls: ['https://*/*'] }, onBeforeRequestHandler);
	window.webContents.session.webRequest.onHeadersReceived({ urls: ['https://*/*'] }, onHeadersReceivedHandler);
	window.webContents.session.webRequest.onBeforeSendHeaders({ urls: ['http://*/*'] }, onBeforeSendHeadersHandler);
	login.handleLoginDialogTry(window);
	window.webContents.on('did-finish-load', onDidFinishLoad);
	window.on('closed', onWindowClosed);
	window.webContents.addListener('before-input-event', onBeforeInput);
}


/**
 * @param {Electron.Event} event 
 * @param {Electron.Input} input 
 */
function onBeforeInput(event, input) {
	isControlPressed = input.control;
}

/**
 * @param {Electron.HandlerDetails} details 
 * @returns {{action: 'deny'} | {action: 'allow', outlivesOpener?: boolean, overrideBrowserWindowOptions?: Electron.BrowserWindowConstructorOptions}}
 */
function secureOpenLink(details) {
	logger.debug(`Requesting to open '${details.url}'`);
	const action = getLinkAction();

	if (action === 0) {
		shell.openExternal(details.url);
	}

	/**
	 * @type {{action: 'deny'} | {action: 'allow', outlivesOpener?: boolean, overrideBrowserWindowOptions?: Electron.BrowserWindowConstructorOptions}}
	 */
	const returnValue = action === 1 ? {
		action: 'allow',
		overrideBrowserWindowOptions: {
			modal: true,
			useContentSize: true,
			parent: window
		}
	} : { action: 'deny' };

	if (action === 1) {
		removePopupWindowMenu();
	}

	return returnValue;
}

function getLinkAction() {
	const action = isControlPressed ? dialog.showMessageBoxSync(window, {
		type: 'warning',
		buttons: ['Allow', 'Deny'],
		title: 'Open URL',
		normalizeAccessKeys: true,
		defaultId: 1,
		cancelId: 1,
		message: 'This will open the URL in the application context. If this is for SSO, click Allow otherwise Deny.'
	}) + 1 : 0;

	isControlPressed = false;
	return action;
}

async function removePopupWindowMenu() {
	for (var i = 1; i <= 200; i++) {
		await sleep(10);
		const childWindows = window.getChildWindows();
		if (childWindows.length) {
			childWindows[0].removeMenu();
			break;
		}
	}
	return;
}

async function sleep(ms) {
	return await new Promise(r => setTimeout(r, ms));
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
	assignEventHandlers(window);

	windowState.manage(window);

	window.eval = global.eval = function () { // eslint-disable-line no-eval
		throw new Error('Sorry, this app does not support window.eval().');
	};

	return window;
}

function assignEventHandlers(newWindow) {
	ipcMain.on('select-source', assignSelectSourceHandler());
	ipcMain.handle('call-connected', handleOnCallConnected);
	ipcMain.handle('call-disconnected', handleOnCallDisconnected);
	if (config.screenLockInhibitionMethod === 'WakeLockSentinel') {
		newWindow.on('restore', enableWakeLockOnWindowRestore);
	}
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

function assignSelectSourceHandler() {
	return event => {
		const streamSelector = new StreamSelector(window);
		streamSelector.show((source) => {
			event.reply('select-source', source);
		});
	};
}

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

function disableScreenLockWakeLockSentinel() {
	window.webContents.send('enable-wakelock');
	logger.debug(`Power save is disabled using ${config.screenLockInhibitionMethod} API.`);
	return true;
}

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