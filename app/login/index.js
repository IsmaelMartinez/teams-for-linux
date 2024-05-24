const { app, ipcMain, BrowserWindow } = require('electron');
const { execSync } = require('child_process');

let isFirstLoginTry = true;

exports.loginService = function loginService(parentWindow, callback) {
	let win = new BrowserWindow({
		width: 363,
		height: 124,
		modal: true,
		frame: false,
		parent: parentWindow,

		show: false,
		autoHideMenuBar: true,
		webPreferences: {
			contextIsolation: false,
			nodeIntegration: true
		}
	});
	require('@electron/remote/main').enable(win.webContents);

	win.once('ready-to-show', () => {
		win.show();
	});

	ipcMain.on('submitForm', submitFormHandler(callback, win));

	win.on('closed', () => {
		win = null;
	});

	win.loadURL(`file://${__dirname}/login.html`);
};

exports.handleLoginDialogTry = function handleLoginDialogTry(window, {ssoUser, ssoPasswordCommand}) {
	window.webContents.on('login', (event, request, authInfo, callback) => {
		event.preventDefault();
		if (isFirstLoginTry) {
			isFirstLoginTry = false;
			if (ssoUser && ssoPasswordCommand) {

				console.log(`Retrieve password using command : ${ssoPasswordCommand}`);

				try {
					const ssoPassword = execSync(ssoPasswordCommand).toString();
					callback(ssoUser, ssoPassword);
				} catch (error) {
					console.error(`Failed to execute ssoPasswordCommand. Status Code: ${error.status} with '${error.message}'`);
				}
			} else {
				console.debug("Using dialogue window.");
				this.loginService(window, callback);
			}
		} else {
			// if fails to authenticate we need to relanch the app as we have close the login browser window.
			isFirstLoginTry = true;
			app.relaunch();
			app.exit(0);
		}
	});
};

function submitFormHandler(callback, win) {
	return (event, data) => {
		callback(data.username, data.password);
		win.close();
	};
}
