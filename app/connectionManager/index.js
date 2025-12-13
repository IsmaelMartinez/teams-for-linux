/**
 * ConnectionManager handles the initial connection to Microsoft Teams
 * and manages URL loading with retry logic.
 */
class ConnectionManager {
	constructor() {
		this.window = null;
		this.config = null;
		this.targetUrl = null;
	}

	/**
	 * Start the connection to Microsoft Teams
	 * @param {string|null} url - Optional URL to load (overrides config)
	 * @param {Object} options - Connection options
	 * @param {BrowserWindow} options.window - Target browser window
	 * @param {Object} options.config - Application configuration
	 */
	start(url, options) {
		this.window = options.window;
		this.config = options.config;
		this.targetUrl = url || this.config.url;

		console.debug(`[CONNECTION] Starting connection to: ${this.targetUrl}`);
		this.loadUrl();
	}

	/**
	 * Load the target URL in the window
	 */
	loadUrl() {
		if (!this.window || this.window.isDestroyed()) {
			console.error("[CONNECTION] Window not available");
			return;
		}

		this.window.loadURL(this.targetUrl, {
			userAgent: this.config.chromeUserAgent,
		});
	}

	/**
	 * Refresh the current page
	 */
	refresh() {
		if (this.window && !this.window.isDestroyed()) {
			console.debug("[CONNECTION] Refreshing page");
			this.window.webContents.reload();
		}
	}

	/**
	 * Navigate to a new URL
	 * @param {string} url - URL to navigate to
	 */
	navigateTo(url) {
		if (!this.window || this.window.isDestroyed()) {
			console.error("[CONNECTION] Window not available for navigation");
			return;
		}

		console.debug(`[CONNECTION] Navigating to: ${url}`);
		this.window.loadURL(url, {
			userAgent: this.config.chromeUserAgent,
		});
	}

	/**
	 * Get the current URL
	 * @returns {string|null} Current URL or null
	 */
	getCurrentUrl() {
		if (this.window && !this.window.isDestroyed()) {
			return this.window.webContents.getURL();
		}
		return null;
	}
}

export default ConnectionManager;
