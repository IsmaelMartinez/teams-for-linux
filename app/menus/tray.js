import { Tray as ElectronTray, Menu, nativeImage, ipcMain } from "electron";

/**
 * Tray icon manager
 */
class Tray {
	constructor(window, menuTemplate, iconPath, config) {
		this.window = window;
		this.menuTemplate = menuTemplate;
		this.iconPath = iconPath;
		this.config = config;
		this.tray = null;
	}

	/**
	 * Initialize the tray icon
	 */
	initialize() {
		if (!this.config.trayIconEnabled) {
			console.debug("[Tray] Tray icon is disabled");
			return;
		}

		try {
			const icon = nativeImage.createFromPath(this.iconPath);
			this.tray = new ElectronTray(icon);
			this.tray.setToolTip("Teams for Linux");
			this.tray.setContextMenu(Menu.buildFromTemplate(this.menuTemplate));

			// Handle click on tray icon
			this.tray.on("click", () => {
				if (this.window.isVisible()) {
					this.window.hide();
				} else {
					this.window.show();
					this.window.focus();
				}
			});

			// Handle double-click on tray icon
			this.tray.on("double-click", () => {
				this.window.show();
				this.window.focus();
			});

			// Handle tray update events from renderer
			ipcMain.on("tray-update", (_event, data) => {
				this.updateTray(data);
			});

			console.debug("[Tray] Tray icon initialized");
		} catch (err) {
			console.error("[Tray] Error initializing tray:", err.message);
		}
	}

	/**
	 * Update tray icon and flash state
	 * @param {Object} data - Update data
	 * @param {string} data.icon - Icon path or null
	 * @param {boolean} data.flash - Whether to flash the window
	 * @param {number} data.count - Unread count
	 */
	updateTray(data) {
		if (!this.tray) return;

		try {
			// Flash window if requested and not already focused
			if (data.flash && !this.window.isFocused()) {
				this.window.flashFrame(true);
			}

			// Update tooltip with count
			if (typeof data.count === "number") {
				const tooltip = data.count > 0
					? `Teams for Linux (${data.count} unread)`
					: "Teams for Linux";
				this.tray.setToolTip(tooltip);
			}
		} catch (err) {
			console.error("[Tray] Error updating tray:", err.message);
		}
	}

	/**
	 * Set the context menu
	 * @param {Array} menuTemplate - Menu template
	 */
	setContextMenu(menuTemplate) {
		if (this.tray) {
			this.tray.setContextMenu(Menu.buildFromTemplate(menuTemplate));
		}
	}

	/**
	 * Close and destroy the tray icon
	 */
	close() {
		if (this.tray) {
			this.tray.destroy();
			this.tray = null;
			console.debug("[Tray] Tray icon destroyed");
		}
	}
}

export default Tray;
