const { app, ipcMain } = require('electron');
const config = require('./config')(app.getPath('userData'));
const certificateModule = require('./certificate');
const gotTheLock = app.requestSingleInstanceLock();
const mainAppWindow = require('./mainAppWindow');
if (config.useElectronDl) require('electron-dl')();

if (config.proxyServer) app.commandLine.appendSwitch('proxy-server', config.proxyServer);
app.commandLine.appendSwitch('auth-server-whitelist', config.authServerWhitelist);
app.commandLine.appendSwitch('enable-ntlm-v2', config.ntlmV2enabled);
app.commandLine.appendSwitch('try-supported-channel-layouts');
if (process.env.XDG_SESSION_TYPE == 'wayland') {
	console.log('INFO: Running under Wayland, switching to PipeWire...');
	app.commandLine.appendSwitch('ozone-platform', 'wayland');
	app.commandLine.appendSwitch('enable-features', 'WebRTCPipeWireCapturer;UseOzonePlatform');
}

const protocolClient = 'msteams';
if (!app.isDefaultProtocolClient(protocolClient, process.execPath)) {
	app.setAsDefaultProtocolClient(protocolClient, process.execPath);
}

app.allowRendererProcessReuse = false;

if (!gotTheLock) {
	console.warn('App already running');
	app.quit();
} else {
	app.on('second-instance', mainAppWindow.onAppSecondInstance);
	app.on('ready', handleAppReady);
	app.on('before-quit', () => console.log('before-quit'));
	app.on('quit', () => console.log('quit'));
	app.on('renderer-process-crashed', () => console.log('renderer-process-crashed'));
	app.on('will-quit', () => console.log('will-quit'));
	app.on('certificate-error', handleCertificateError);
	ipcMain.handle('getConfig', handleGetConfig);
}

function handleAppReady() {
	mainAppWindow.onAppReady(config);
}

async function handleGetConfig() {
	return config;
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