
const electron = require('electron');

const app = electron.app;

app.on('ready', () => {
  const window = new electron.BrowserWindow({
    width: 800,
    height: 600,

    webPreferences: {
      partition: 'persist:teams',
      nodeIntegration: false
    }
  });
  window.webContents.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/55.0.2883.87 Safari/537.36');
  window.loadURL('https://teams.microsoft.com/');
});
