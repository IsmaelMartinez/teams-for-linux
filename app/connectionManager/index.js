const { ipcMain, net, powerMonitor } = require('electron');
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
		this.window.webContents.on('did-fail-load', assignOnDidFailLoadEventHandler(this));
		this.refresh();
	}

	async refresh() {
		const currentUrl = this.window.webContents.getURL();
		const hasUrl = currentUrl && currentUrl.startsWith('https://') ? true : false;
		const connected = await this.isOnline(1000, 1, this.config.url);
		if (!connected) {
			this.window.setTitle('Waiting for network...');
			this.logger.debug('Waiting for network...');
		}
		const retryConnected = await this.isOnline(1000, 30, this.config.url);
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

	/**
	 * @param {number} timeout 
	 * @param {number} retries 
	 * @returns 
	 */
	async isOnline(timeout, retries, testUrl) {
		var resolved = false;
		for (var i = 1; i <= retries && !resolved; i++) {
			// Not using net.isOnline(), because it's too optimistic, it returns
			// true before we can actually issue successful https requests.
			this.logger.debug('checking for network, using net.request on ' + testUrl);
			resolved = await isOnlineInternal(testUrl);
			if (!resolved) await sleep(timeout);
		}
		return resolved;
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

/**
 * @param {ConnectionManager} cm 
 */
function assignOnDidFailLoadEventHandler(cm) {
	return (event, code, description) => {
		cm.logger.error(description);
		if (description === 'ERR_INTERNET_DISCONNECTED' || description === 'ERR_NETWORK_CHANGED') {
			cm.refresh();
		}
	};
}

function sleep(timeout) {
	return new Promise(r => setTimeout(r, timeout));
}

function isOnlineInternal(testUrl) {
	return new Promise((resolve) => {
		var req = net.request({
			url: testUrl,
			method: 'HEAD'
		});
		req.on('response', () => {
			resolve(true);
		});
		req.on('error', () => {
			resolve(false);
		});
		req.end();
	});
}

module.exports = new ConnectionManager();