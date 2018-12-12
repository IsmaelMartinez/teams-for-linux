const {app, ipcMain, BrowserWindow} = require('electron');
let isFirstLoginTry = true;

exports.handleLoginDialogTries = function handleLoginDialogTries(webContents) {
	webContents.on('login', (event, request, authInfo, callback) => {
		event.preventDefault();
		if (isFirstLoginTry) {
			isFirstLoginTry = false;
			this.loginService(window, callback);
		} else {
			// if fails to authenticate we need to relanch the app as we are closed 
			isFirstLoginTry = true;
			app.relaunch();
			app.exit(0);
		}
	});
};

exports.loginService = function loginService(parentWindow, callback) {
	let win = new BrowserWindow({
		width: 363,
		height: 124,
		modal: true,
		frame: false,
		parent: parentWindow,

		show: false,
		autoHideMenuBar: true,
	});

	win.once('ready-to-show', () => {
		win.show();
	});

	ipcMain.on('submitForm', (event, data) => {
		callback(data.username, data.password);
		win.close();
	});

	win.on('closed', () => {
		win = null;
	});

	win.loadURL(`file://${__dirname}/login.html`);
};