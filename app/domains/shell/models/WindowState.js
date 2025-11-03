const { screen } = require('electron');

/**
 * WindowState - Manages window position, size, and maximized state persistence
 *
 * Wraps electron-window-state functionality with electron-store integration
 * for persisting window bounds across application sessions.
 */
class WindowState {
  constructor(options = {}) {
    this._name = options.name || 'main-window';
    this._defaultWidth = options.defaultWidth || 1024;
    this._defaultHeight = options.defaultHeight || 768;
    this._store = options.store;

    if (!this._store) {
      throw new Error('WindowState requires an electron-store instance');
    }

    this._storeKey = `windowState.${this._name}`;
    this._bounds = this._loadBounds();
    this._isMaximized = this._loadMaximizedState();
    this._window = null;
  }

  /**
   * Load saved bounds from store or return defaults
   * @private
   */
  _loadBounds() {
    const saved = this._store.get(this._storeKey);

    if (saved && this._isValidBounds(saved)) {
      return {
        x: saved.x,
        y: saved.y,
        width: saved.width,
        height: saved.height
      };
    }

    return this._getDefaultBounds();
  }

  /**
   * Get default bounds centered on primary display
   * @private
   */
  _getDefaultBounds() {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;

    return {
      x: Math.round((screenWidth - this._defaultWidth) / 2),
      y: Math.round((screenHeight - this._defaultHeight) / 2),
      width: this._defaultWidth,
      height: this._defaultHeight
    };
  }

  /**
   * Load maximized state from store
   * @private
   */
  _loadMaximizedState() {
    const saved = this._store.get(this._storeKey);
    return saved?.isMaximized || false;
  }

  /**
   * Validate bounds to ensure window is visible on screen
   * @private
   */
  _isValidBounds(bounds) {
    if (!bounds || typeof bounds !== 'object') {
      return false;
    }

    const { x, y, width, height } = bounds;

    // Check all required properties exist and are numbers
    if (typeof x !== 'number' || typeof y !== 'number' ||
        typeof width !== 'number' || typeof height !== 'number') {
      return false;
    }

    // Check minimum dimensions
    if (width < 200 || height < 200) {
      return false;
    }

    // Check if window is visible on any display
    const displays = screen.getAllDisplays();
    return displays.some(display => {
      const area = display.workArea;
      return x >= area.x - width + 100 &&
             x <= area.x + area.width - 100 &&
             y >= area.y &&
             y <= area.y + area.height - 100;
    });
  }

  /**
   * Get current window bounds
   * @returns {Object} Window bounds {x, y, width, height}
   */
  getBounds() {
    return { ...this._bounds };
  }

  /**
   * Check if window is maximized
   * @returns {boolean}
   */
  isMaximized() {
    return this._isMaximized;
  }

  /**
   * Save current window state to store
   * @param {BrowserWindow} browserWindow - Electron BrowserWindow instance
   */
  saveState(browserWindow) {
    if (!browserWindow || browserWindow.isDestroyed()) {
      return;
    }

    const isMaximized = browserWindow.isMaximized();

    // Only save bounds when not maximized
    if (!isMaximized) {
      const bounds = browserWindow.getBounds();
      if (this._isValidBounds(bounds)) {
        this._bounds = bounds;
      }
    }

    this._isMaximized = isMaximized;

    this._store.set(this._storeKey, {
      ...this._bounds,
      isMaximized: this._isMaximized
    });
  }

  /**
   * Manage window state - attach event handlers for automatic state saving
   * @param {BrowserWindow} browserWindow - Electron BrowserWindow instance
   */
  manage(browserWindow) {
    if (!browserWindow) {
      throw new Error('browserWindow is required');
    }

    this._window = browserWindow;

    // Restore maximized state
    if (this._isMaximized) {
      browserWindow.maximize();
    }

    // Debounced save to avoid excessive writes
    let saveTimeout = null;
    const debouncedSave = () => {
      if (saveTimeout) {
        clearTimeout(saveTimeout);
      }
      saveTimeout = setTimeout(() => {
        this.saveState(browserWindow);
      }, 500);
    };

    // Save state on window changes
    browserWindow.on('resize', debouncedSave);
    browserWindow.on('move', debouncedSave);
    browserWindow.on('maximize', () => this.saveState(browserWindow));
    browserWindow.on('unmaximize', () => this.saveState(browserWindow));

    // Save state before window closes
    browserWindow.on('close', () => {
      if (saveTimeout) {
        clearTimeout(saveTimeout);
      }
      this.saveState(browserWindow);
    });
  }
}

module.exports = WindowState;
