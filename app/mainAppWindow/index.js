require('@electron/remote/main').initialize();
const { shell, BrowserWindow, ipcMain, app, session, nativeTheme, powerSaveBlocker, dialog, webFrameMain, Notification } = require('electron');
const isDarkMode = nativeTheme.shouldUseDarkColors;
const windowStateKeeper = require('electron-window-state');
const path = require('path');
const login = require('../login');
const customCSS = require('../customCSS');
const Menus = require('../menus');
const { StreamSelector } = require('../streamSelector');
const { LucidLog } = require('lucid-log');
const { SpellCheckProvider } = require('../spellCheckProvider');
const { httpHelper } = require('../helpers');
const { execFile, spawn } = require('child_process');
const TrayIconChooser = require('../browser/tools/trayIconChooser');
// eslint-disable-next-line no-unused-vars
const { AppConfiguration } = require('../appConfiguration');
const connMgr = require('../connectionManager');
const fs = require('fs');

/**
 * @type {TrayIconChooser}
 */
let iconChooser;

let intune;

let blockerId = null;

let isOnCall = false;

let isControlPressed = false;

let incomingCallCommandProcess = null;

let lastNotifyTime = null;

/**
 * @type {URL}
 */
let customBGServiceUrl;

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

/**
 * @type {AppConfiguration}
 */
let appConfig = null;

/**
 * @param {AppConfiguration} configGroup
 */
exports.onAppReady = async function onAppReady(configGroup) {
	appConfig = configGroup;
	config = configGroup.startupConfig;
	logger = new LucidLog({
		levels: config.appLogLevels.split(',')
	});

	if (config.ssoInTuneEnabled) {
		intune = require('../intune');
		intune.initSso(logger, config.ssoInTuneAuthUser);
	}

	window = await createWindow();

	if (config.trayIconEnabled) {
		iconChooser = new TrayIconChooser(configGroup.startupConfig);
		const m = new Menus(window, configGroup, iconChooser.getFile());
		m.onSpellCheckerLanguageChanged = onSpellCheckerLanguageChanged;
	}
	
	addEventHandlers();

	login.handleLoginDialogTry(window, {'ssoBasicAuthUser': config.ssoBasicAuthUser, 'ssoBasicAuthPasswordCommand': config.ssoBasicAuthPasswordCommand});

	const url = processArgs(process.argv);
	connMgr.start(url, {
		window: window,
		config: config
	});

	applyAppConfiguration(config, window);
};

function onSpellCheckerLanguageChanged(languages) {
	appConfig.legacyConfigStore.set('spellCheckerLanguages', languages);
}

let allowFurtherRequests = true;

exports.show = function(){
	window.show();
};

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

	if (typeof config.clientCertPath !== 'undefined' && config.clientCertPath !== '') {
		app.importCertificate({ certificate: config.clientCertPath, password: config.clientCertPassword }, (result) => {
			logger.info('Loaded certificate: ' + config.clientCertPath + ', result: ' + result);
		});
	}

	handleTeamsV2OptIn(config);

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

function handleTeamsV2OptIn(config) {
	if (config.optInTeamsV2) {
		setConfigUrlTeamsV2(config);
		window.webContents.executeJavaScript('localStorage.getItem("tmp.isOptedIntoT2Web");', true)
			.then(result => {
				if ((result == null) || !result) {
					window.webContents.executeJavaScript('localStorage.setItem("tmp.isOptedIntoT2Web", true);', true)
						.then(window.reload())
						.catch(err => {
							console.log('could not set localStorage variable', err);
						});
				}
			})
			.catch(err => {
				console.log('could not read localStorage variable', err);
			});
		return;
	}
}

function setConfigUrlTeamsV2(config) {
	if(!config.url.includes('/v2')) {
		config.url = config.url+'/v2/';
	}
}

/**
 * Applies Electron's spell checker capabilities if language codes are provided.
 * @param {Array<string>} languages Array of language codes to use with spell checker.
 * @param {BrowserWindow} window The browser window.
 */
