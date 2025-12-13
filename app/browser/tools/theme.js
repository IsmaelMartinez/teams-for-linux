import ReactHandler from "./reactHandler.js";

const _Theme_config = new WeakMap();
const _Theme_ipcRenderer = new WeakMap();

class Theme {
	init(config, ipcRenderer) {
		_Theme_config.set(this, config);
		_Theme_ipcRenderer.set(this, ipcRenderer);

		if (config.followSystemTheme) {
			this.ipcRenderer.on("system-theme-changed", (_event, isDark) => {
				this.setTheme(isDark ? "dark" : "default");
			});
		}
	}

	get config() {
		return _Theme_config.get(this);
	}

	get ipcRenderer() {
		return _Theme_ipcRenderer.get(this);
	}

	/**
	 * Set the Teams theme
	 * @param {string} theme - The theme to set ("dark" or "default")
	 */
	setTheme(theme) {
		try {
			const clientPreferences = ReactHandler.getTeams2ClientPreferences();
			if (clientPreferences?.theme) {
				clientPreferences.theme.userTheme = theme;
				console.debug(`[Theme] Set theme to: ${theme}`);
			}
		} catch (err) {
			console.error("[Theme] Error setting theme:", err.message);
		}
	}
}

export default new Theme();
