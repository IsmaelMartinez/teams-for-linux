const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('chrome', {
  runtime: {},
  desktopCapture: {
    chooseDesktopMedia: (sources, cb) => {
      ipcRenderer
        .invoke('choose-desktop-media', sources)
        .then(streamId => cb(streamId));
      return Date.now();
    },
    cancelChooseDesktopMedia: () =>
      ipcRenderer.send('cancel-desktop-media')
  }
});