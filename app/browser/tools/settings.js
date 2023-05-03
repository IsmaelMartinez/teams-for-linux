let _Settings_config = new WeakMap();
let _Settings_ipcRenderer = new WeakMap();
class Settings {
	/**
	 * @param {object} config 
	 * @param {Electron.IpcRenderer} ipcRenderer 
	 */
	init(config, ipcRenderer) {
		_Settings_config.set(this, config);
		_Settings_ipcRenderer.set(this, ipcRenderer);
		this.ipcRenderer.on('get-teams-settings', retrieve);
		this.ipcRenderer.on('set-teams-settings', restore);
	}

	/**
	 * @type {object}
	 */
	get config() {
		return _Settings_config.get(this);
	}

	/**
	 * @type {Electron.IpcRenderer}
	 */
	get ipcRenderer() {
		return _Settings_ipcRenderer.get(this);
	}
}

/**
 * @param {Electron.IpcRendererEvent} event 
 * @param {...any} args 
 */
function retrieve(event, ...args) {
	console.log(event, args);

}

/**
 * @param {Electron.IpcRendererEvent} event 
 * @param {...any} args 
 */
function restore(event, ...args) {
	console.log(event, args);
}

module.exports = new Settings();