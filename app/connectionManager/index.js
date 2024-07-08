const { ipcMain, net, powerMonitor } = require('electron');
const { LucidLog } = require('lucid-log');

let _ConnectionManager_window = new WeakMap();
let _ConnectionManager_config = new WeakMap();
let _ConnectionManager_logger = new WeakMap();
let _ConnectionManager_currentUrl = new WeakMap();
class ConnectionManager {

	get window() {
		return _ConnectionManager_window.get(this);
	}

	get config() {
		return _ConnectionManager_config.get(this);
	}

	get logger() {
		return _ConnectionManager_logger.get(this);
	}

	get currentUrl() {
		return _ConnectionManager_currentUrl.get(this);
	}

	start(url, options) {
		_ConnectionManager_window.set(this, options.window);
		_ConnectionManager_config.set(this, options.config);
		_ConnectionManager_logger.set(this, new LucidLog({
			levels: options.config.appLogLevels.split(',')
		}));
		_ConnectionManager_currentUrl.set(this, url || this.config.url);
		ipcMain.on('offline-retry', assignOfflineRetryHandler(this));
		powerMonitor.on('resume', assignOfflineRetryHandler(this));
		this.window.webContents.on('did-fail-load', assignOnDidFailLoadEventHandler(this));
		this.refresh();
	}

	async refresh() {
		const currentUrl = this.window.webContents.getURL();
		const hasUrl = currentUrl?.startsWith('https://');
		const connected = await this.isOnline(1000, 1);
		if (!connected) {
			this.window.setTitle('Waiting for network...');
			this.logger.debug('Waiting for network...');
		}
		const retryConnected = connected || await this.isOnline(1000, 30);
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

	async isOnline(timeout, retries) {
		const onlineCheckMethod = this.config.onlineCheckMethod;
		let resolved = false;
		for (let i = 1; i <= retries && !resolved; i++) {
			resolved = await this.isOnlineTest(onlineCheckMethod, this.config.url);
			if (!resolved) await sleep(timeout);
		}
		if (resolved) {
			this.logger.debug('Network test successful with method ' + onlineCheckMethod);
		} else {
			this.logger.debug('Network test failed with method ' + onlineCheckMethod);
		}
		return resolved;
	}

	async isOnlineTest(onlineCheckMethod, testUrl) {
		switch (onlineCheckMethod) {
		case 'none':
			// That's more an escape gate in case all methods are broken, it disables
			// the network test (assumes we're online).
			this.logger.warn('Network test is disabled, assuming online status.');
			return true;
		case 'dns': {
			// Sometimes too optimistic, might be false-positive where an HTTP proxy is
			// mandatory but not reachable yet.
			const testDomain = (new URL(testUrl)).hostname;
			this.logger.debug('Testing network using net.resolveHost() for ' + testDomain);
			return await isOnlineDns(testDomain);
		}
		case 'native':
			// Sounds good but be careful, too optimistic in my experience; and at the contrary,
			// might also be false negative where no DNS is available for internet domains, but
			// an HTTP proxy is actually available and working.
			this.logger.debug('Testing network using net.isOnline()');
			return net.isOnline();
		case 'https':
		default:
			// Perform an actual HTTPS request, similar to loading the Teams app.
			this.logger.debug('Testing network using net.request() for ' + testUrl);
			return await isOnlineHttps(testUrl);
		}
	}
}

function assignOfflineRetryHandler(cm) {
	return () => {
		cm.refresh();
	};
}

function assignOnDidFailLoadEventHandler(cm) {
	return (_event, _code, description) => {
		cm.logger.error(description);
		if (description === 'ERR_INTERNET_DISCONNECTED' || description === 'ERR_NETWORK_CHANGED') {
			cm.refresh();
		}
	};
}

function sleep(timeout) {
	return new Promise(r => setTimeout(r, timeout));
}

function isOnlineHttps(testUrl) {
	return new Promise((resolve) => {
		const req = net.request({
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

function isOnlineDns(testDomain) {
	return new Promise((resolve) => {
		net.resolveHost(testDomain)
			.then(() => resolve(true))
			.catch(() => resolve(false));
	});
}

module.exports = new ConnectionManager();