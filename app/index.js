const { app, ipcMain, desktopCapturer, systemPreferences, powerMonitor } = require('electron');
const path = require('path');
const fs = require('fs');
const { LucidLog } = require('lucid-log');
const helpers = require('./helpers');

const isDev = require('electron-is-dev');
const os = require('os');
const isMac = os.platform() === 'darwin';
if (app.commandLine.hasSwitch('customUserDir')) {
	app.setPath('userData', app.commandLine.getSwitchValue('customUserDir'));
}
const config = require('./config')(app.getPath('userData'));
config.appPath = path.join(__dirname, isDev ? '' : '../../');

const logger = new LucidLog({
	levels: config.appLogLevels.split(',')
});

const notificationSounds = [{
	type: 'new-message',
	file: path.join(config.appPath, 'assets/sounds/new_message.wav')
},
{
	type: 'meeting-started',
	file: path.join(config.appPath, 'assets/sounds/meeting_started.wav')
}];

let userStatus = -1;

// Notification sound player
/**
 * @type {NodeSoundPlayer}
 */
let player;
try {
	// eslint-disable-next-line no-unused-vars
	const { NodeSound } = require('node-sound');
	player = NodeSound.getDefaultPlayer();
} catch (e) {
	logger.info('No audio players found. Audio notifications might not work.');
}

const Store = require('electron-store');
const store = new Store({
	name: 'settings'
});
const certificateModule = require('./certificate');
const gotTheLock = app.requestSingleInstanceLock();
const mainAppWindow = require('./mainAppWindow');

if (config.proxyServer) app.commandLine.appendSwitch('proxy-server', config.proxyServer);
app.commandLine.appendSwitch('auth-server-whitelist', config.authServerWhitelist);
app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling');
app.commandLine.appendSwitch('enable-ntlm-v2', config.ntlmV2enabled);
app.commandLine.appendSwitch('try-supported-channel-layouts');

if (isMac) {
	requestMediaAccess();

} else if (process.env.XDG_SESSION_TYPE === 'wayland') {
	logger.info('Running under Wayland, switching to PipeWire...');

	const features = app.commandLine.hasSwitch('enable-features') ? app.commandLine.getSwitchValue('enable-features').split(',') : [];
	if (!features.includes('WebRTCPipeWireCapturer'))
		features.push('WebRTCPipeWireCapturer');

	app.commandLine.appendSwitch('enable-features', features.join(','));
	app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
}

const protocolClient = 'msteams';
if (!app.isDefaultProtocolClient(protocolClient, process.execPath)) {
	app.setAsDefaultProtocolClient(protocolClient, process.execPath);
}

app.allowRendererProcessReuse = false;

if (!gotTheLock) {
	logger.info('App already running');
	app.quit();
} else {
	app.on('second-instance', mainAppWindow.onAppSecondInstance);
	app.on('ready', handleAppReady);
	app.on('quit', () => logger.debug('quit'));
	app.on('render-process-gone', onRenderProcessGone);
	app.on('will-quit', () => logger.debug('will-quit'));
	app.on('certificate-error', handleCertificateError);
	ipcMain.handle('getConfig', handleGetConfig);
	ipcMain.handle('getSystemIdleTime', handleGetSystemIdleTime);
	ipcMain.handle('getSystemIdleState', handleGetSystemIdleState);
	ipcMain.handle('getZoomLevel', handleGetZoomLevel);
	ipcMain.handle('saveZoomLevel', handleSaveZoomLevel);
	ipcMain.handle('desktopCapturerGetSources', (event, opts) => desktopCapturer.getSources(opts));
	ipcMain.handle('getCustomBGList', handleGetCustomBGList);
	ipcMain.handle('play-notification-sound', playNotificationSound);
	ipcMain.handle('user-status-changed', userStatusChangedHandler);
	ipcMain.handle('set-badge-count', setBadgeCountHandler);
	downloadCustomBGServiceRemoteConfig();
}

