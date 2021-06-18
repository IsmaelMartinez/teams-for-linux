const { ipcRenderer } = require("electron")
// In order to have this functionality working, contextIsolation should be disabled.
// In new versions of electron, contextIsolation is set to true by default.
// We should explicitly set it to false when creating BrowserWindow
window.addEventListener("DOMContentLoaded", () => {
  MediaDevices.prototype.getDisplayMedia = () => {
    return new Promise((resolve, reject) => {
      // Request main process to allow access to screen sharing
      ipcRenderer.once('select-source', (event, sourceId) => {
        if (sourceId) {
          navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              mandatory: {
                chromeMediaSource: 'desktop',
                chromeMediaSourceId: sourceId,
                minWidth: 1280,
                maxWidth: 1280,
                minHeight: 720,
                maxHeight: 720
              }
            }
          }).then(stream => {
            resolve(stream);
          }).catch(e => {
            console.log(e.message);
            reject(e.message);
          })
        } else {
          reject('Access denied');
        }
      });

      ipcRenderer.send('select-source');
    });
  };
});