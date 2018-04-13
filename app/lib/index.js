'use strict';

const windowStateKeeper = require('electron-window-state');
const path = require('path');
const open = require('open');
const {
  app,
  ipcMain,
  BrowserWindow
} = require('electron');
const configBuilder = require('./config');

const DEFAULT_WINDOW_WIDTH = 800;
const DEFAULT_WINDOW_HEIGHT = 800;

const Menus = require('./menus');

let menus;

function createWindow(iconPath) {
  // Load the previous state with fallback to defaults
  let windowState = windowStateKeeper({
    defaultWidth: DEFAULT_WINDOW_WIDTH,
    defaultHeight: DEFAULT_WINDOW_HEIGHT
  });

  // Create the window
  const window = new BrowserWindow({
    x: windowState.x,
    y: windowState.y,

    width: windowState.width,
    height: windowState.height,

    iconPath,
    autoHideMenuBar: true,

    webPreferences: {
      partition: 'persist:teams',
      preload: path.join(__dirname, 'browser', 'index.js'),
      nodeIntegration: false
    }
  });

  windowState.manage(window);

  return window;
}

app.on('ready', () => {
  const iconPath = path.join(app.getAppPath(), 'lib/assets/icons/icon-96x96.png');
  const window = createWindow(iconPath);
  const config = configBuilder(app.getPath('userData'));

  menus = new Menus(config, iconPath);
  menus.register(window);

  window.on('page-title-updated', (event, title) => window.webContents.send('page-title', title));

  ipcMain.on('nativeNotificationClick', (event) => {
    window.show();
    window.focus();
  });

  window.webContents.on('new-window', (event, url) => {
    event.preventDefault();
    open(url, (err) => {
      if (err) {
        console.error(`exec error: ${err.message}`);
      }
    });
  });

  if (config.userAgent === 'edge') {
    window.webContents.setUserAgent(config.edgeUserAgent);
  } else {
    window.webContents.setUserAgent(config.chromeUserAgent);
  }
  
  window.loadURL(config.url);

  if (config.webDebug) {
    window.openDevTools();
  }
});

app.on('login', function (event, webContents, request, authInfo, callback) {
  event.preventDefault();
  if (typeof config.firewallUsername !== 'undefined') {
    callback(config.firewallUsername, config.firewallPassword);
  }
});