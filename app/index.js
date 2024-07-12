const { app, dialog, ipcMain, desktopCapturer, globalShortcut, systemPreferences, powerMonitor, Notification, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { httpHelper } = require('./helpers');
const isDev = require('electron-is-dev');
const os = require('os');
const isMac = os.platform() === 'darwin';

// This must be executed before loading the config file.
addCommandLineSwitchesBeforeConfigLoad();

// Load config file.
const { AppConfiguration } = require('./appConfiguration');
const appConfig = new AppConfiguration(app.getPath('userData'), app.getVersion());

const config = appConfig.startupConfig;
config.appPath = path.join(__dirname, isDev ? '' : '../../');

addCommandLineSwitchesAfterConfigLoad();

const notificationSounds = [{
	type: 'new-message',
	file: path.join(config.appPath, 'assets/sounds/new_message.wav')
},
{
	type: 'meeting-started',
	file: path.join(config.appPath, 'assets/sounds/meeting_started.wav')
}];

let userStatus = -1;
let idleTimeUserStatus = -1;

let player;
try {
	const { NodeSound } = require('node-sound');
	player = NodeSound.getDefaultPlayer();
} catch (err) {
	console.info(`No audio players found. Audio notifications might not work. ${err}`);
}

const certificateModule = require('./certificate');
const gotTheLock = app.requestSingleInstanceLock();
const mainAppWindow = require('./mainAppWindow');

if (isMac) {
	requestMediaAccess();
}

const protocolClient = 'msteams';
if (!app.isDefaultProtocolClient(protocolClient, process.execPath)) {
	app.setAsDefaultProtocolClient(protocolClient, process.execPath);
}

app.allowRendererProcessReuse = false;

if (!gotTheLock) {
	console.info('App already running');
	app.quit();
} else {
	app.on('second-instance', mainAppWindow.onAppSecondInstance);
	app.on('ready', handleAppReady);
	app.on('quit', () => console.debug('quit'));
	app.on('render-process-gone', onRenderProcessGone);
	app.on('will-quit', () => console.debug('will-quit'));
	app.on('certificate-error', handleCertificateError);
	app.on('browser-window-focus', handleGlobalShortcutDisabled);
	app.on('browser-window-blur', handleGlobalShortcutDisabledRevert);
	ipcMain.on('config-file-changed', restartApp);
	ipcMain.handle('get-config', async () => { return config } );
	ipcMain.handle('get-system-idle-state', handleGetSystemIdleState);
	ipcMain.handle('get-zoom-level', handleGetZoomLevel);
	ipcMain.handle('save-zoom-level', handleSaveZoomLevel);
	ipcMain.handle('desktop-capturer-get-sources', (_event, opts) => desktopCapturer.getSources(opts));
	ipcMain.handle('get-custom-bg-list', handleGetCustomBGList);
	ipcMain.handle('play-notification-sound', playNotificationSound);
	ipcMain.handle('show-notification', showNotification);
	ipcMain.handle('user-status-changed', userStatusChangedHandler);
	ipcMain.handle('set-badge-count', setBadgeCountHandler);
}

function restartApp() {
	console.info('Restarting app...');
	app.relaunch();
	app.exit();
}

function addCommandLineSwitchesBeforeConfigLoad() {
	// Custom user data directory
	if (app.commandLine.hasSwitch('customUserDir')) {
		app.setPath('userData', app.commandLine.getSwitchValue('customUserDir'));
	}

	app.commandLine.appendSwitch('try-supported-channel-layouts');

	// Disabled features
	const disabledFeatures = app.commandLine.hasSwitch('disable-features') ? app.commandLine.getSwitchValue('disable-features').split(',') : ['HardwareMediaKeyHandling'];

	if (!disabledFeatures.includes('HardwareMediaKeyHandling'))
		disabledFeatures.push('HardwareMediaKeyHandling');

	app.commandLine.appendSwitch('disable-features', disabledFeatures.join(','));
}

function addCommandLineSwitchesAfterConfigLoad() {
	// Wayland
	if (process.env.XDG_SESSION_TYPE === 'wayland') {
		console.info('Running under Wayland, switching to PipeWire...');

		const features = app.commandLine.hasSwitch('enable-features') ? app.commandLine.getSwitchValue('enable-features').split(',') : [];
		if (!features.includes('WebRTCPipeWireCapturer'))
			features.push('WebRTCPipeWireCapturer');

		app.commandLine.appendSwitch('enable-features', features.join(','));
		app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
	}

	// Proxy
	if (config.proxyServer) {
		app.commandLine.appendSwitch('proxy-server', config.proxyServer);
	}

	app.commandLine.appendSwitch('auth-server-whitelist', config.authServerWhitelist);
	app.commandLine.appendSwitch('enable-ntlm-v2', config.ntlmV2enabled);

	// GPU
	if (config.disableGpu) {
		console.info('Disabling GPU support...');
		app.commandLine.appendSwitch('disable-gpu');
		app.commandLine.appendSwitch('disable-software-rasterizer');
	}

	addElectronCLIFlagsFromConfig();
}

function addElectronCLIFlagsFromConfig() {
	if (Array.isArray(config.electronCLIFlags)) {
		for (const flag of config.electronCLIFlags) {
			if (typeof (flag) === 'string') {
				console.debug(`Adding electron CLI flag '${flag}'`);
				app.commandLine.appendSwitch(flag);
			} else if (Array.isArray(flag) && typeof (flag[0]) === 'string') {
				if (!(typeof (flag[1]) === 'undefined' || typeof (flag[1]) === 'object' || typeof (flag[1]) === 'function')) {
					console.debug(`Adding electron CLI flag '${flag[0]}' with value '${flag[1]}'`);
					app.commandLine.appendSwitch(flag[0], flag[1]);
				} else {
					console.debug(`Adding electron CLI flag '${flag[0]}'`);
					app.commandLine.appendSwitch(flag[0]);
				}
			}
		}
	}
}

<<<<<<< Updated upstream
async function showNotification(_event, options) {
=======
async function showNotification(event, options) {
>>>>>>> Stashed changes
	console.debug('Showing notification using electron API');

	playNotificationSound(null, {
		type: options.type,
		audio: 'default',
		title: options.title,
		body: options.body
	});

	const notification = new Notification({
		icon: nativeImage.createFromDataURL(options.icon),
		title: options.title,
		body: options.body,
		urgency: config.defaultNotificationUrgency
	});

	notification.on('click', mainAppWindow.show);

	notification.show();
}

async function playNotificationSound(_event, options) {
	console.debug(`Notification => Type: ${options.type}, Audio: ${options.audio}, Title: ${options.title}, Body: ${options.body}`);
	// Player failed to load or notification sound disabled in config
	if (!player || config.disableNotificationSound) {
		console.debug('Notification sounds are disabled');
		return;
	}
	// Notification sound disabled if not available set in config and user status is not "Available" (or is unknown)
	if (config.disableNotificationSoundIfNotAvailable && userStatus !== 1 && userStatus !== -1) {
		console.debug('Notification sounds are disabled when user is not active');
		return;
	}
	const sound = notificationSounds.filter(ns => {
		return ns.type === options.type;
	})[0];

	if (sound) {
		console.debug(`Playing file: ${sound.file}`);
		await player.play(sound.file);
		return;
	}

	console.debug('No notification sound played', player, options);
}

function onRenderProcessGone() {
	console.debug('render-process-gone');
	app.quit();
}

function onAppTerminated(signal) {
	if (signal === 'SIGTERM') {
		process.abort();
	} else {
		app.quit();
	}
}

function handleAppReady() {
	// check for configuration errors
	if (config.error) {
		dialog.showMessageBox(
			{
				title: 'Configuration error',
				icon: nativeImage.createFromPath(path.join(config.appPath, 'assets/icons/setting-error.256x256.png')),
				message: `Error in config file ${config.error}.\n Loading default configuration`
			}
		);
	}
	if (config.warning) {
		// check for configuration warnings
		dialog.showMessageBox(
			{ 
				title: 'Configuration Warning',
				icon: nativeImage.createFromPath(path.join(config.appPath, 'assets/icons/alert-diamond.256x256.png')),
				message: config.warning
			}
		);
	}
	
	if (config.isCustomBackgroundEnabled) {
		downloadCustomBGServiceRemoteConfig();
	}
	process.on('SIGTRAP', onAppTerminated);
	process.on('SIGINT', onAppTerminated);
	process.on('SIGTERM', onAppTerminated);
	//Just catch the error
	process.stdout.on('error', () => { });
	mainAppWindow.onAppReady(appConfig);
}

async function handleGetSystemIdleState() {
	const systemIdleState = powerMonitor.getSystemIdleState(config.appIdleTimeout);
	console.debug(`GetSystemIdleState => IdleTimeout: ${config.appIdleTimeout}s, IdleTimeoutPollInterval: ${config.appIdleTimeoutCheckInterval}s, ActiveCheckPollInterval: ${config.appActiveCheckInterval}s, IdleTime: ${powerMonitor.getSystemIdleTime()}s, IdleState: '${systemIdleState}'`);

	if (systemIdleState !== 'active' && idleTimeUserStatus == -1) {
		idleTimeUserStatus = userStatus;
	}

	const state = {
		...{
			system: systemIdleState,
			userIdle: idleTimeUserStatus,
			userCurrent: userStatus
		}
	};

	if (systemIdleState === 'active') {
		idleTimeUserStatus = -1
	}

	return state;
}

async function handleGetZoomLevel(_, name) {
	const partition = getPartition(name) || {};
	return partition.zoomLevel ? partition.zoomLevel : 0;
}

async function handleSaveZoomLevel(_, args) {
	let partition = getPartition(args.partition) || {};
	partition.name = args.partition;
	partition.zoomLevel = args.zoomLevel;
	savePartition(partition);
}

async function handleGetCustomBGList() {
	const file = path.join(app.getPath('userData'), 'custom_bg_remote.json');
	if (!fs.existsSync(file)) {
		return [];
	} else {
		return JSON.parse(fs.readFileSync(file));
	}
}

function getPartitions() {
	return appConfig.settingsStore.get('app.partitions') || [];
}

function getPartition(name) {
	const partitions = getPartitions();
	return partitions.filter(p => {
		return p.name === name;
	})[0];
}

function savePartition(arg) {
	const partitions = getPartitions();
	const partitionIndex = partitions.findIndex(p => {
		return p.name === arg.name;
	});

	if (partitionIndex >= 0) {
		partitions[partitionIndex] = arg;
	} else {
		partitions.push(arg);
	}
	appConfig.settingsStore.set('app.partitions', partitions);
}

function handleCertificateError() {
	const arg = {
		event: arguments[0],
		webContents: arguments[1],
		url: arguments[2],
		error: arguments[3],
		certificate: arguments[4],
		callback: arguments[5],
		config: config
	};
	certificateModule.onAppCertificateError(arg);
}

async function requestMediaAccess() {
	['camera', 'microphone', 'screen'].map(async (permission) => {
		const status = await 
			systemPreferences.askForMediaAccess(permission)
				.catch(err => { 
					console.error(`Error while requesting access for "${permission}": ${err}`); });
		console.debug(`mac permission ${permission} asked current status ${status}`);
	});
}

async function userStatusChangedHandler(_event, options) {
	userStatus = options.data.status;
	console.debug(`User status changed to '${userStatus}'`);
}

async function setBadgeCountHandler(_event, count) {
	console.debug(`Badge count set to '${count}'`);
	app.setBadgeCount(count);
}

async function downloadCustomBGServiceRemoteConfig() {
	let customBGUrl;
	try {
		customBGUrl = new URL('', config.customBGServiceBaseUrl);
	}
	catch (err) {
		console.warning(`Failed to load custom background service configuration. ${err}. Setting Background service URL to http://localhost `);
		customBGUrl = new URL('', 'http://localhost');
	}

	const remotePath = httpHelper.joinURLs(customBGUrl.href, 'config.json');
	console.debug(`Fetching custom background configuration from '${remotePath}'`);
	httpHelper.getAsync(remotePath)
		.then(onCustomBGServiceConfigDownloadSuccess)
		.catch(onCustomBGServiceConfigDownloadFailure);
	if (config.customBGServiceConfigFetchInterval > 0) {
		setTimeout(downloadCustomBGServiceRemoteConfig, config.customBGServiceConfigFetchInterval * 1000);
	}
}

function onCustomBGServiceConfigDownloadSuccess(data) {
	const downloadPath = path.join(app.getPath('userData'), 'custom_bg_remote.json');
	try {
		const configJSON = JSON.parse(data);
		for (let i = 0; i < configJSON.length; i++) {
			setPath(configJSON[i]);
		}
		fs.writeFileSync(downloadPath, JSON.stringify(configJSON));
		console.debug(`Custom background service remote configuration stored at '${downloadPath}'`);
	}
	catch (err) {
		console.error(`Fetched custom background remote configuration but failed to save at '${downloadPath}'. ${err.message}`);
	}
}

function setPath(cfg) {
	if (!cfg.src.startsWith('/teams-for-linux/custom-bg/')) {
		cfg.src = httpHelper.joinURLs('/teams-for-linux/custom-bg/', cfg.src);
	}

	if (!cfg.thumb_src.startsWith('/teams-for-linux/custom-bg/')) {
		cfg.thumb_src = httpHelper.joinURLs('/teams-for-linux/custom-bg/', cfg.thumb_src);
	}
}

function onCustomBGServiceConfigDownloadFailure(err) {
	const dlpath = path.join(app.getPath('userData'), 'custom_bg_remote.json');
	console.error(`Failed to fetch custom background remote configuration. ${err.message}`);
	try {
		fs.writeFileSync(dlpath, JSON.stringify([]));
	}
	catch (err) {
		console.error(`Failed to save custom background default configuration at '${dlpath}'. ${err.message}`);
	}
}

function handleGlobalShortcutDisabled () {
	config.disableGlobalShortcuts.map((shortcut) => {
		if (shortcut) {
			globalShortcut.register(shortcut, () => {
				console.debug(`Global shortcut ${shortcut} disabled`);
			});
		}
	});
}

function handleGlobalShortcutDisabledRevert () {
	config.disableGlobalShortcuts.map((shortcut) => {
		if (shortcut) {
			globalShortcut.unregister(shortcut);
			console.debug(`Global shortcut ${shortcut} unregistered`);
		}
	});
}