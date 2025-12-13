import { BrowserWindow } from "electron";
import path from "node:path";
import { getDirname } from "../utils/esm-utils.js";

const __dirname = getDirname(import.meta.url);

/**
 * DocumentationWindow manages the documentation viewer window.
 */
class DocumentationWindow {
	constructor() {
		this.window = null;
	}

	/**
	 * Show the documentation window
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
			title: "Teams for Linux Documentation",
			autoHideMenuBar: true,
			webPreferences: {
				preload: path.join(__dirname, "documentation.js"),
				contextIsolation: true,
				nodeIntegration: false,
			},
		});

		this.window.loadFile(path.join(__dirname, "documentation.html"));

		this.window.on("closed", () => {
			this.window = null;
		});
	}

	/**
	 * Close the documentation window
	 */
	close() {
		if (this.window && !this.window.isDestroyed()) {
			this.window.close();
			this.window = null;
		}
	}
}

export default DocumentationWindow;
