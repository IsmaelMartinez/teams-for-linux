/**
 * WindowManager - BrowserWindow lifecycle management
 * Manages window creation, tracking, and operations with state persistence
 */
const { BrowserWindow } = require('electron');
const windowStateKeeper = require('electron-window-state');

class WindowManager {
  constructor(config, eventBus) {
    this._config = config;
    this._eventBus = eventBus;
    this._windows = new Map();
    this._windowStates = new Map();
    this._mainWindow = null;
    this._windowCounter = 0;
  }

  createWindow(options = {}) {
    const { isMain = false, browserWindowOptions = {}, stateOptions = {} } = options;
    const windowId = `window-${++this._windowCounter}`;

    const windowState = windowStateKeeper({
      defaultWidth: browserWindowOptions.width || 1024,
      defaultHeight: browserWindowOptions.height || 768,
      file: `${windowId}.json`,
      ...stateOptions
    });

    const window = new BrowserWindow({
      x: windowState.x,
      y: windowState.y,
      width: windowState.width,
      height: windowState.height,
      show: false,
      ...browserWindowOptions
    });

    window.windowId = windowId;
    windowState.manage(window);

    this._windows.set(windowId, window);
    this._windowStates.set(windowId, windowState);

    if (isMain || !this._mainWindow) {
      this._mainWindow = window;
    }

    this._attachWindowHandlers(window, windowId);

    this._eventBus.emit('shell.window.created', {
      windowId,
      isMain: window === this._mainWindow,
      bounds: window.getBounds()
    });

    return window;
  }

  getMainWindow() {
    return this._mainWindow;
  }

  getWindow(windowId) {
    return this._windows.get(windowId) || null;
  }

  getAllWindows() {
    return Array.from(this._windows.values());
  }

  getWindowId(window) {
    return window?.windowId || null;
  }

  closeWindow(windowId) {
    return this._executeWindowOperation(windowId, (window) => {
      window.close();
      return true;
    });
  }

  focusWindow(windowId) {
    return this._executeWindowOperation(windowId, (window) => {
      if (window.isMinimized()) window.restore();
      window.focus();
      this._eventBus.emit('shell.window.focused', { windowId });
      return true;
    });
  }

  minimizeWindow(windowId) {
    return this._executeWindowOperation(windowId, (window) => {
      window.minimize();
      this._eventBus.emit('shell.window.minimized', { windowId });
      return true;
    });
  }

  maximizeWindow(windowId) {
    return this._executeWindowOperation(windowId, (window) => {
      if (window.isMaximized()) {
        window.unmaximize();
        this._eventBus.emit('shell.window.unmaximized', { windowId });
      } else {
        window.maximize();
        this._eventBus.emit('shell.window.maximized', { windowId });
      }
      return true;
    });
  }

  showWindow(windowId) {
    return this._executeWindowOperation(windowId, (window) => {
      window.show();
      this._eventBus.emit('shell.window.shown', { windowId });
      return true;
    });
  }

  hideWindow(windowId) {
    return this._executeWindowOperation(windowId, (window) => {
      window.hide();
      this._eventBus.emit('shell.window.hidden', { windowId });
      return true;
    });
  }

  cleanup() {
    const windowIds = Array.from(this._windows.keys());

    for (const windowId of windowIds) {
      const window = this._windows.get(windowId);
      if (window && !window.isDestroyed()) {
        window.close();
      }
    }

    this._windows.clear();
    this._windowStates.clear();
    this._mainWindow = null;
    this._windowCounter = 0;

    this._eventBus.emit('shell.windows.cleanup', { closedCount: windowIds.length });
  }

  _executeWindowOperation(windowId, operation) {
    const window = this._windows.get(windowId);
    if (!window || window.isDestroyed()) return false;
    return operation(window);
  }

  _attachWindowHandlers(window, windowId) {
    window.once('ready-to-show', () => {
      this._eventBus.emit('shell.window.ready', { windowId });
    });

    window.on('closed', () => this._handleWindowClosed(windowId));

    window.on('focus', () => {
      this._eventBus.emit('shell.window.focused', { windowId });
    });

    window.on('blur', () => {
      this._eventBus.emit('shell.window.blurred', { windowId });
    });

    window.on('resize', () => {
      this._eventBus.emit('shell.window.resized', {
        windowId,
        bounds: window.getBounds()
      });
    });

    window.on('move', () => {
      this._eventBus.emit('shell.window.moved', {
        windowId,
        bounds: window.getBounds()
      });
    });
  }

  _handleWindowClosed(windowId) {
    const wasMainWindow = this._mainWindow?.windowId === windowId;

    this._windows.delete(windowId);
    this._windowStates.delete(windowId);

    if (wasMainWindow) {
      this._mainWindow = null;
    }

    this._eventBus.emit('shell.window.closed', { windowId, wasMainWindow });
  }
}

module.exports = WindowManager;
