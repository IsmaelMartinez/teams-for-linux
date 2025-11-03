/**
 * Tests for WindowManager service
 */
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const WindowManager = require('../../../../app/domains/shell/services/WindowManager');

describe('WindowManager', () => {
  let windowManager;
  let mockConfig;
  let mockEventBus;
  let emittedEvents;

  beforeEach(() => {
    mockConfig = {
      defaultWidth: 1024,
      defaultHeight: 768
    };

    emittedEvents = [];
    mockEventBus = {
      emit: (event, data) => {
        emittedEvents.push({ event, data });
      }
    };

    windowManager = new WindowManager(mockConfig, mockEventBus);
  });

  afterEach(() => {
    if (windowManager) {
      windowManager.cleanup();
    }
    emittedEvents = [];
  });

  describe('constructor', () => {
    it('should initialize with empty window collection', () => {
      assert.deepStrictEqual(windowManager.getAllWindows(), []);
      assert.strictEqual(windowManager.getMainWindow(), null);
    });

    it('should store config and eventBus references', () => {
      assert.strictEqual(windowManager._config, mockConfig);
      assert.strictEqual(windowManager._eventBus, mockEventBus);
    });
  });

  describe('getMainWindow', () => {
    it('should return null when no main window exists', () => {
      assert.strictEqual(windowManager.getMainWindow(), null);
    });
  });

  describe('getAllWindows', () => {
    it('should return empty array when no windows exist', () => {
      const windows = windowManager.getAllWindows();
      assert.strictEqual(Array.isArray(windows), true);
      assert.strictEqual(windows.length, 0);
    });
  });

  describe('getWindow', () => {
    it('should return null for non-existent window ID', () => {
      const window = windowManager.getWindow('non-existent');
      assert.strictEqual(window, null);
    });
  });

  describe('cleanup', () => {
    it('should clear all internal state', () => {
      windowManager.cleanup();

      assert.deepStrictEqual(windowManager.getAllWindows(), []);
      assert.strictEqual(windowManager.getMainWindow(), null);

      const cleanupEvent = emittedEvents.find(e => e.event === 'shell.windows.cleanup');
      assert.ok(cleanupEvent, 'cleanup event should be emitted');
      assert.ok(typeof cleanupEvent.data.closedCount === 'number');
    });

    it('should emit cleanup event with correct count', () => {
      windowManager.cleanup();

      const cleanupEvent = emittedEvents.find(e => e.event === 'shell.windows.cleanup');
      assert.ok(cleanupEvent);
      assert.strictEqual(cleanupEvent.data.closedCount, 0);
    });
  });

  describe('window operations', () => {
    it('should return false for operations on non-existent windows', () => {
      assert.strictEqual(windowManager.focusWindow('non-existent'), false);
      assert.strictEqual(windowManager.minimizeWindow('non-existent'), false);
      assert.strictEqual(windowManager.maximizeWindow('non-existent'), false);
      assert.strictEqual(windowManager.closeWindow('non-existent'), false);
      assert.strictEqual(windowManager.showWindow('non-existent'), false);
      assert.strictEqual(windowManager.hideWindow('non-existent'), false);
    });
  });

  describe('getWindowId', () => {
    it('should return null for null window', () => {
      assert.strictEqual(windowManager.getWindowId(null), null);
    });

    it('should return null for undefined window', () => {
      assert.strictEqual(windowManager.getWindowId(undefined), null);
    });

    it('should return null for window without windowId', () => {
      const mockWindow = {};
      assert.strictEqual(windowManager.getWindowId(mockWindow), null);
    });

    it('should return windowId if present', () => {
      const mockWindow = { windowId: 'test-window-1' };
      assert.strictEqual(windowManager.getWindowId(mockWindow), 'test-window-1');
    });
  });
});
