import { BrowserWindow, app } from "electron";

/**
 * GpuInfoWindow displays GPU information for debugging purposes.
 */
class GpuInfoWindow {
	constructor() {
		this.window = null;
	}

	/**
	 * Show the GPU info window
	 */
	show() {
		if (this.window && !this.window.isDestroyed()) {
			this.window.show();
			this.window.focus();
			return;
		}

		this.window = new BrowserWindow({
			width: 800,
			height: 600,
			title: "GPU Information",
			autoHideMenuBar: true,
			webPreferences: {
				contextIsolation: true,
				nodeIntegration: false,
			},
		});

		// Load the Chrome GPU page
		this.window.loadURL("chrome://gpu");

		this.window.on("closed", () => {
			this.window = null;
		});
	}

	/**
	 * Close the GPU info window
	 */
	close() {
		if (this.window && !this.window.isDestroyed()) {
			this.window.close();
			this.window = null;
		}
	}
}

export default GpuInfoWindow;
