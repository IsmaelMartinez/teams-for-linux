const Store = require('electron-store');

let _AppConfiguration_configPath = new WeakMap();
let _AppConfiguration_startupConfig = new WeakMap();
let _AppConfiguration_legacyConfigStore = new WeakMap();
let _AppConfiguration_settingsStore = new WeakMap();

class AppConfiguration {
	/**
	 * @param {string} configPath
	 * @param appVersion
	 */
	constructor(configPath, appVersion) {
		_AppConfiguration_configPath.set(this, configPath);
		_AppConfiguration_startupConfig.set(this, require('../config')(configPath, appVersion));
		_AppConfiguration_legacyConfigStore.set(this, new Store({
			name: 'config'
		}));
		_AppConfiguration_settingsStore.set(this, new Store({
			name: 'settings'
		}));
	}

	/**
	 * @returns {string}
	 */
	get configPath() {
		return _AppConfiguration_configPath.get(this);
	}

	get startupConfig() {
		return _AppConfiguration_startupConfig.get(this);
	}

	/**
	 * @returns {Store}
	 */
	get legacyConfigStore() {
		return _AppConfiguration_legacyConfigStore.get(this);
	}

	/**
	 * @returns {Store}
	 */
	get settingsStore() {
		return _AppConfiguration_settingsStore.get(this);
	}
}

module.exports = { AppConfiguration };