// eslint-disable-next-line no-unused-vars
async function playNotificationSound(event, options) {
	logger.debug(`Notificaion => Type: ${options.type}, Audio: ${options.audio}, Title: ${options.title}, Body: ${options.body}`);
	// Player failed to load or notification sound disabled in config
	if (!player || config.disableNotificationSound) {
		logger.debug('Notification sounds are disabled');
		return;
	}
	// Notification sound disabled if not available set in config and user status is not "Available" (or is unknown)
	if (config.disableNotificationSoundIfNotAvailable && userStatus !== 1 && userStatus !== -1) {
		logger.debug('Notification sounds are disabled when user is not active');
		return;
	}
	const sound = notificationSounds.filter(ns => {
		return ns.type === options.type;
	})[0];

	if (sound) {
		logger.debug(`Playing file: ${sound.file}`);
		await player.play(sound.file);
		return;
	}

	logger.debug('No notification sound played', player, options);
}

function onRenderProcessGone() {
	logger.debug('render-process-gone');
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
	process.on('SIGTRAP', onAppTerminated);
	process.on('SIGINT', onAppTerminated);
	process.on('SIGTERM', onAppTerminated);
	//Just catch the error
	process.stdout.on('error', () => { });
	mainAppWindow.onAppReady(config);
}

async function handleGetConfig() {
	return config;
}

async function handleGetSystemIdleTime() {
	return powerMonitor.getSystemIdleTime();
}

async function handleGetSystemIdleState() {
	const idleState = powerMonitor.getSystemIdleState(config.appIdleTimeout);
	logger.debug(`GetSystemIdleState => IdleTimeout: ${config.appIdleTimeout}s, IdleTimeoutPollInterval: ${config.appIdleTimeoutCheckInterval}s, ActiveCheckPollInterval: ${config.appActiveCheckInterval}s, IdleTime: ${powerMonitor.getSystemIdleTime()}s, IdleState: '${idleState}'`);
	return idleState;
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
	return store.get('app.partitions') || [];
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
	store.set('app.partitions', partitions);
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
	certificateModule.onAppCertificateError(arg, logger);
}

async function requestMediaAccess() {
	['camera', 'microphone', 'screen'].map(async (permission) => {
		const status = await systemPreferences.askForMediaAccess(permission);
		logger.debug(`mac permission ${permission} asked current status ${status}`);
	});
}

/**
 * Handle user-status-changed message
 * 
 * @param {*} event 
 * @param {*} options 
 */
async function userStatusChangedHandler(event, options) {
	userStatus = options.data.status;
	logger.debug(`User status changed to '${userStatus}'`);
}

/**
 * Handle user-status-changed message
 * 
 * @param {*} event 
 * @param {*} count 
 */
async function setBadgeCountHandler(event, count) {
	logger.debug(`Badge count set to '${count}'`);
	app.setBadgeCount(count);
}

async function downloadCustomBGServiceRemoteConfig() {
	let customBGUrl;
	try {
		customBGUrl = new URL('', config.customBGServiceBaseUrl);
	}
	catch (err) {
		customBGUrl = new URL('', 'http://localhost');
	}

	const remotePath = helpers.joinURLs(customBGUrl.href, 'config.json');
	logger.debug(`Fetching custom background configuration from '${remotePath}'`);
	helpers.getAsync(remotePath)
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
		logger.debug(`Custom background service remote configuration stored at '${downloadPath}'`);
	}
	catch (err) {
		logger.error(`Failed to save remote configuration at '${downloadPath}'`);
	}
}

/**
 * @param {{filetype: string,id: string, name: string, src: string, thumb_src: string }} cfg 
 */
function setPath(cfg) {
	if (!cfg.src.startsWith('/teams-for-linux/custom-bg/')) {
		cfg.src = helpers.joinURLs('/teams-for-linux/custom-bg/', cfg.src);
	}

	if (!cfg.thumb_src.startsWith('/teams-for-linux/custom-bg/')) {
		cfg.thumb_src = helpers.joinURLs('/teams-for-linux/custom-bg/', cfg.thumb_src);
	}
}

function onCustomBGServiceConfigDownloadFailure(err) {
	const dlpath = path.join(app.getPath('userData'), 'custom_bg_remote.json');
	logger.error(err.message);
	try {
		fs.writeFileSync(dlpath, JSON.stringify([]));
	}
	catch (err) {
		logger.error(`Failed to save remote configuration at '${dlpath}'`);
	}
}