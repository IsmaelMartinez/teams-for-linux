const {ipcMain, BrowserWindow} = require('electron');

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