function applySpellCheckerConfiguration(languages, window) {
	const spellCheckProvider = new SpellCheckProvider(window, logger);
	if (spellCheckProvider.setLanguages(languages).length == 0 && languages.length > 0) {
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
	initSystemThemeFollow(config);
}

function initSystemThemeFollow(config) {
	if (config.followSystemTheme) {
		nativeTheme.on('updated', () => {
			window.webContents.send('system-theme-changed', nativeTheme.shouldUseDarkColors);
		});
		setTimeout(() => {
			window.webContents.send('system-theme-changed', nativeTheme.shouldUseDarkColors);
		}, 2500);
	}
}

function onDidFrameFinishLoad(event, isMainFrame, frameProcessId, frameRoutingId) {
	logger.debug('did-frame-finish-load', event, isMainFrame);

	if (isMainFrame) {
		return; // We want to insert CSS only into the Teams V2 content iframe
	}

	const wf = webFrameMain.fromId(frameProcessId, frameRoutingId);
	customCSS.onDidFrameFinishLoad(wf, config);
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
	var regHttps = /^https:\/\/teams\.(microsoft|live)\.com\/.*(?:meetup-join|channel)/g;
	var regMS = /^msteams:\/.*(?:meetup-join|channel)/g;
	logger.debug('processArgs:', args);
	for (const arg of args) {
		if (regHttps.test(arg)) {
			logger.debug('A url argument received with https protocol');
			window.show();
			return arg;
		}
		if (regMS.test(arg)) {
			logger.debug('A url argument received with msteams protocol');
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
		const reqUrl = details.url.replace('https://statics.teams.cdn.office.net/teams-for-linux/custom-bg/', '');
		const imgUrl = getBGRedirectUrl(reqUrl);
		logger.debug(`Forwarding '${details.url}' to '${imgUrl}'`);
		callback({ redirectURL: imgUrl });
	}
	// Custom background replace for teams v2
	else if (details.url.startsWith('https://statics.teams.cdn.office.net/evergreen-assets/backgroundimages/') && config.isCustomBackgroundEnabled) {
		const reqUrl = details.url.replace('https://statics.teams.cdn.office.net/evergreen-assets/backgroundimages/', '');
		const imgUrl = getBGRedirectUrl(reqUrl);
		logger.debug(`Forwarding '${details.url}' to '${imgUrl}'`);
		callback({ redirectURL: imgUrl });
	}
	// Check if the counter was incremented
	else if (aboutBlankRequestCount < 1) {
		// Proceed normally
		callback({});
	} else {
		// Open the request externally
		logger.debug('DEBUG - webRequest to  ' + details.url + ' intercepted!');
		//shell.openExternal(details.url);
		writeUrlBlockLog(details.url);
		// decrement the counter
		aboutBlankRequestCount -= 1;
		callback({ cancel: true });
	}
}

function getBGRedirectUrl(rel) {
	return httpHelper.joinURLs(customBGServiceUrl.href, rel);
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
		policies[connectsrcIndex] = policies[connectsrcIndex] + ` ${customBGServiceUrl.origin}`;
	}
}

function setImgSrcSecurityPolicy(policies) {
	const imgsrcIndex = policies.findIndex(f => f.indexOf('img-src') >= 0);
	if (imgsrcIndex >= 0) {
		policies[imgsrcIndex] = policies[imgsrcIndex] + ` ${customBGServiceUrl.origin}`;
	}
}

/**
 * @param {Electron.OnBeforeSendHeadersListenerDetails} detail
 * @param {Electron.BeforeSendResponse} callback
 */
function onBeforeSendHeadersHandler(detail, callback) {
	if (intune && intune.isSsoUrl(detail.url)) {
		intune.addSsoCookie(logger, detail, callback);
	} else {
		if (detail.url.startsWith(customBGServiceUrl.href)) {
			detail.requestHeaders['Access-Control-Allow-Origin'] = '*';
		}
		callback({
			requestHeaders: detail.requestHeaders
		});
	}
}

/**
 * @param {Electron.HandlerDetails} details
 * @returns {{action: 'deny'} | {action: 'allow', outlivesOpener?: boolean, overrideBrowserWindowOptions?: Electron.BrowserWindowConstructorOptions}}
 */
function onNewWindow(details) {
	if (	
			details.url.startsWith('https://teams.microsoft.com/l/meetup-join') || 
			details.url.startsWith('https://teams.microsoft.com/v2/l/meetup-join') ||
			details.url.startsWith('https://teams.live.com/l/meetup-join') ||
			details.url.startsWith('https://teams.live.com/v2/l/meetup-join') 
	) {
		logger.debug('DEBUG - captured meetup-join url');
		return { action: 'deny' };
	} else if (details.url === 'about:blank' || details.url === 'about:blank#blocked') {
		// Increment the counter
		aboutBlankRequestCount += 1;

		logger.debug('DEBUG - captured about:blank');

		return { action: 'deny' };
	}

	return secureOpenLink(details);
}

/**
 * @param {string} url
 */
async function writeUrlBlockLog(url) {
	const curBlockTime = new Date();
	const logfile = path.join(appConfig.configPath, 'teams-for-linux-blocked.log');
	const lstream = fs.createWriteStream(logfile, { flags: 'a' }).on('error', onLogStreamError);
	lstream.write(`[${new Date().toLocaleString()}]: Blocked '${url}'\n`, onLogStreamError);
	lstream.end();
	const notifDuration = lastNotifyTime == null ? 60 : (curBlockTime.getTime() - lastNotifyTime.getTime()) / 1000;
	if (notifDuration >= 60) {
		new Notification({
			title: 'Teams for Linux',
			body: 'One or more web requests have been blocked. Please check the log for more details.'
		}).show();
		lastNotifyTime = curBlockTime;
	}
}

/**
 * @param {Error} e
 */
function onLogStreamError(e) {
	if (e) {
		logger.error(e.message);
	}
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
	initializeCustomBGServiceURL();
	window.on('page-title-updated', onPageTitleUpdated);
	window.webContents.setWindowOpenHandler(onNewWindow);
	window.webContents.session.webRequest.onBeforeRequest({ urls: ['https://*/*'] }, onBeforeRequestHandler);
	window.webContents.session.webRequest.onHeadersReceived({ urls: ['https://*/*'] }, onHeadersReceivedHandler);
	window.webContents.session.webRequest.onBeforeSendHeaders(getWebRequestFilterFromURL(), onBeforeSendHeadersHandler);
	window.webContents.on('did-finish-load', onDidFinishLoad);
	window.webContents.on('did-frame-finish-load', onDidFrameFinishLoad);
	window.on('closed', onWindowClosed);
	window.webContents.addListener('before-input-event', onBeforeInput);
}

function getWebRequestFilterFromURL() {
	const filter = customBGServiceUrl.protocol === 'http:' ? { urls: ['http://*/*'] } : { urls: ['https://*/*'] };
	if (intune) {
		intune.setupUrlFilter(filter);
	}
	
	return filter;
}

function initializeCustomBGServiceURL() {
	try {
		customBGServiceUrl = new URL('', config.customBGServiceBaseUrl);
		logger.debug(`Custom background service url is '${config.customBGServiceBaseUrl}'`);
	}
	catch (err) {
		logger.error(`Invalid custom background service url '${config.customBGServiceBaseUrl}', updating to default 'http://localhost'`);
		customBGServiceUrl = new URL('', 'http://localhost');
	}
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
		openInBrowser(details);
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

function openInBrowser(details) {
	if (config.defaultURLHandler.trim() !== '') {
		execFile(config.defaultURLHandler.trim(), [details.url], openInBrowserErrorHandler);
	} else {
		shell.openExternal(details.url);
	}
}

function openInBrowserErrorHandler(error) {
	if (error) {
		logger.error(error.message);
	}
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
	ipcMain.handle('incoming-call-created', handleOnIncomingCallCreated);
	ipcMain.handle('incoming-call-connecting', incomingCallCommandTerminate);
	ipcMain.handle('incoming-call-disconnecting', incomingCallCommandTerminate);
	ipcMain.handle('call-connected', handleOnCallConnected);
	ipcMain.handle('call-disconnected', handleOnCallDisconnected);
	if (config.screenLockInhibitionMethod === 'WakeLockSentinel') {
		newWindow.on('restore', enableWakeLockOnWindowRestore);
	}
}

function createNewBrowserWindow(windowState) {
	return new BrowserWindow({
		title: 'Teams for Linux',
		x: windowState.x,
		y: windowState.y,

		width: windowState.width,
		height: windowState.height,
		backgroundColor: isDarkMode ? '#302a75' : '#fff',

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

function assignSelectSourceHandler() {
	return event => {
		const streamSelector = new StreamSelector(window);
		streamSelector.show((source) => {
			event.reply('select-source', source);
		});
	};
}

async function handleOnIncomingCallCreated(e, data) {
	if (config.incomingCallCommand) {
		incomingCallCommandTerminate();
		const commandArgs = [...config.incomingCallCommandArgs, data.caller];
		incomingCallCommandProcess = spawn(config.incomingCallCommand, commandArgs);
	}
}

async function incomingCallCommandTerminate() {
	if (incomingCallCommandProcess) {
		incomingCallCommandProcess.kill('SIGTERM');
		incomingCallCommandProcess = null;
	}
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
