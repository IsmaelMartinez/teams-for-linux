const { shell, app, ipcMain, BrowserWindow } = require('electron');
const windowStateKeeper = require('electron-window-state');
const NativeNotification = require('electron-native-notification');
const path = require('path');
const iconPath = path.join(__dirname, 'assets', 'icons', 'icon-96x96.png');
const config = require('./config')(app.getPath('userData'));
const login = require('./login');
const Menus = require('./menus');

global.edgeUserAgent = config.edgeUserAgent;

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

app.commandLine.appendSwitch('auth-server-whitelist', config.authServerWhitelist);
app.commandLine.appendSwitch('enable-ntlm-v2', config.ntlmV2enabled);

app.on('ready', () => {
	let isFirstLoginTry = true;
	let window = createWindow();
	new Menus(window, config, iconPath);

	window.on('page-title-updated', (event, title) => {
		window.webContents.send('page-title', title);
	});

	if (!config.disableDesktopNotificationsHack) {
		ipcMain.on('notifications', async (e, msg) => {
			if (msg.count > 0) {
				const body = ((msg.text) ? `(${msg.count}): ${msg.text}` : `You got ${msg.count} notification(s)`);
				const notification = new NativeNotification(
					'Microsoft Teams',
					{
						body,
						icon: iconPath,
					},
				);
				notification.onclick = () => {
					window.show();
					window.focus();
				};
				if (notification.show !== undefined) {
					notification.show();
				}
			}
		});
	}

	window.webContents.on('new-window', (event, url, frame, disposition) => {
		if (disposition !== 'background-tab') {      
			event.preventDefault();
			shell.openExternal(url);
		}
	});

	window.webContents.on('login', (event, request, authInfo, callback) => {
		event.preventDefault();
		if (isFirstLoginTry) {
			isFirstLoginTry = false;
			login.loginService(window, callback);
		} else {
			isFirstLoginTry = true;
			app.relaunch();
			app.exit(0);
		}
	});

	window.webContents.setUserAgent(config.chromeUserAgent);

	window.once('ready-to-show', () => window.show());

	window.webContents.on('did-finish-load', () => {
		window.webContents.insertCSS('#download-mobile-app-button, #download-app-button, #get-app-button { display:none; }');
		window.webContents.insertCSS('.zoetrope { animation-iteration-count: 1 !important; }');
	});

	window.on('closed', () => { window = null; });

	window.loadURL(config.url);

	if (config.webDebug) {
		window.openDevTools();
	}
});