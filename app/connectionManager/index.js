let _ConnectionManager_window = new WeakMap();
let _ConnectionManager_config = new WeakMap();
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
	 * @param {string} url
	 * @param {{window:Electron.BrowserWindow,config:object}} options
	 */
	start(url, options) {
		_ConnectionManager_window.set(this, options.window);
		_ConnectionManager_config.set(this, options.config);
		this.window.loadURL(url ? url : this.config.url, { userAgent: this.config.chromeUserAgent });
	}
}

module.exports = new ConnectionManager();