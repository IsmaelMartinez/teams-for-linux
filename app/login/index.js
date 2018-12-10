
const {app, ipcMain, BrowserWindow} = require('electron');

exports.loginService = function loginService(parentWindow, callback) {
	let isFirstLoginTry;
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
  
	parentWindow.webContents.on('login', (event, request, authInfo, callback) => {
		event.preventDefault();
		if (isFirstLoginTry) {
			isFirstLoginTry = false;
			this.loginService(window, callback);
		} else {
			isFirstLoginTry = true;
			app.relaunch();
			app.exit(0);
		}
	});
};