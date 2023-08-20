const { ipcMain, powerMonitor } = require('electron');
const { checkConnectivity } = require('../helpers');
const { LucidLog } = require('lucid-log');

let _ConnectionManager_window = new WeakMap();
let _ConnectionManager_config = new WeakMap();
let _ConnectionManager_logger = new WeakMap();
let _ConnectionManager_currentUrl = new WeakMap();
class ConnectionManager {
	/**
	 * @returns {Electron.BrowserWindow}
	 */
	get window() {
		return _ConnectionManager_window.get(this);
	}

	/**
	 * @returns {*}
	 */
	get config() {
		return _ConnectionManager_config.get(this);
	}

	/**
	 * @returns {LucidLog}
	 */
	get logger() {
		return _ConnectionManager_logger.get(this);
	}

	/**
	 * @returns {string}
	 */
	get currentUrl() {
		return _ConnectionManager_currentUrl.get(this);
	}

	/**
	 * @param {string} url
	 * @param {{window:Electron.BrowserWindow,config:object}} options
	 */
	start(url, options) {
		_ConnectionManager_window.set(this, options.window);
		_ConnectionManager_config.set(this, options.config);
		_ConnectionManager_logger.set(this, new LucidLog({
			levels: options.config.appLogLevels.split(',')
		}));
		_ConnectionManager_currentUrl.set(this, url ? url : this.config.url);
		ipcMain.on('offline-retry', assignOfflineRetryHandler(this));
		powerMonitor.on('resume', assignSystemResumeEventHandler(this));
		this.refresh();
	}

	async refresh() {
		const currentUrl = this.window.webContents.getURL();
		const hasUrl = currentUrl && currentUrl.startsWith('https://') ? true : false;
		const connected = await checkConnectivity(1000, 1);
		if (!connected) {
			this.window.setTitle('Waiting for network...');
			this.logger.debug('Waiting for network...');
		}
		const retryConnected = await checkConnectivity(1000, 30);
		if (retryConnected) {
			if (hasUrl) {
				this.window.reload();
			} else {
				this.window.loadURL(this.currentUrl, { userAgent: this.config.chromeUserAgent });
			}
		} else {
			this.window.setTitle('No internet connection');
			this.logger.error('No internet connection');
		}
	}
}

/**
 * 
 * @param {ConnectionManager} cm 
 */
function assignOfflineRetryHandler(cm) {
	return () => {
		cm.refresh();
	};
}

/**
 * @param {ConnectionManager} cm 
 */
function assignSystemResumeEventHandler(cm) {
	return () => {
		cm.refresh();
	};
}

module.exports = new ConnectionManager();