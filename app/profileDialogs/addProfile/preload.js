const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("addProfileApi", {
  submit: (record) => {
    ipcRenderer.send("add-profile-submit", record);
  },
  cancel: () => {
    ipcRenderer.send("add-profile-cancel");
  },
  onError: (callback) => {
    ipcRenderer.on("add-profile-error", (_event, message) => callback(message));
  },
});
