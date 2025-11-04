/**
 * WindowManager Service Tests
 * Comprehensive test suite for BrowserWindow lifecycle management
 */
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const Module = require('node:module');

// Mock Electron BrowserWindow
class MockBrowserWindow {
  constructor(options = {}) {
    this._options = options;
    this._destroyed = false;
    this._minimized = false;
    this._maximized = false;
    this._visible = !options.show;
    this._handlers = new Map();
    this._bounds = {
      x: options.x || 0,
      y: options.y || 0,
      width: options.width || 1024,
      height: options.height || 768
    };
  }

  close() {
    if (!this._destroyed) {
      this._destroyed = true;
      this._emitOnce('closed');
    }
  }

  focus() {
    if (!this._destroyed) {
      this._emit('focus');
    }
  }

  minimize() {
    if (!this._destroyed) {
      this._minimized = true;
    }
  }

  maximize() {
    if (!this._destroyed) {
      this._maximized = true;
    }
  }

  unmaximize() {
    if (!this._destroyed) {
      this._maximized = false;
    }
  }

  restore() {
    if (!this._destroyed) {
      this._minimized = false;
    }
  }

  show() {
    if (!this._destroyed) {
      this._visible = true;
    }
  }

  hide() {
    if (!this._destroyed) {
      this._visible = false;
    }
  }

  isMinimized() {
    return this._minimized;
  }

  isMaximized() {
    return this._maximized;
  }

  isDestroyed() {
    return this._destroyed;
  }

  getBounds() {
    return { ...this._bounds };
  }

  on(event, handler) {
    if (!this._handlers.has(event)) {
      this._handlers.set(event, []);
    }
    this._handlers.get(event).push({ handler, once: false });
  }

  once(event, handler) {
    if (!this._handlers.has(event)) {
      this._handlers.set(event, []);
    }
    this._handlers.get(event).push({ handler, once: true });
  }

  _emit(event, ...args) {
    const handlers = this._handlers.get(event);
    if (handlers) {
      for (const { handler } of handlers) {
        handler(...args);
      }
    }
  }

  _emitOnce(event, ...args) {
    const handlers = this._handlers.get(event);
    if (handlers) {
      const handlersToCall = [...handlers];
      handlers.length = 0;
      for (const { handler } of handlersToCall) {
        handler(...args);
      }
    }
  }

  // Simulate ready-to-show event
  _triggerReady() {
    this._emitOnce('ready-to-show');
  }

  // Simulate resize event
  _triggerResize(width, height) {
    this._bounds.width = width;
    this._bounds.height = height;
    this._emit('resize');
  }

  // Simulate move event
  _triggerMove(x, y) {
    this._bounds.x = x;
    this._bounds.y = y;
    this._emit('move');
  }

  // Simulate blur event
  _triggerBlur() {
    this._emit('blur');
  }
}

// Mock electron-window-state
const mockWindowStateKeeper = (options = {}) => {
  return {
    x: options.x || 100,
    y: options.y || 100,
    width: options.defaultWidth || 1024,
    height: options.defaultHeight || 768,
    manage: () => {} // Simple mock function
  };
};

// Mock EventBus
class MockEventBus {
  constructor() {
    this._events = [];
  }

  emit(event, data) {
    this._events.push({ event, data, timestamp: Date.now() });
  }

  getEvents() {
    return [...this._events];
  }

  getEventsByType(eventType) {
    return this._events.filter(e => e.event === eventType);
  }

  clear() {
    this._events.length = 0;
  }

  getLastEvent() {
    return this._events[this._events.length - 1];
  }
}

// Setup module mocks using require.cache
const originalRequire = Module.prototype.require;

// Override require for mocking
Module.prototype.require = function(id) {
  if (id === 'electron') {
    return { BrowserWindow: MockBrowserWindow };
  }
  if (id === 'electron-window-state') {
    return mockWindowStateKeeper;
  }
  return originalRequire.apply(this, arguments);
};

// Import WindowManager after mocks are set up
const WindowManager = require('../../../../../app/domains/shell/services/WindowManager');

// Restore original require
Module.prototype.require = originalRequire;

