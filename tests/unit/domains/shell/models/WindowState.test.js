import { describe, it, beforeEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { createRequire } from 'node:module';
import { MockBrowserWindow } from '../../../../helpers/electron-mocks.js';

const require = createRequire(import.meta.url);

// Mock electron screen before requiring WindowState
const mockScreen = {
  getPrimaryDisplay() {
    return {
      workAreaSize: { width: 1920, height: 1080 }
    };
  },
  getAllDisplays() {
    return [{
      workArea: { x: 0, y: 0, width: 1920, height: 1080 }
    }];
  }
};

// Inject mock into require cache
require.cache[require.resolve('electron')] = {
  exports: { screen: mockScreen }
};

const WindowState = require('../../../../../app/domains/shell/models/WindowState.js');

describe('WindowState', () => {
  let mockStore;
  let mockWindow;

  beforeEach(() => {
    // Mock electron-store
    mockStore = {
      get: () => null,
      set: () => {}
    };

    // Mock BrowserWindow with enhanced methods
    mockWindow = new MockBrowserWindow({
      width: 800,
      height: 600
    });

    // Add missing methods for WindowState
    mockWindow.isMaximized = () => false;
    mockWindow.maximize = () => {};

    // Track event handlers
    mockWindow._eventHandlers = {};
    const originalOn = mockWindow.on;
    mockWindow.on = function(event, handler) {
      if (!this._eventHandlers[event]) {
        this._eventHandlers[event] = [];
      }
      this._eventHandlers[event].push(handler);
      return originalOn.call(this, event, handler);
    };
  });

  describe('Constructor Initialization', () => {
    it('should throw error when store is missing', () => {
      assert.throws(
        () => new WindowState(),
        /WindowState requires an electron-store instance/
      );
    });

    it('should initialize with default values', () => {
      const state = new WindowState({ store: mockStore });

      assert.strictEqual(state._name, 'main-window');
      assert.strictEqual(state._defaultWidth, 1024);
      assert.strictEqual(state._defaultHeight, 768);
      assert.strictEqual(state._window, null);
    });

    it('should accept custom window name', () => {
      const state = new WindowState({
        store: mockStore,
        name: 'custom-window'
      });

      assert.strictEqual(state._name, 'custom-window');
      assert.strictEqual(state._storeKey, 'windowState.custom-window');
    });

    it('should accept custom dimensions', () => {
      const state = new WindowState({
        store: mockStore,
        defaultWidth: 1280,
        defaultHeight: 720
      });

      assert.strictEqual(state._defaultWidth, 1280);
      assert.strictEqual(state._defaultHeight, 720);
    });

    it('should center window on screen with default bounds', () => {
      const state = new WindowState({ store: mockStore });
      const bounds = state.getBounds();

      // Should be centered: (1920 - 1024) / 2 = 448
      assert.strictEqual(bounds.x, 448);
      assert.strictEqual(bounds.y, 156); // (1080 - 768) / 2
      assert.strictEqual(bounds.width, 1024);
      assert.strictEqual(bounds.height, 768);
    });
  });

  describe('Loading Bounds from Store', () => {
    it('should load valid saved bounds', () => {
      const savedBounds = {
        x: 200,
        y: 150,
        width: 1000,
        height: 700,
        isMaximized: false
      };
      mockStore.get = () => savedBounds;

      const state = new WindowState({ store: mockStore });
      const bounds = state.getBounds();

      assert.strictEqual(bounds.x, 200);
      assert.strictEqual(bounds.y, 150);
      assert.strictEqual(bounds.width, 1000);
      assert.strictEqual(bounds.height, 700);
    });

    it('should use defaults when store returns null', () => {
      mockStore.get = () => null;

      const state = new WindowState({ store: mockStore });
      const bounds = state.getBounds();

      assert.strictEqual(bounds.width, 1024);
      assert.strictEqual(bounds.height, 768);
    });

    it('should use defaults when saved bounds are invalid', () => {
      mockStore.get = () => ({
        x: 'invalid',
        y: 100,
        width: 800,
        height: 600
      });

      const state = new WindowState({ store: mockStore });
      const bounds = state.getBounds();

      // Should fallback to defaults
      assert.strictEqual(bounds.width, 1024);
      assert.strictEqual(bounds.height, 768);
    });

    it('should return copy of bounds object', () => {
      const state = new WindowState({ store: mockStore });
      const bounds1 = state.getBounds();
      const bounds2 = state.getBounds();

      assert.deepStrictEqual(bounds1, bounds2);
      assert.notStrictEqual(bounds1, bounds2); // Different objects
    });
  });

  describe('Maximized State Tracking', () => {
    it('should load maximized state from store', () => {
      mockStore.get = () => ({
        x: 100,
        y: 100,
        width: 800,
        height: 600,
        isMaximized: true
      });

      const state = new WindowState({ store: mockStore });

      assert.strictEqual(state.isMaximized(), true);
    });

    it('should default to false when no saved maximized state', () => {
      const state = new WindowState({ store: mockStore });

      assert.strictEqual(state.isMaximized(), false);
    });

    it('should maximize window when managing if previously maximized', () => {
      mockStore.get = () => ({
        x: 100,
        y: 100,
        width: 800,
        height: 600,
        isMaximized: true
      });

      let maximizeCalled = false;
      mockWindow.maximize = () => { maximizeCalled = true; };

      const state = new WindowState({ store: mockStore });
      state.manage(mockWindow);

      assert.strictEqual(maximizeCalled, true);
    });
  });

  describe('Saving Bounds to Store', () => {
    it('should save window bounds and maximized state', () => {
      const state = new WindowState({ store: mockStore });

      let savedKey = null;
      let savedValue = null;
      mockStore.set = (key, value) => {
        savedKey = key;
        savedValue = value;
      };

      state.saveState(mockWindow);

      assert.strictEqual(savedKey, 'windowState.main-window');
      assert.strictEqual(savedValue.x, 0);
      assert.strictEqual(savedValue.y, 0);
      assert.strictEqual(savedValue.width, 800);
      assert.strictEqual(savedValue.height, 600);
      assert.strictEqual(savedValue.isMaximized, false);
    });

    it('should not save bounds when window is maximized', () => {
      const initialBounds = {
        x: 50,
        y: 50,
        width: 500,
        height: 400
      };
      mockStore.get = () => initialBounds;
      mockWindow.isMaximized = () => true;
      mockWindow.getBounds = () => ({
        x: 0,
        y: 0,
        width: 1920,
        height: 1080
      });

      const state = new WindowState({ store: mockStore });
      state.saveState(mockWindow);

      // Bounds should remain unchanged
      const bounds = state.getBounds();
      assert.strictEqual(bounds.x, 50);
      assert.strictEqual(bounds.y, 50);
      assert.strictEqual(bounds.width, 500);
      assert.strictEqual(bounds.height, 400);
    });

    it('should not save when window is destroyed', () => {
      const state = new WindowState({ store: mockStore });

      let setCalled = false;
      mockStore.set = () => { setCalled = true; };

      mockWindow.isDestroyed = () => true;
      state.saveState(mockWindow);

      assert.strictEqual(setCalled, false);
    });

    it('should not save when window is null', () => {
      const state = new WindowState({ store: mockStore });

      let setCalled = false;
      mockStore.set = () => { setCalled = true; };

      state.saveState(null);

      assert.strictEqual(setCalled, false);
    });
  });

  describe('Bounds Validation', () => {
    it('should reject bounds with missing properties', () => {
      mockStore.get = () => ({
        x: 100,
        y: 100,
        width: 800
        // Missing height
      });

      const state = new WindowState({ store: mockStore });
      const bounds = state.getBounds();

      // Should use defaults
      assert.strictEqual(bounds.width, 1024);
      assert.strictEqual(bounds.height, 768);
    });

    it('should reject bounds with non-numeric values', () => {
      mockStore.get = () => ({
        x: 'invalid',
        y: 100,
        width: 800,
        height: 600
      });

      const state = new WindowState({ store: mockStore });
      const bounds = state.getBounds();

      // Should use defaults
      assert.strictEqual(bounds.width, 1024);
      assert.strictEqual(bounds.height, 768);
    });

    it('should reject bounds below minimum dimensions', () => {
      mockStore.get = () => ({
        x: 100,
        y: 100,
        width: 150, // Below 200px minimum
        height: 600
      });

      const state = new WindowState({ store: mockStore });
      const bounds = state.getBounds();

      // Should use defaults
      assert.strictEqual(bounds.width, 1024);
      assert.strictEqual(bounds.height, 768);
    });

    it('should reject bounds positioned off-screen', () => {
      mockStore.get = () => ({
        x: 5000, // Way off screen
        y: 100,
        width: 800,
        height: 600
      });

      const state = new WindowState({ store: mockStore });
      const bounds = state.getBounds();

      // Should use defaults
      assert.strictEqual(bounds.width, 1024);
      assert.strictEqual(bounds.height, 768);
    });

    it('should not save invalid bounds during saveState', () => {
      mockStore.get = () => ({
        x: 100,
        y: 100,
        width: 800,
        height: 600
      });

      mockWindow.getBounds = () => ({
        x: 100,
        y: 100,
        width: 150, // Below minimum
        height: 600
      });

      const state = new WindowState({ store: mockStore });
      state.saveState(mockWindow);

      // Should keep old bounds, not save invalid ones
      const bounds = state.getBounds();
      assert.strictEqual(bounds.width, 800); // Original value
    });
  });

  describe('Window Event Handler Attachment', () => {
    it('should throw error when managing without window', () => {
      const state = new WindowState({ store: mockStore });

      assert.throws(
        () => state.manage(null),
        /browserWindow is required/
      );
    });

    it('should attach resize event handler', () => {
      const state = new WindowState({ store: mockStore });
      state.manage(mockWindow);

      assert.ok(mockWindow._eventHandlers.resize, 'resize handler should be attached');
      assert.strictEqual(mockWindow._eventHandlers.resize.length, 1);
    });

    it('should attach move event handler', () => {
      const state = new WindowState({ store: mockStore });
      state.manage(mockWindow);

      assert.ok(mockWindow._eventHandlers.move, 'move handler should be attached');
      assert.strictEqual(mockWindow._eventHandlers.move.length, 1);
    });

    it('should attach maximize and unmaximize handlers', () => {
      const state = new WindowState({ store: mockStore });
      state.manage(mockWindow);

      assert.ok(mockWindow._eventHandlers.maximize, 'maximize handler should be attached');
      assert.ok(mockWindow._eventHandlers.unmaximize, 'unmaximize handler should be attached');
    });

    it('should attach close event handler', () => {
      const state = new WindowState({ store: mockStore });
      state.manage(mockWindow);

      assert.ok(mockWindow._eventHandlers.close, 'close handler should be attached');
      assert.strictEqual(typeof mockWindow._eventHandlers.close[0], 'function');
    });

    it('should store window reference when managing', () => {
      const state = new WindowState({ store: mockStore });

      assert.strictEqual(state._window, null);

      state.manage(mockWindow);

      assert.strictEqual(state._window, mockWindow);
    });
  });
});
