/**
 * Sample Unit Test - Electron Mocks
 * Demonstrates mocking Electron APIs for testing
 */

import { describe, it, beforeEach } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  MockBrowserWindow,
  MockWebContents,
  mockApp,
  mockIpcMain,
  createElectronMock,
} from '../helpers/electron-mocks.js';

describe('Electron Mocks', () => {
  describe('mockApp', () => {
    it('should return valid paths', () => {
      const userDataPath = mockApp.getPath('userData');
      assert.ok(userDataPath.includes('teams-for-linux'));
    });

    it('should return app name and version', () => {
      assert.equal(mockApp.getName(), 'teams-for-linux');
      assert.equal(mockApp.getVersion(), '3.0.0');
    });

    it('should return locale', () => {
      assert.equal(mockApp.getLocale(), 'en-US');
    });
  });

  describe('MockBrowserWindow', () => {
    let window;

    beforeEach(() => {
      window = new MockBrowserWindow({
        width: 800,
        height: 600,
      });
    });

    it('should create window with correct options', () => {
      assert.equal(window.options.width, 800);
      assert.equal(window.options.height, 600);
    });

    it('should have webContents', () => {
      assert.ok(window.webContents instanceof MockWebContents);
    });

    it('should load URL', async () => {
      await window.loadURL('https://teams.microsoft.com');
      assert.equal(window.webContents.getURL(), 'https://teams.microsoft.com');
    });

    it('should load file', async () => {
      await window.loadFile('/path/to/index.html');
      assert.ok(window.webContents.getURL().includes('file://'));
    });

    it('should show and hide', () => {
      window.show();
      assert.equal(window.isVisible(), true);

      window.hide();
      assert.equal(window.isVisible(), false);
    });

    it('should set and get title', () => {
      window.setTitle('Test Window');
      assert.equal(window.getTitle(), 'Test Window');
    });

    it('should manage bounds', () => {
      window.setBounds({ x: 100, y: 200, width: 1024, height: 768 });
      const bounds = window.getBounds();
      assert.equal(bounds.x, 100);
      assert.equal(bounds.y, 200);
      assert.equal(bounds.width, 1024);
      assert.equal(bounds.height, 768);
    });

    it('should set and get size', () => {
      window.setSize(1280, 720);
      const size = window.getSize();
      assert.equal(size[0], 1280);
      assert.equal(size[1], 720);
    });

    it('should close and destroy', () => {
      window.close();
      assert.equal(window.isDestroyed(), true);

      const window2 = new MockBrowserWindow();
      window2.destroy();
      assert.equal(window2.isDestroyed(), true);
    });
  });

  describe('MockWebContents', () => {
    let webContents;

    beforeEach(() => {
      webContents = new MockWebContents();
    });

    it('should get and set URL', () => {
      webContents.url = 'https://example.com';
      assert.equal(webContents.getURL(), 'https://example.com');
    });

    it('should execute JavaScript', async () => {
      await assert.doesNotReject(async () => {
        await webContents.executeJavaScript('console.log("test")');
      });
    });

    it('should insert CSS', async () => {
      await assert.doesNotReject(async () => {
        await webContents.insertCSS('body { background: red; }');
      });
    });

    it('should send IPC messages', () => {
      assert.doesNotThrow(() => {
        webContents.send('test-channel', { data: 'test' });
      });
    });

    it('should have session', () => {
      assert.ok(webContents.session);
    });
  });

  describe('mockIpcMain', () => {
    it('should register event listeners', () => {
      assert.doesNotThrow(() => {
        mockIpcMain.on('test-event', (event, data) => {});
      });
    });

    it('should register handlers', () => {
      assert.doesNotThrow(() => {
        mockIpcMain.handle('test-invoke', async (event, data) => {
          return { success: true };
        });
      });
    });

    it('should remove listeners', () => {
      const listener = (event, data) => {};
      mockIpcMain.on('test-event', listener);
      assert.doesNotThrow(() => {
        mockIpcMain.removeListener('test-event', listener);
      });
    });
  });

  describe('createElectronMock', () => {
    it('should create complete electron mock', () => {
      const electron = createElectronMock();

      assert.ok(electron.app);
      assert.ok(electron.BrowserWindow);
      assert.ok(electron.ipcMain);
      assert.ok(electron.ipcRenderer);
      assert.ok(electron.dialog);
      assert.ok(electron.Menu);
      assert.ok(electron.MenuItem);
      assert.ok(electron.Tray);
      assert.ok(electron.Notification);
    });

    it('should create functional BrowserWindow from mock', () => {
      const electron = createElectronMock();
      const window = new electron.BrowserWindow({ width: 800, height: 600 });

      assert.ok(window);
      assert.equal(window.options.width, 800);
    });
  });
});
