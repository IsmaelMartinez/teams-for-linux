const { app, ipcMain } = require('electron');
const config = require('./config')(app.getPath('userData'));
const certificate = require('./certificate');
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
app.setAsDefaultProtocolClient('msteams');
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
	app.on('certificate-error', certificate.onAppCertificateError);
	ipcMain.handle('getConfig', handleGetConfig);
}

function handleAppReady() {
	mainAppWindow.onAppReady(config);
}

async function handleGetConfig() {
	return config;
}
