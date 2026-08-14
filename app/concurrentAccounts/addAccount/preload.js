const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("addAccountApi", {
  submit: (record) => {
    ipcRenderer.send("account-add-submit", record);
  },
  cancel: () => {
    ipcRenderer.send("account-add-cancel");
  },
  onError: (callback) => {
    ipcRenderer.on("account-add-error", (_event, message) => callback(message));
  },
});
