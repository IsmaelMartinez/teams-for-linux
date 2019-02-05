const { shell, app, BrowserWindow } = require('electron');
const windowStateKeeper = require('electron-window-state');
const path = require('path');
const iconPath = path.join(__dirname, 'assets', 'icons', 'icon-96x96.png');
const config = require('./config')(app.getPath('userData'));
const login = require('./login');
const Menus = require('./menus');
const notifications = require('./notifications');
const onlineOffline = require('./onlineOffline');
	
global.edgeUserAgent = config.edgeUserAgent;

app.commandLine.appendSwitch('auth-server-whitelist', config.authServerWhitelist);
app.commandLine.appendSwitch('enable-ntlm-v2', config.ntlmV2enabled);

app.on('ready', () => {
	let window = createWindow();
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
		} else if (disposition !== 'background-tab') {      
			event.preventDefault();
			shell.openExternal(url);
		}
	});

	login.handleLoginDialogTry(window);
	onlineOffline.reloadPageWhenOfflineToOnline(window, config.url);

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