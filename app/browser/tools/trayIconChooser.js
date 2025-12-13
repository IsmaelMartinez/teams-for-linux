import path from "node:path";

/**
 * TrayIconChooser
 * 
 * Selects the appropriate tray icon based on configuration.
 */
class TrayIconChooser {
	constructor(config) {
		this.config = config;
		this.iconPath = this.determineIconPath();
	}

	/**
	 * Determine the icon path based on configuration
	 * @returns {string} The icon file path
	 */
	determineIconPath() {
		// If custom icon is specified, use it
		if (this.config.appIcon && this.config.appIcon.trim() !== "") {
			return this.config.appIcon;
		}

		// Otherwise, use default icon based on type
		const iconType = this.config.appIconType || "default";
		let iconName;

		switch (iconType) {
			case "light":
				iconName = "icon-monochrome-light-96x96.png";
				break;
			case "dark":
				iconName = "icon-monochrome-dark-96x96.png";
				break;
			default:
				iconName = "icon-96x96.png";
		}

		return path.join(this.config.appPath, "assets", "icons", iconName);
	}

	/**
	 * Get the icon file path
	 * @returns {string} The icon file path
	 */
	getFile() {
		return this.iconPath;
	}
}

export default TrayIconChooser;
