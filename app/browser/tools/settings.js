const ReactHandler = require('./reactHandler');

let _Settings_config = new WeakMap();
let _Settings_ipcRenderer = new WeakMap();
class Settings {
	init(config, ipcRenderer) {
		_Settings_config.set(this, config);
		_Settings_ipcRenderer.set(this, ipcRenderer);
		this.ipcRenderer.on('get-teams-settings', retrieve);
		this.ipcRenderer.on('set-teams-settings', restore);
	}

	get config() {
		return _Settings_config.get(this);
	}

	get ipcRenderer() {
		return _Settings_ipcRenderer.get(this);
	}
}

async function retrieve(event) {
	const clientPreferences = ReactHandler.getTeams2ClientPreferences();

	if (!clientPreferences) {
		console.error('Failed to retrieve Teams settings from react');
	} else {
		const settings = {
			theme: clientPreferences.theme.userTheme,
			chatDensity: clientPreferences.density.chatDensity,
		};
		event.sender.send('get-teams-settings', settings);
	}
}

async function restore(event, ...args) {
	const clientPreferences = ReactHandler.getTeams2ClientPreferences();

	if (!clientPreferences) {
		console.warn('Failed to retrieve Teams settings from react');
	} else {
		clientPreferences.theme.userTheme = args[0].theme;
		clientPreferences.density.chatDensity = args[0].chatDensity;
		event.sender.send('set-teams-settings', true);
	}
}

module.exports = new Settings();