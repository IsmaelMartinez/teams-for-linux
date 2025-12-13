import { app, ipcMain, BrowserWindow } from "electron";
import { execSync } from "node:child_process";
import path from "node:path";
import { getDirname } from "../utils/esm-utils.js";

const __dirname = getDirname(import.meta.url);

let isFirstLoginTry = true;

export function loginService(parentWindow, callback) {
	let win = new BrowserWindow({
		width: 363,
		height: 124,
		modal: true,
		frame: false,
		parent: parentWindow,

		show: false,
		autoHideMenuBar: true,
		webPreferences: {
			preload: path.join(__dirname, "preload.js"),
		},
	});
	win.once("ready-to-show", () => {
		win.show();
	});

	// Handle form submission for SSO/authentication workflows
	ipcMain.on("submitForm", submitFormHandler(callback, win));

	win.on("closed", () => {
		win = null;
	});

	win.loadURL(`file://${__dirname}/login.html`);
}

export function handleLoginDialogTry(
	window,
	{ ssoBasicAuthUser, ssoBasicAuthPasswordCommand },
) {
	window.webContents.on("login", (event, _request, _authInfo, callback) => {
		event.preventDefault();
		if (isFirstLoginTry) {
			isFirstLoginTry = false;
			if (ssoBasicAuthUser && ssoBasicAuthPasswordCommand) {
				console.debug(
					`Retrieve password using command : ${ssoBasicAuthPasswordCommand}`,
				);
				try {
					const ssoPassword = execSync(ssoBasicAuthPasswordCommand).toString();
					callback(ssoBasicAuthUser, ssoPassword);
				} catch (error) {
					console.error(
						`Failed to execute ssoBasicAuthPasswordCommand. Status Code: ${error.status} with '${error.message}'`,
					);
				}
			} else {
				console.debug("Using dialogue window.");
				loginService(window, callback);
			}
		} else {
			// if fails to authenticate we need to relanch the app as we have close the login browser window.
			isFirstLoginTry = true;
			app.relaunch();
			app.exit(0);
		}
	});
}

function submitFormHandler(callback, win) {
	return (_event, data) => {
		callback(data.username, data.password);
		win.close();
	};
}
