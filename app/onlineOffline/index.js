const {ipcMain} = require('electron');
let oldStatus = 'online';
let reloaded = false;

exports.reloadPageWhenOfflineToOnline = function reloadPageWhenOfflineToOnline(window, url) {
    
	ipcMain.on('online-status-changed', (event, status) => {
		if ((!reloaded) && (oldStatus === 'offline') && (oldStatus !== status)) {
			reloaded = true;
			setTimeout(() => window.loadURL(url), 10000);
		}
		oldStatus = status;
	});
};