describe('WindowManager', () => {
  let windowManager;
  let eventBus;
  let config;

  beforeEach(() => {
    config = {
      defaultWidth: 1024,
      defaultHeight: 768
    };
    eventBus = new MockEventBus();
    windowManager = new WindowManager(config, eventBus);
  });

  afterEach(() => {
    if (windowManager) {
      windowManager.cleanup();
    }
    eventBus?.clear();
  });

  describe('Constructor', () => {
    it('should initialize with config and eventBus', () => {
      assert.ok(windowManager._config === config);
      assert.ok(windowManager._eventBus === eventBus);
    });

    it('should initialize empty windows map', () => {
      assert.strictEqual(windowManager._windows.size, 0);
    });

    it('should initialize mainWindow as null', () => {
      assert.strictEqual(windowManager._mainWindow, null);
    });

    it('should initialize window counter to 0', () => {
      assert.strictEqual(windowManager._windowCounter, 0);
    });
  });

  describe('createWindow()', () => {
    it('should create window with default options', () => {
      const window = windowManager.createWindow();

      assert.ok(window);
      assert.ok(window.windowId);
      assert.match(window.windowId, /^window-\d+$/);
    });

    it('should create window with custom browserWindowOptions', () => {
      const window = windowManager.createWindow({
        browserWindowOptions: {
          width: 800,
          height: 600,
          title: 'Test Window'
        }
      });

      assert.ok(window);
      assert.strictEqual(window._options.width, 800);
      assert.strictEqual(window._options.height, 600);
    });

    it('should set first window as main window', () => {
      const window = windowManager.createWindow();

      assert.strictEqual(windowManager.getMainWindow(), window);
    });

    it('should mark explicitly main window', () => {
      const window1 = windowManager.createWindow();
      const window2 = windowManager.createWindow({ isMain: true });

      assert.strictEqual(windowManager.getMainWindow(), window2);
    });

    it('should emit shell.window.created event', () => {
      const window = windowManager.createWindow();

      const events = eventBus.getEventsByType('shell.window.created');
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].data.windowId, window.windowId);
      assert.strictEqual(events[0].data.isMain, true);
      assert.ok(events[0].data.bounds);
    });

    it('should track window in internal map', () => {
      const window = windowManager.createWindow();

      assert.strictEqual(windowManager._windows.size, 1);
      assert.ok(windowManager._windows.has(window.windowId));
    });

    it('should increment window counter', () => {
      windowManager.createWindow();
      windowManager.createWindow();
      windowManager.createWindow();

      assert.strictEqual(windowManager._windowCounter, 3);
    });
  });

  describe('getMainWindow()', () => {
    it('should return null when no windows exist', () => {
      assert.strictEqual(windowManager.getMainWindow(), null);
    });

    it('should return first created window', () => {
      const window = windowManager.createWindow();

      assert.strictEqual(windowManager.getMainWindow(), window);
    });

    it('should return explicitly set main window', () => {
      windowManager.createWindow();
      const mainWindow = windowManager.createWindow({ isMain: true });

      assert.strictEqual(windowManager.getMainWindow(), mainWindow);
    });
  });

  describe('getWindow()', () => {
    it('should return window by windowId', () => {
      const window = windowManager.createWindow();

      assert.strictEqual(windowManager.getWindow(window.windowId), window);
    });

    it('should return null for non-existent windowId', () => {
      assert.strictEqual(windowManager.getWindow('invalid-id'), null);
    });
  });

  describe('getAllWindows()', () => {
    it('should return empty array when no windows exist', () => {
      const windows = windowManager.getAllWindows();

      assert.ok(Array.isArray(windows));
      assert.strictEqual(windows.length, 0);
    });

    it('should return array of all windows', () => {
      const window1 = windowManager.createWindow();
      const window2 = windowManager.createWindow();
      const window3 = windowManager.createWindow();

      const windows = windowManager.getAllWindows();
      assert.strictEqual(windows.length, 3);
      assert.ok(windows.includes(window1));
      assert.ok(windows.includes(window2));
      assert.ok(windows.includes(window3));
    });
  });

  describe('getWindowId()', () => {
    it('should return windowId from window object', () => {
      const window = windowManager.createWindow();

      assert.strictEqual(windowManager.getWindowId(window), window.windowId);
    });

    it('should return null for null window', () => {
      assert.strictEqual(windowManager.getWindowId(null), null);
    });

    it('should return null for undefined window', () => {
      assert.strictEqual(windowManager.getWindowId(undefined), null);
    });
  });

  describe('closeWindow()', () => {
    it('should close window successfully', () => {
      const window = windowManager.createWindow();
      eventBus.clear();

      const result = windowManager.closeWindow(window.windowId);

      assert.strictEqual(result, true);
      assert.strictEqual(window.isDestroyed(), true);
    });

    it('should return false for invalid windowId', () => {
      const result = windowManager.closeWindow('invalid-id');

      assert.strictEqual(result, false);
    });

    it('should return false for already destroyed window', () => {
      const window = windowManager.createWindow();
      window.close();

      const result = windowManager.closeWindow(window.windowId);

      assert.strictEqual(result, false);
    });

    it('should emit shell.window.closed event', (t, done) => {
      const window = windowManager.createWindow();
      const windowId = window.windowId;
      eventBus.clear();

      // Close triggers the 'closed' event handler
      windowManager.closeWindow(windowId);

      // Give a tick for the event to propagate
      setImmediate(() => {
        const events = eventBus.getEventsByType('shell.window.closed');
        assert.strictEqual(events.length, 1);
        assert.strictEqual(events[0].data.windowId, windowId);
        done();
      });
    });

    it('should remove window from internal map when closed', (t, done) => {
      const window = windowManager.createWindow();
      const windowId = window.windowId;

      windowManager.closeWindow(windowId);

      setImmediate(() => {
        assert.strictEqual(windowManager._windows.has(windowId), false);
        done();
      });
    });
  });

  describe('focusWindow()', () => {
    it('should focus window successfully', () => {
      const window = windowManager.createWindow();
      eventBus.clear();

      const result = windowManager.focusWindow(window.windowId);

      assert.strictEqual(result, true);
    });

    it('should restore minimized window before focusing', () => {
      const window = windowManager.createWindow();
      window.minimize();
      assert.strictEqual(window.isMinimized(), true);

      windowManager.focusWindow(window.windowId);

      assert.strictEqual(window.isMinimized(), false);
    });

    it('should emit shell.window.focused event', () => {
      const window = windowManager.createWindow();
      eventBus.clear();

      windowManager.focusWindow(window.windowId);

      const events = eventBus.getEventsByType('shell.window.focused');
      assert.ok(events.length >= 1);
      assert.strictEqual(events[0].data.windowId, window.windowId);
    });

    it('should return false for invalid windowId', () => {
      const result = windowManager.focusWindow('invalid-id');

      assert.strictEqual(result, false);
    });
  });

  describe('minimizeWindow()', () => {
    it('should minimize window successfully', () => {
      const window = windowManager.createWindow();

      const result = windowManager.minimizeWindow(window.windowId);

      assert.strictEqual(result, true);
      assert.strictEqual(window.isMinimized(), true);
    });

    it('should emit shell.window.minimized event', () => {
      const window = windowManager.createWindow();
      eventBus.clear();

      windowManager.minimizeWindow(window.windowId);

      const events = eventBus.getEventsByType('shell.window.minimized');
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].data.windowId, window.windowId);
    });

    it('should return false for invalid windowId', () => {
      const result = windowManager.minimizeWindow('invalid-id');

      assert.strictEqual(result, false);
    });
  });

  describe('maximizeWindow()', () => {
    it('should maximize window when not maximized', () => {
      const window = windowManager.createWindow();
      eventBus.clear();

      const result = windowManager.maximizeWindow(window.windowId);

      assert.strictEqual(result, true);
      assert.strictEqual(window.isMaximized(), true);
    });

    it('should unmaximize window when already maximized', () => {
      const window = windowManager.createWindow();
      window.maximize();
      eventBus.clear();

      windowManager.maximizeWindow(window.windowId);

      assert.strictEqual(window.isMaximized(), false);
    });

    it('should emit shell.window.maximized event', () => {
      const window = windowManager.createWindow();
      eventBus.clear();

      windowManager.maximizeWindow(window.windowId);

      const events = eventBus.getEventsByType('shell.window.maximized');
      assert.strictEqual(events.length, 1);
    });

    it('should emit shell.window.unmaximized event', () => {
      const window = windowManager.createWindow();
      window.maximize();
      eventBus.clear();

      windowManager.maximizeWindow(window.windowId);

      const events = eventBus.getEventsByType('shell.window.unmaximized');
      assert.strictEqual(events.length, 1);
    });

    it('should return false for invalid windowId', () => {
      const result = windowManager.maximizeWindow('invalid-id');

      assert.strictEqual(result, false);
    });
  });

  describe('showWindow()', () => {
    it('should show window successfully', () => {
      const window = windowManager.createWindow();

      const result = windowManager.showWindow(window.windowId);

      assert.strictEqual(result, true);
      assert.strictEqual(window._visible, true);
    });

    it('should emit shell.window.shown event', () => {
      const window = windowManager.createWindow();
      eventBus.clear();

      windowManager.showWindow(window.windowId);

      const events = eventBus.getEventsByType('shell.window.shown');
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].data.windowId, window.windowId);
    });

    it('should return false for invalid windowId', () => {
      const result = windowManager.showWindow('invalid-id');

      assert.strictEqual(result, false);
    });
  });

  describe('hideWindow()', () => {
    it('should hide window successfully', () => {
      const window = windowManager.createWindow();
      window.show();

      const result = windowManager.hideWindow(window.windowId);

      assert.strictEqual(result, true);
      assert.strictEqual(window._visible, false);
    });

    it('should emit shell.window.hidden event', () => {
      const window = windowManager.createWindow();
      eventBus.clear();

      windowManager.hideWindow(window.windowId);

      const events = eventBus.getEventsByType('shell.window.hidden');
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].data.windowId, window.windowId);
    });

    it('should return false for invalid windowId', () => {
      const result = windowManager.hideWindow('invalid-id');

      assert.strictEqual(result, false);
    });
  });

  describe('Window Event Handlers', () => {
    it('should emit shell.window.ready event', (t, done) => {
      const window = windowManager.createWindow();
      eventBus.clear();

      window._triggerReady();

      setImmediate(() => {
        const events = eventBus.getEventsByType('shell.window.ready');
        assert.strictEqual(events.length, 1);
        assert.strictEqual(events[0].data.windowId, window.windowId);
        done();
      });
    });

    it('should emit shell.window.resized event', () => {
      const window = windowManager.createWindow();
      eventBus.clear();

      window._triggerResize(1280, 720);

      const events = eventBus.getEventsByType('shell.window.resized');
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].data.windowId, window.windowId);
      assert.ok(events[0].data.bounds);
    });

    it('should emit shell.window.moved event', () => {
      const window = windowManager.createWindow();
      eventBus.clear();

      window._triggerMove(200, 200);

      const events = eventBus.getEventsByType('shell.window.moved');
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].data.windowId, window.windowId);
    });

    it('should emit shell.window.blurred event', () => {
      const window = windowManager.createWindow();
      eventBus.clear();

      window._triggerBlur();

      const events = eventBus.getEventsByType('shell.window.blurred');
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].data.windowId, window.windowId);
    });
  });

  describe('Multi-window Tracking', () => {
    it('should track multiple windows independently', () => {
      const window1 = windowManager.createWindow();
      const window2 = windowManager.createWindow();
      const window3 = windowManager.createWindow();

      assert.strictEqual(windowManager._windows.size, 3);
      assert.ok(window1.windowId !== window2.windowId);
      assert.ok(window2.windowId !== window3.windowId);
    });

    it('should operate on specific windows without affecting others', () => {
      const window1 = windowManager.createWindow();
      const window2 = windowManager.createWindow();

      windowManager.minimizeWindow(window1.windowId);

      assert.strictEqual(window1.isMinimized(), true);
      assert.strictEqual(window2.isMinimized(), false);
    });

    it('should handle closing individual windows', (t, done) => {
      const window1 = windowManager.createWindow();
      const window2 = windowManager.createWindow();
      const window3 = windowManager.createWindow();

      windowManager.closeWindow(window2.windowId);

      setImmediate(() => {
        assert.strictEqual(windowManager._windows.size, 2);
        assert.ok(windowManager._windows.has(window1.windowId));
        assert.ok(!windowManager._windows.has(window2.windowId));
        assert.ok(windowManager._windows.has(window3.windowId));
        done();
      });
    });
  });

  describe('cleanup()', () => {
    it('should close all windows', () => {
      const window1 = windowManager.createWindow();
      const window2 = windowManager.createWindow();
      const window3 = windowManager.createWindow();

      windowManager.cleanup();

      assert.strictEqual(window1.isDestroyed(), true);
      assert.strictEqual(window2.isDestroyed(), true);
      assert.strictEqual(window3.isDestroyed(), true);
    });

    it('should clear windows map', () => {
      windowManager.createWindow();
      windowManager.createWindow();

      windowManager.cleanup();

      assert.strictEqual(windowManager._windows.size, 0);
    });

    it('should clear window states map', () => {
      windowManager.createWindow();
      windowManager.createWindow();

      windowManager.cleanup();

      assert.strictEqual(windowManager._windowStates.size, 0);
    });

    it('should reset main window to null', () => {
      windowManager.createWindow();

      windowManager.cleanup();

      assert.strictEqual(windowManager._mainWindow, null);
    });

    it('should reset window counter', () => {
      windowManager.createWindow();
      windowManager.createWindow();

      windowManager.cleanup();

      assert.strictEqual(windowManager._windowCounter, 0);
    });

    it('should emit shell.windows.cleanup event', () => {
      windowManager.createWindow();
      windowManager.createWindow();
      windowManager.createWindow();
      eventBus.clear();

      windowManager.cleanup();

      const events = eventBus.getEventsByType('shell.windows.cleanup');
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].data.closedCount, 3);
    });

    it('should handle cleanup with no windows gracefully', () => {
      windowManager.cleanup();

      const events = eventBus.getEventsByType('shell.windows.cleanup');
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].data.closedCount, 0);
    });

    it('should skip already destroyed windows', () => {
      const window1 = windowManager.createWindow();
      const window2 = windowManager.createWindow();
      window1.close();

      assert.doesNotThrow(() => {
        windowManager.cleanup();
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle null windowId gracefully', () => {
      assert.strictEqual(windowManager.closeWindow(null), false);
      assert.strictEqual(windowManager.focusWindow(null), false);
      assert.strictEqual(windowManager.minimizeWindow(null), false);
    });

    it('should handle undefined windowId gracefully', () => {
      assert.strictEqual(windowManager.closeWindow(undefined), false);
      assert.strictEqual(windowManager.maximizeWindow(undefined), false);
      assert.strictEqual(windowManager.showWindow(undefined), false);
    });

    it('should handle operations on destroyed windows', () => {
      const window = windowManager.createWindow();
      window._destroyed = true;

      assert.strictEqual(windowManager.focusWindow(window.windowId), false);
      assert.strictEqual(windowManager.minimizeWindow(window.windowId), false);
      assert.strictEqual(windowManager.hideWindow(window.windowId), false);
    });

    it('should handle main window closure correctly', (t, done) => {
      const mainWindow = windowManager.createWindow();
      const windowId = mainWindow.windowId;

      windowManager.closeWindow(windowId);

      setImmediate(() => {
        assert.strictEqual(windowManager._mainWindow, null);
        const events = eventBus.getEventsByType('shell.window.closed');
        assert.strictEqual(events[0].data.wasMainWindow, true);
        done();
      });
    });

    it('should handle secondary window closure without affecting main', (t, done) => {
      const mainWindow = windowManager.createWindow();
      const secondaryWindow = windowManager.createWindow();

      windowManager.closeWindow(secondaryWindow.windowId);

      setImmediate(() => {
        assert.strictEqual(windowManager._mainWindow, mainWindow);
        done();
      });
    });
  });
});
