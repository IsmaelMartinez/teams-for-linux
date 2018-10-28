'use strict';
const windowStateKeeper = require('electron-window-state');
const path = require('path');
const { shell, app, ipcMain, BrowserWindow } = require('electron');
const login = require('./login');
const NativeNotification = require('electron-native-notification');
const Menus = require('./menus');
const configBuilder = require('./config');

function createWindow(part, iconPath) {
  // Load the previous state with fallback to defaults
  let windowState = windowStateKeeper({
    defaultWidth: 0,
    defaultHeight: 0
  });

  // Create the window
  const window = new BrowserWindow({
    x: windowState.x,
    y: windowState.y,

    width: windowState.width,
    height: windowState.height,

    show: false,
    iconPath,
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'assets', 'icons', 'icon-96x96.png'),

    webPreferences: {
      partition: part,
      preload: path.join(__dirname, 'browser', 'index.js'),
      nativeWindowOpen: true,
      plugins: true,
      nodeIntegration: false
    }
  });

  windowState.manage(window);
  window.eval = global.eval = function () {
    throw new Error(`Sorry, this app does not support window.eval().`)
  }

  return window;
}

app.commandLine.appendSwitch('auth-server-whitelist', '*');
app.commandLine.appendSwitch('enable-ntlm-v2', 'true');

app.on('ready', () => {
  const iconPath = path.join(
    app.getAppPath(),
    'lib/assets/icons/icon-96x96.png'
  );
  let isFirstLoginTry = true;
  const config = configBuilder(app.getPath('userData'));
  var window = createWindow(config.partition, iconPath);
  let menus = new Menus(config, iconPath);
  menus.register(window);

  window.on('page-title-updated', (event, title) => {
    window.webContents.send('page-title', title)
  });

  ipcMain.on('notifications', async (e, msg) => {
    if (msg.count > 0) {
      const body = "(" + msg.count + ")" + ((msg.text) ? ": " + msg.text : "");
      const notification = new NativeNotification(
        "Microsoft Teams",
        {
          "body": body,
          "icon": iconPath,
        });
      if (notification.show !== undefined) {
        notification.show();
      }
    }
  });

  window.webContents.on('new-window', (event, url) => {
    event.preventDefault();
    shell.openExternal(url);
  });

  window.webContents.on('login', (event, request, authInfo, callback) => {
    event.preventDefault();
    if (isFirstLoginTry) {
      isFirstLoginTry = false;
      login.loginService(window, callback);
    } else {
      isFirstLoginTry = true;
      app.relaunch();
      app.exit(0);
    }
  });

  if (config.userAgent === 'edge') {
    window.webContents.setUserAgent(config.edgeUserAgent);
  } else {
    window.webContents.setUserAgent(config.chromeUserAgent);
  }

  window.once('ready-to-show', () => window.show());

  window.webContents.on('did-finish-load', function () {
    window.webContents.insertCSS('#download-mobile-app-button, #download-app-button, #get-app-button { display:none; }');
    window.webContents.insertCSS('.zoetrope { animation-iteration-count: 1 !important; }');
  });

  window.on('closed', () => window = null);

  window.loadURL(config.url);

  if (config.webDebug) {
    window.openDevTools();
  }
});
