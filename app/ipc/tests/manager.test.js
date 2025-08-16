/**
 * Unit Tests for IPC Manager
 * 
 * Tests the basic functionality of the IPC manager including
 * handler registration, lifecycle management, and error handling.
 * 
 * Note: These tests use a mock ipcMain since we can't easily test
 * the real Electron ipcMain in a unit test environment.
 */

// Mock electron-log
const mockLogger = {
  scope: () => mockLogger,
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};

// Mock electron ipcMain
const mockIpcMain = {
  handle: jest.fn(),
  on: jest.fn(),
  once: jest.fn(),
  removeHandler: jest.fn(),
  removeListener: jest.fn()
};

// Mock electron module
jest.mock('electron', () => ({
  ipcMain: mockIpcMain
}));

jest.mock('electron-log', () => mockLogger);

// Import the module under test
const IPCManager = require('../manager');

describe('IPCManager', () => {
  let ipcManager;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Create fresh instance for each test
    ipcManager = new (require('../manager').constructor)();
  });

  describe('initialization', () => {
    test('should initialize successfully', () => {
      expect(ipcManager.isInitialized).toBe(false);
      
      ipcManager.initialize();
      
      expect(ipcManager.isInitialized).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith('Initializing IPC Manager');
    });

    test('should warn on double initialization', () => {
      ipcManager.initialize();
      ipcManager.initialize();
      
      expect(mockLogger.warn).toHaveBeenCalledWith('IPC Manager already initialized');
    });
  });

  describe('handler registration', () => {
    test('should register handle-type handler successfully', () => {
      const mockHandler = jest.fn();
      const channel = 'test-channel';
      
      ipcManager.handle(channel, mockHandler);
      
      expect(mockIpcMain.handle).toHaveBeenCalledWith(channel, expect.any(Function));
      expect(ipcManager.hasHandler(channel)).toBe(true);
      expect(ipcManager.getHandlerCount()).toBe(1);
    });

    test('should register on-type handler successfully', () => {
      const mockHandler = jest.fn();
      const channel = 'test-event';
      
      ipcManager.on(channel, mockHandler);
      
      expect(mockIpcMain.on).toHaveBeenCalledWith(channel, expect.any(Function));
      expect(ipcManager.hasHandler(channel)).toBe(true);
    });

    test('should register once-type handler successfully', () => {
      const mockHandler = jest.fn();
      const channel = 'test-once';
      
      ipcManager.once(channel, mockHandler);
      
      expect(mockIpcMain.once).toHaveBeenCalledWith(channel, expect.any(Function));
      expect(ipcManager.hasHandler(channel)).toBe(true);
    });

    test('should warn when overwriting existing handler', () => {
      const channel = 'duplicate-channel';
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      
      ipcManager.handle(channel, handler1);
      ipcManager.handle(channel, handler2);
      
      expect(mockLogger.warn).toHaveBeenCalledWith(
        `Handler for channel '${channel}' already registered, overwriting`
      );
    });
  });

  describe('handler removal', () => {
    test('should remove handle-type handler successfully', () => {
      const mockHandler = jest.fn();
      const channel = 'test-remove';
      
      ipcManager.handle(channel, mockHandler);
      expect(ipcManager.hasHandler(channel)).toBe(true);
      
      const removed = ipcManager.removeHandler(channel);
      
      expect(removed).toBe(true);
      expect(mockIpcMain.removeHandler).toHaveBeenCalledWith(channel);
      expect(ipcManager.hasHandler(channel)).toBe(false);
    });

    test('should warn when removing non-existent handler', () => {
      const channel = 'non-existent';
      
      const removed = ipcManager.removeHandler(channel);
      
      expect(removed).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        `No handler found for channel '${channel}'`
      );
    });

    test('should remove all handlers successfully', () => {
      ipcManager.handle('channel1', jest.fn());
      ipcManager.on('channel2', jest.fn());
      
      expect(ipcManager.getHandlerCount()).toBe(2);
      
      ipcManager.removeAllHandlers();
      
      expect(ipcManager.getHandlerCount()).toBe(0);
      expect(mockLogger.info).toHaveBeenCalledWith('All IPC handlers removed');
    });
  });

  describe('handler information', () => {
    test('should return correct handler information', () => {
      const channel1 = 'test-info-1';
      const channel2 = 'test-info-2';
      
      ipcManager.handle(channel1, jest.fn(), { logArgs: true });
      ipcManager.on(channel2, jest.fn());
      
      const info = ipcManager.getHandlerInfo();
      
      expect(info).toHaveLength(2);
      expect(info[0].channel).toBe(channel1);
      expect(info[0].type).toBe('handle');
      expect(info[0].options.logArgs).toBe(true);
      expect(info[1].channel).toBe(channel2);
      expect(info[1].type).toBe('on');
    });

    test('should return handlers sorted by channel name', () => {
      ipcManager.handle('z-channel', jest.fn());
      ipcManager.handle('a-channel', jest.fn());
      ipcManager.handle('m-channel', jest.fn());
      
      const info = ipcManager.getHandlerInfo();
      
      expect(info[0].channel).toBe('a-channel');
      expect(info[1].channel).toBe('m-channel');
      expect(info[2].channel).toBe('z-channel');
    });
  });

  describe('error handling', () => {
    test('should handle async handler errors gracefully', async () => {
      const errorMessage = 'Test error';
      const mockHandler = jest.fn().mockRejectedValue(new Error(errorMessage));
      const channel = 'error-channel';
      
      ipcManager.handle(channel, mockHandler);
      
      // Get the wrapped handler that was passed to ipcMain.handle
      const wrappedHandler = mockIpcMain.handle.mock.calls[0][1];
      
      // Test that errors are properly caught and logged
      await expect(wrappedHandler({}, 'test-arg')).rejects.toThrow(errorMessage);
      expect(mockLogger.error).toHaveBeenCalledWith(
        `IPC handle error on channel '${channel}':`,
        expect.any(Error)
      );
    });

    test('should handle sync handler errors gracefully', () => {
      const errorMessage = 'Test sync error';
      const mockHandler = jest.fn().mockImplementation(() => {
        throw new Error(errorMessage);
      });
      const channel = 'sync-error-channel';
      
      ipcManager.on(channel, mockHandler);
      
      // Get the wrapped handler that was passed to ipcMain.on
      const wrappedHandler = mockIpcMain.on.mock.calls[0][1];
      
      // Test that errors are caught and logged (not re-thrown for 'on' handlers)
      expect(() => wrappedHandler({}, 'test-arg')).not.toThrow();
      expect(mockLogger.error).toHaveBeenCalledWith(
        `IPC event error on channel '${channel}':`,
        expect.any(Error)
      );
    });
  });

  describe('logging', () => {
    test('should log handler registration', () => {
      const channel = 'log-test';
      
      ipcManager.handle(channel, jest.fn());
      
      expect(mockLogger.debug).toHaveBeenCalledWith(`Registered IPC handler: ${channel}`);
    });

    test('should log with options when enabled', async () => {
      const channel = 'log-args-test';
      const mockHandler = jest.fn().mockResolvedValue('test-result');
      
      ipcManager.handle(channel, mockHandler, { logArgs: true, logResult: true });
      
      // Get and call the wrapped handler
      const wrappedHandler = mockIpcMain.handle.mock.calls[0][1];
      await wrappedHandler({}, 'test-arg');
      
      expect(mockLogger.debug).toHaveBeenCalledWith(
        `IPC handle request: ${channel}`,
        { args: ['test-arg'] }
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        `IPC handle response: ${channel}`,
        { result: 'test-result' }
      );
    });

    test('should hide args and results when logging disabled', async () => {
      const channel = 'no-log-test';
      const mockHandler = jest.fn().mockResolvedValue('secret-result');
      
      ipcManager.handle(channel, mockHandler); // No logging options
      
      // Get and call the wrapped handler
      const wrappedHandler = mockIpcMain.handle.mock.calls[0][1];
      await wrappedHandler({}, 'secret-arg');
      
      expect(mockLogger.debug).toHaveBeenCalledWith(
        `IPC handle request: ${channel}`,
        { args: '[hidden]' }
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        `IPC handle response: ${channel}`,
        { result: '[hidden]' }
      );
    });
  });
});