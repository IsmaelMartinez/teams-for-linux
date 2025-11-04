/**
 * Electron API Mocks for Testing
 * Provides mock implementations of Electron APIs for unit testing
 */

/**
 * Mock for electron.app
 */
export const mockApp = {
  getPath: (name) => {
    const paths = {
      home: '/home/test-user',
      appData: '/home/test-user/.config',
      userData: '/home/test-user/.config/teams-for-linux',
      sessionData: '/home/test-user/.config/teams-for-linux/Session',
      temp: '/tmp',
      exe: '/usr/bin/teams-for-linux',
      module: '/usr/lib/teams-for-linux',
      desktop: '/home/test-user/Desktop',
      documents: '/home/test-user/Documents',
      downloads: '/home/test-user/Downloads',
      music: '/home/test-user/Music',
      pictures: '/home/test-user/Pictures',
      videos: '/home/test-user/Videos',
      logs: '/home/test-user/.config/teams-for-linux/logs',
    };
    return paths[name] || '/tmp';
  },
  getName: () => 'teams-for-linux',
  getVersion: () => '3.0.0',
  getLocale: () => 'en-US',
  isPackaged: false,
  whenReady: () => Promise.resolve(),
  quit: () => {},
  exit: (code = 0) => {},
  relaunch: () => {},
  focus: () => {},
  hide: () => {},
  show: () => {},
  setAppUserModelId: () => {},
  on: (event, callback) => {},
  once: (event, callback) => {},
  removeListener: (event, callback) => {},
};

/**
 * Mock for electron.BrowserWindow
 */
export class MockBrowserWindow {
  constructor(options = {}) {
    this.options = options;
    this.webContents = new MockWebContents();
    this._isDestroyed = false;
    this._isVisible = true;
    this._bounds = { x: 0, y: 0, width: 800, height: 600 };
  }

  loadURL(url) {
    this.webContents.url = url;
    return Promise.resolve();
  }

  loadFile(filePath) {
    this.webContents.url = `file://${filePath}`;
    return Promise.resolve();
  }

  show() {
    this._isVisible = true;
  }

  hide() {
    this._isVisible = false;
  }

  close() {
    this._isDestroyed = true;
  }

  destroy() {
    this._isDestroyed = true;
  }

  isDestroyed() {
    return this._isDestroyed;
  }

  isVisible() {
    return this._isVisible;
  }

  focus() {}

  blur() {}

  setTitle(title) {
    this.title = title;
  }

  getTitle() {
    return this.title || 'Teams for Linux';
  }

  setBounds(bounds) {
    this._bounds = { ...this._bounds, ...bounds };
  }

  getBounds() {
    return this._bounds;
  }

  setSize(width, height) {
    this._bounds.width = width;
    this._bounds.height = height;
  }

  getSize() {
    return [this._bounds.width, this._bounds.height];
  }

  on(event, callback) {
    return this;
  }

  once(event, callback) {
    return this;
  }

  removeListener(event, callback) {
    return this;
  }

  static getAllWindows() {
    return [];
  }

  static getFocusedWindow() {
    return null;
  }
}

/**
 * Mock for electron.webContents
 */
export class MockWebContents {
  constructor() {
    this.url = '';
    this.session = new MockSession();
  }

  getURL() {
    return this.url;
  }

  send(channel, ...args) {}

  executeJavaScript(code) {
    return Promise.resolve();
  }

  insertCSS(css) {
    return Promise.resolve();
  }

  on(event, callback) {
    return this;
  }

  once(event, callback) {
    return this;
  }

  removeListener(event, callback) {
    return this;
  }
}

/**
 * Mock for electron.session
 */
export class MockSession {
  constructor() {
    this.cookies = new MockCookies();
  }

  clearCache() {
    return Promise.resolve();
  }

  clearStorageData() {
    return Promise.resolve();
  }

  setUserAgent(userAgent) {}
}

/**
 * Mock for electron.session.cookies
 */
export class MockCookies {
  constructor() {
    this._cookies = new Map();
  }

  get(filter) {
    return Promise.resolve([]);
  }

  set(details) {
    this._cookies.set(details.url, details);
    return Promise.resolve();
  }

  remove(url, name) {
    return Promise.resolve();
  }
}

/**
 * Mock for electron.ipcMain
 */
export const mockIpcMain = {
  on: (channel, callback) => {},
  once: (channel, callback) => {},
  removeListener: (channel, callback) => {},
  handle: (channel, handler) => {},
  handleOnce: (channel, handler) => {},
  removeHandler: (channel) => {},
};

/**
 * Mock for electron.ipcRenderer
 */
export const mockIpcRenderer = {
  send: (channel, ...args) => {},
  sendSync: (channel, ...args) => null,
  invoke: (channel, ...args) => Promise.resolve(),
  on: (channel, callback) => {},
  once: (channel, callback) => {},
  removeListener: (channel, callback) => {},
};

/**
 * Mock for electron.dialog
 */
export const mockDialog = {
  showOpenDialog: (options) => Promise.resolve({ canceled: false, filePaths: [] }),
  showSaveDialog: (options) => Promise.resolve({ canceled: false, filePath: '/tmp/test.txt' }),
  showMessageBox: (options) => Promise.resolve({ response: 0 }),
  showErrorBox: (title, content) => {},
};

/**
 * Mock for electron.Menu
 */
export class MockMenu {
  constructor() {
    this.items = [];
  }

  append(menuItem) {
    this.items.push(menuItem);
  }

  popup(options) {}

  static buildFromTemplate(template) {
    const menu = new MockMenu();
    menu.items = template;
    return menu;
  }

  static setApplicationMenu(menu) {}

  static getApplicationMenu() {
    return null;
  }
}

/**
 * Mock for electron.MenuItem
 */
export class MockMenuItem {
  constructor(options) {
    this.options = options;
    this.label = options.label;
    this.type = options.type || 'normal';
    this.role = options.role;
    this.click = options.click;
  }
}

/**
 * Mock for electron.Tray
 */
export class MockTray {
  constructor(icon) {
    this.icon = icon;
  }

  setContextMenu(menu) {
    this.menu = menu;
  }

  setToolTip(toolTip) {
    this.toolTip = toolTip;
  }

  setImage(image) {
    this.icon = image;
  }

  destroy() {}
}

/**
 * Mock for electron.Notification
 */
export class MockNotification {
  constructor(options) {
    this.options = options;
  }

  show() {}

  close() {}

  on(event, callback) {
    return this;
  }

  static isSupported() {
    return true;
  }
}

/**
 * Create a complete mock electron object
 */
export function createElectronMock() {
  return {
    app: mockApp,
    BrowserWindow: MockBrowserWindow,
    ipcMain: mockIpcMain,
    ipcRenderer: mockIpcRenderer,
    dialog: mockDialog,
    Menu: MockMenu,
    MenuItem: MockMenuItem,
    Tray: MockTray,
    Notification: MockNotification,
  };
}

/**
 * Helper to reset all mocks
 */
export function resetMocks() {
  // Reset any stateful mocks here
}
