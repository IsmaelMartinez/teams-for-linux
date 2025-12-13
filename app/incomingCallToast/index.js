import { BrowserWindow, screen, ipcMain } from "electron";
import path from "node:path";
import { getDirname } from "../utils/esm-utils.js";

const __dirname = getDirname(import.meta.url);

/**
 * IncomingCallToast manages the incoming call notification toast window.
 */
class IncomingCallToast {
	/**
	 * @param {Object} config - Application configuration
	 * @param {Object} mainAppWindow - Main application window module
	 */
	constructor(config, mainAppWindow) {
		this.config = config;
		this.mainAppWindow = mainAppWindow;
		this.window = null;
	}

	/**
	 * Initialize IPC handlers
	 */
	initialize() {
		// Handle incoming call toast click
		ipcMain.on("incoming-call-toast-clicked", this.handleToastClicked.bind(this));
	}

	/**
	 * Show the incoming call toast
	 * @param {Object} data - Call data (caller info, etc.)
	 */
	show(data) {
		if (!this.config.enableIncomingCallToast) {
			return;
		}

		if (this.window && !this.window.isDestroyed()) {
			this.window.close();
		}

		const display = screen.getPrimaryDisplay();
		const { width: screenWidth, height: screenHeight } = display.workAreaSize;
		const toastWidth = 400;
		const toastHeight = 120;
		const margin = 20;

		this.window = new BrowserWindow({
			width: toastWidth,
			height: toastHeight,
			x: screenWidth - toastWidth - margin,
			y: margin,
			frame: false,
			transparent: true,
			alwaysOnTop: true,
			skipTaskbar: true,
			resizable: false,
			show: false,
			focusable: true,
			webPreferences: {
				preload: path.join(__dirname, "incomingCallToastPreload.js"),
				contextIsolation: true,
				nodeIntegration: false,
			},
		});

		this.window.loadFile(path.join(__dirname, "incomingCallToast.html"));

		this.window.once("ready-to-show", () => {
			this.window.webContents.send("call-data", data);
			this.window.show();
		});

		this.window.on("closed", () => {
			this.window = null;
		});
	}

	/**
	 * Hide the incoming call toast
	 */
	hide() {
		if (this.window && !this.window.isDestroyed()) {
			this.window.close();
			this.window = null;
		}
	}

	/**
	 * Handle toast click - focus main window
	 */
	handleToastClicked() {
		const window = this.mainAppWindow.getWindow();
		if (window) {
			if (window.isMinimized()) {
				window.restore();
			}
			window.show();
			window.focus();
		}
		this.hide();
	}
}

export default IncomingCallToast;
