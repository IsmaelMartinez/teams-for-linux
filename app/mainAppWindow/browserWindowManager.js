import { BrowserWindow, screen, nativeImage } from "electron";
import windowStateKeeper from "electron-window-state";
import path from "node:path";
import { getDirname } from "../utils/esm-utils.js";

const __dirname = getDirname(import.meta.url);

/**
 * BrowserWindowManager handles the creation and configuration of the main browser window.
 */
class BrowserWindowManager {
	/**
	 * @param {Object} options - Configuration options
	 * @param {Object} options.config - Application configuration
	 * @param {TrayIconChooser} options.iconChooser - Icon chooser instance
	 */
	constructor(options) {
		this.config = options.config;
		this.iconChooser = options.iconChooser;
	}

	/**
	 * Create the main browser window
	 * @returns {Promise<BrowserWindow>} The created browser window
	 */
	async createWindow() {
		const primaryDisplay = screen.getPrimaryDisplay();
		const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

		// Load the previous window state with fallback to defaults
		const mainWindowState = windowStateKeeper({
			defaultWidth: Math.min(1280, screenWidth),
			defaultHeight: Math.min(800, screenHeight),
		});

		const windowOptions = {
			x: mainWindowState.x,
			y: mainWindowState.y,
			width: mainWindowState.width,
			height: mainWindowState.height,
			show: false,
			frame: this.config.frame,
			autoHideMenuBar: this.config.menubar === "auto",
			webPreferences: {
				preload: path.join(__dirname, "..", "browser", "preload.js"),
				partition: this.config.partition,
				contextIsolation: false,
				nodeIntegration: false,
				sandbox: false,
			},
		};

		// Set application icon
		if (this.iconChooser) {
			const iconPath = this.iconChooser.getFile();
			if (iconPath) {
				windowOptions.icon = nativeImage.createFromPath(iconPath);
			}
		}

		const window = new BrowserWindow(windowOptions);

		// Let us register listeners on the window, so we can update the state
		// automatically (the those events will fire, meaning the window state
		// will be saved to disk)
		mainWindowState.manage(window);

		return window;
	}
}

export default BrowserWindowManager;
