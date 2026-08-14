const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("manageAccountsApi", {
  rename: (id, name) =>
    ipcRenderer.invoke("account-manage-rename", { id, name }),
  open: (id) => {
    ipcRenderer.send("account-manage-open", id);
  },
  remove: (id) => {
    ipcRenderer.send("account-manage-remove", id);
  },
  close: () => {
    ipcRenderer.send("account-manage-close");
  },
  onState: (callback) => {
    ipcRenderer.on("account-manage-state", (_event, state) => callback(state));
  },
  onError: (callback) => {
    ipcRenderer.on("account-manage-error", (_event, message) =>
      callback(message)
    );
  },
});
