const WindowState = require('../../../../app/domains/shell/models/WindowState');

describe('WindowState', () => {
  let mockStore;
  let mockWindow;
  let mockScreen;

  beforeEach(() => {
    // Mock electron-store
    mockStore = {
      get: jest.fn(),
      set: jest.fn()
    };

    // Mock BrowserWindow
    mockWindow = {
      getBounds: jest.fn(() => ({ x: 100, y: 100, width: 800, height: 600 })),
      isMaximized: jest.fn(() => false),
      isDestroyed: jest.fn(() => false),
      maximize: jest.fn(),
      on: jest.fn()
    };

    // Mock electron screen
    mockScreen = {
      getPrimaryDisplay: () => ({
        workAreaSize: { width: 1920, height: 1080 }
      }),
      getAllDisplays: () => [{
        workArea: { x: 0, y: 0, width: 1920, height: 1080 }
      }]
    };

    // Mock electron module
    jest.mock('electron', () => ({
      screen: mockScreen
    }));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should throw error without store', () => {
      expect(() => new WindowState()).toThrow('WindowState requires an electron-store instance');
    });

    it('should use default options', () => {
      mockStore.get.mockReturnValue(null);
      const state = new WindowState({ store: mockStore });

      expect(state._name).toBe('main-window');
      expect(state._defaultWidth).toBe(1024);
      expect(state._defaultHeight).toBe(768);
    });

    it('should accept custom options', () => {
      mockStore.get.mockReturnValue(null);
      const state = new WindowState({
        store: mockStore,
        name: 'custom-window',
        defaultWidth: 1280,
        defaultHeight: 720
      });

      expect(state._name).toBe('custom-window');
      expect(state._defaultWidth).toBe(1280);
      expect(state._defaultHeight).toBe(720);
    });

    it('should load saved bounds', () => {
      const savedBounds = { x: 200, y: 150, width: 1000, height: 700, isMaximized: true };
      mockStore.get.mockReturnValue(savedBounds);

      const state = new WindowState({ store: mockStore });
      const bounds = state.getBounds();

      expect(bounds).toEqual({ x: 200, y: 150, width: 1000, height: 700 });
      expect(state.isMaximized()).toBe(true);
    });
  });

  describe('getBounds', () => {
    it('should return copy of bounds', () => {
      mockStore.get.mockReturnValue(null);
      const state = new WindowState({ store: mockStore });
      const bounds1 = state.getBounds();
      const bounds2 = state.getBounds();

      expect(bounds1).toEqual(bounds2);
      expect(bounds1).not.toBe(bounds2);
    });
  });

  describe('saveState', () => {
    it('should save window bounds and maximized state', () => {
      mockStore.get.mockReturnValue(null);
      const state = new WindowState({ store: mockStore });

      state.saveState(mockWindow);

      expect(mockStore.set).toHaveBeenCalledWith(
        'windowState.main-window',
        expect.objectContaining({
          x: 100,
          y: 100,
          width: 800,
          height: 600,
          isMaximized: false
        })
      );
    });

    it('should not save if window is destroyed', () => {
      mockStore.get.mockReturnValue(null);
      mockWindow.isDestroyed.mockReturnValue(true);
      const state = new WindowState({ store: mockStore });

      state.saveState(mockWindow);

      expect(mockStore.set).not.toHaveBeenCalled();
    });

    it('should not update bounds when maximized', () => {
      mockStore.get.mockReturnValue({ x: 50, y: 50, width: 500, height: 400 });
      mockWindow.isMaximized.mockReturnValue(true);
      const state = new WindowState({ store: mockStore });

      state.saveState(mockWindow);

      const bounds = state.getBounds();
      expect(bounds).toEqual({ x: 50, y: 50, width: 500, height: 400 });
    });
  });

  describe('manage', () => {
    it('should throw error without window', () => {
      mockStore.get.mockReturnValue(null);
      const state = new WindowState({ store: mockStore });

      expect(() => state.manage(null)).toThrow('browserWindow is required');
    });

    it('should attach event handlers', () => {
      mockStore.get.mockReturnValue(null);
      const state = new WindowState({ store: mockStore });

      state.manage(mockWindow);

      expect(mockWindow.on).toHaveBeenCalledWith('resize', expect.any(Function));
      expect(mockWindow.on).toHaveBeenCalledWith('move', expect.any(Function));
      expect(mockWindow.on).toHaveBeenCalledWith('maximize', expect.any(Function));
      expect(mockWindow.on).toHaveBeenCalledWith('unmaximize', expect.any(Function));
      expect(mockWindow.on).toHaveBeenCalledWith('close', expect.any(Function));
    });

    it('should maximize window if previously maximized', () => {
      mockStore.get.mockReturnValue({ x: 100, y: 100, width: 800, height: 600, isMaximized: true });
      const state = new WindowState({ store: mockStore });

      state.manage(mockWindow);

      expect(mockWindow.maximize).toHaveBeenCalled();
    });
  });
});
