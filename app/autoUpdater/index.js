'use strict';

const { dialog, app } = require('electron');
const { autoUpdater } = require('electron-updater');

let mainWindow = null;
let isManualCheck = false;

function initialize(window) {
	if (!process.env.APPIMAGE) {
		console.info('[AutoUpdater] Not running as AppImage, auto-updater disabled');
		return;
	}

	mainWindow = window;

	autoUpdater.autoDownload = false;
	autoUpdater.autoInstallOnAppQuit = false;

	autoUpdater.on('update-available', onUpdateAvailable);
	autoUpdater.on('update-not-available', onUpdateNotAvailable);
	autoUpdater.on('error', onError);

	console.info('[AutoUpdater] Checking for updates...');
	autoUpdater.checkForUpdates().catch(err => {
		console.error('[AutoUpdater] Startup check failed:', err.message);
	});
}

function checkForUpdates() {
	if (!process.env.APPIMAGE) return;

	isManualCheck = true;
	autoUpdater.checkForUpdates().catch(err => {
		console.error('[AutoUpdater] Manual check failed:', err.message);
		showErrorDialog();
		isManualCheck = false;
	});
}

async function onUpdateAvailable(info) {
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
			await autoUpdater.downloadUpdate();
			autoUpdater.quitAndInstall();
		} catch (err) {
			console.error('[AutoUpdater] Download failed:', err.message);
			showErrorDialog();
		}
	}
}

function onUpdateNotAvailable() {
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
