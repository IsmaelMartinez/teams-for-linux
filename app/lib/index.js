'use strict';

const windowStateKeeper = require('electron-window-state');
const path = require('path');
//const open = require('opn');
const { shell, app, ipcMain, BrowserWindow } = require('electron');
const configBuilder = require('./config');
// const querystring = require('querystring');

const DEFAULT_WINDOW_WIDTH = 1024;
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

    show: false,
    iconPath,
    autoHideMenuBar: false,


    webPreferences: {
      partition: 'persist:teams',
      preload: path.join(__dirname, 'browser', 'index.js'),
      nativeWindowOpen: true,
      allowRunningInsecureContent: true,
      experimentalFeatures: true,
      safeDialogs: true,
      plugins: true,
      nodeIntegration: false,
    }
  });

  windowState.manage(window);

  return window;
}

app.commandLine.appendSwitch('auth-server-whitelist','*');
app.commandLine.appendSwitch('auth-negotiate-delegate-whitelist','*');
app.commandLine.appendSwitch('enable-ntlm-v2','*');

app.on('ready', () => {

  const iconPath = path.join(
    app.getAppPath(),
    'lib/assets/icons/icon-96x96.png'
  );
  const window = createWindow(iconPath);
  const config = configBuilder(app.getPath('userData'));

  menus = new Menus(config, iconPath);
  menus.register(window);

  window.on('page-title-updated', (event, title) =>
    window.webContents.send('page-title', title)
  );

  ipcMain.on('nativeNotificationClick', event => {
    window.show();
    window.focus();
  });

  window.webContents.on('new-window', (event, url) => {
    event.preventDefault();
    shell.openExternal(url);
  });

  window.webContents.on('login', (event, request, authInfo, callback) => {
    // event.preventDefault();
    // let child = new BrowserWindow(
    //   {
    //     modal: true,
    //     width: 400,
    //     heigth: 100,
    //     useContentSize: true,
    //     center: true,
    //     alwaysOnTop: true,
    //     parent: window.webContents.BrowserWindow,
    //     resizable: false,
    //     frame: false
    //   });

    // const qs = querystring.stringify({
    //   port: authInfo.port,
    //   realm: authInfo.realm
    // });

    // child.loadURL(request.url);
    // child.show();
    console.log(request.url)
  });

  window.webContents.on('will-navigate', (event, url) => {
    console.log(url);
  });

  window.webContents.on('did-get-redirect-request', (event, oldUrl, newUrl) => {
    console.log(newUrl);
  });

  if (config.userAgent === 'edge') {
    window.webContents.setUserAgent(config.edgeUserAgent);
  } else {
    window.webContents.setUserAgent(config.chromeUserAgent);
  }

  window.once('ready-to-show', () => window.show());

  window.loadURL(config.url);

  //if (config.webDebug) {
  //  window.openDevTools();
  //}
});

app.on('login', function (event, webContents, request, authInfo, callback) {
  //event.preventDefault();
  // let child = new BrowserWindow(
  //   {
  //     modal: true,
  //     width: 400,
  //     heigth: 100,
  //     useContentSize: true,
  //     center: true,
  //     alwaysOnTop: true,
  //     parent: webContents.BrowserWindow,
  //     resizable: false,
  //     frame: false
  //   });

  // const qs = querystring.stringify({
  //   port: authInfo.port,
  //   realm: authInfo.realm
  // });

  // child.loadURL(`file://${__dirname}/login.html?${qs}`)
  // child.show()
  if (typeof config !== 'undefined' && typeof config.firewallUsername !== 'undefined') {
    callback(config.firewallUsername, config.firewallPassword);
  }
});
