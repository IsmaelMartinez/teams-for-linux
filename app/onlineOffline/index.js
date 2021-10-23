const { ipcMain } = require('electron');
let oldStatus = 'online';
let reloaded = false;

exports.reloadPageWhenOfflineToOnline = function reloadPageWhenOfflineToOnline(window, config) {

	ipcMain.on('online-status-changed', (event, status) => {
		if ((!reloaded) && (oldStatus === 'offline') && (oldStatus !== status)) {
			reloaded = true;
			setTimeout(() => window.loadURL(config.url, { userAgent: config.chromeUserAgent }), 10000);
		}
		oldStatus = status;
	});
};