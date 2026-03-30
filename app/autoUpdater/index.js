'use strict';

const { dialog, app } = require('electron');

// Lazy-load electron-updater to avoid "not a valid semver" crash in dev mode
// (electron-updater validates the app version at import time)
let _autoUpdater = null;
function getAutoUpdater() {
	if (!_autoUpdater) {
		_autoUpdater = require('electron-updater').autoUpdater;
	}
	return _autoUpdater;
}

let mainWindow = null;
let isManualCheck = false;
let isChecking = false;

function initialize(window) {
	if (!process.env.APPIMAGE) {
		console.info('[AutoUpdater] Not running as AppImage, auto-updater disabled');
		return;
	}

	mainWindow = window;

	const updater = getAutoUpdater();
	updater.autoDownload = false;
	updater.autoInstallOnAppQuit = false;

	updater.on('update-available', onUpdateAvailable);
	updater.on('update-not-available', onUpdateNotAvailable);
	updater.on('error', onError);

	console.info('[AutoUpdater] Checking for updates...');
	isChecking = true;
	updater.checkForUpdates().catch(err => {
		console.error('[AutoUpdater] Startup check failed:', err.message);
	});
}

function checkForUpdates() {
	if (!process.env.APPIMAGE) return;
	if (isChecking) return;

	isChecking = true;
	isManualCheck = true;
	getAutoUpdater().checkForUpdates().catch(err => {
		console.error('[AutoUpdater] Manual check failed:', err.message);
	});
}

async function onUpdateAvailable(info) {
	isChecking = false;
	isManualCheck = false;

	const currentVersion = app.getVersion();
	const response = await dialog.showMessageBox(mainWindow, {
		type: 'info',
		title: 'Update Available',
		message: `A new version (${info.version}) is available.\nYou are currently running version ${currentVersion}.`,
		buttons: ['Download & Restart', 'Later'],
		defaultId: 1,
		cancelId: 1,
	});

	if (response.response === 0) {
		try {
			await getAutoUpdater().downloadUpdate();
			getAutoUpdater().quitAndInstall();
		} catch (err) {
			console.error('[AutoUpdater] Download failed:', err.message);
			showErrorDialog();
		}
	}
}

function onUpdateNotAvailable() {
	isChecking = false;
	if (isManualCheck) {
		dialog.showMessageBox(mainWindow, {
			type: 'info',
			title: 'No Updates Available',
			message: `You're up to date! Current version: ${app.getVersion()}`,
		});
	}
	isManualCheck = false;
}

function onError(err) {
	isChecking = false;
	console.error('[AutoUpdater] Error:', err.message);
	if (isManualCheck) {
		showErrorDialog();
	}
	isManualCheck = false;
}

function showErrorDialog() {
	if (mainWindow && !mainWindow.isDestroyed()) {
		dialog.showMessageBox(mainWindow, {
			type: 'error',
			title: 'Update Error',
			message: 'Failed to check for updates. Please try again later.',
		});
	}
}

module.exports = { initialize, checkForUpdates };
