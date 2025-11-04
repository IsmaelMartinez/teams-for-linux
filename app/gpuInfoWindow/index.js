const { BrowserWindow } = require('electron');

/**
 * Generic window for displaying Chromium internal debug pages
 *
 * This class provides a reusable window wrapper for displaying various
 * chrome:// debug URLs in a separate window. It handles window lifecycle,
 * state management, and proper cleanup.
 *
 * @example
 * const debugWindow = new DebugWindow({
 *   url: 'chrome://gpu',
 *   title: 'GPU Information'
 * });
 * debugWindow.show();
 */
class DebugWindow {
  #window = null;
  #config = null;

  /**
   * Creates a new DebugWindow instance
   * @param {Object} config - Configuration options
   * @param {string} config.url - The URL to load (e.g., 'chrome://gpu')
   * @param {string} config.title - Window title
   * @param {number} [config.width=1000] - Window width in pixels
   * @param {number} [config.height=800] - Window height in pixels
   * @param {number} [config.minWidth=600] - Minimum window width
   * @param {number} [config.minHeight=400] - Minimum window height
   */
  constructor(config) {
    this.#config = {
      width: 1000,
      height: 800,
      minWidth: 600,
      minHeight: 400,
      ...config
    };

    if (!this.#config.url) {
      throw new Error('DebugWindow requires a url configuration');
    }
    if (!this.#config.title) {
      throw new Error('DebugWindow requires a title configuration');
    }
  }

  /**
   * Shows the debug window. If already exists, brings it to front.
   * Creates a new window on first call.
   */
  show() {
    // If window already exists, just show and focus it
    if (this.#window) {
      if (this.#window.isMinimized()) {
        this.#window.restore();
      }
      this.#window.show();
      this.#window.focus();
      return;
    }

    // Create new debug window
    this.#window = new BrowserWindow({
      title: this.#config.title,
      width: this.#config.width,
      height: this.#config.height,
      minWidth: this.#config.minWidth,
      minHeight: this.#config.minHeight,
      show: false,
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
      },
    });

    // Load the configured URL
    this.#window.loadURL(this.#config.url);

    // Show window when ready
    this.#window.once('ready-to-show', () => {
      this.#window.show();
      this.#window.focus();
    });

    // Clean up when window is closed
    this.#window.on('closed', () => {
      this.#window = null;
    });
  }

  /**
   * Closes the debug window if it exists
   */
  close() {
    if (this.#window) {
      this.#window.close();
    }
  }

  /**
   * Checks if the window is currently visible
   * @returns {boolean} True if window exists and is visible
   */
  isVisible() {
    return this.#window && this.#window.isVisible();
  }
}

/**
 * Convenience class for GPU information window
 * Displays chrome://gpu with GPU and graphics acceleration details
 */
class GpuInfoWindow extends DebugWindow {
  constructor() {
    super({
      url: 'chrome://gpu',
      title: 'GPU Information',
      width: 1000,
      height: 800,
    });
  }
}

module.exports = GpuInfoWindow;
