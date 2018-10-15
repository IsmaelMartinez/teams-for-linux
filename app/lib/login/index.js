'use strict';
const { ipcMain, BrowserWindow } = require('electron');

exports.loginService = function loginService(callback) {
  var win = new BrowserWindow({
    width: 363,
    height: 124,
    frame: false,

    show: false,
    autoHideMenuBar: true,
  });

  win.once('ready-to-show', () => {
    win.show();
  });

  ipcMain.on('submitForm', function (event, data) {
    console.log('submitForm called', data);
    callback(data.username, data.password);
    win.close();
  });

  win.on('closed', () => win = null);

  win.openDevTools();
  win.loadURL(`file://${__dirname}/login.html`);
}