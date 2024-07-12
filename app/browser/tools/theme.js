const ReactHandler = require('./reactHandler');
const instance = require('./instance');

class ThemeManager {
	init(config, ipcRenderer) {
		this.ipcRenderer = ipcRenderer;
		this.config = config;

		const clientPreferences = ReactHandler.getTeams2ClientPreferences();
		if (clientPreferences) {
			console.debug('Using react to set the follow system theme');
			ReactHandler.getTeams2ClientPreferences().theme.followOsTheme = config.followSystemTheme;
		}

		if (config.followSystemTheme) {
			console.debug('followSystemTheme', config.followSystemTheme);
			this.ipcRenderer.on('system-theme-changed', this.applyTheme);   
		}
	}

	async applyTheme (_event, ...args) {
		const theme = args[0] ? 'dark' : 'default';
		const clientPreferences = ReactHandler.getTeams2ClientPreferences();
		if (clientPreferences) {
			console.debug('Using react to set the theme');
			clientPreferences.theme.userTheme = theme;
			console.debug('Theme changed to', theme);    
		} else {
			console.debug('Using angular to set the theme');
			const inst = await instance.whenReady().catch(() => {
				console.error('Failed to apply Theme');
			});
			inst.controller.layoutService.setTheme(theme);
		}
	}
}

module.exports = new ThemeManager();