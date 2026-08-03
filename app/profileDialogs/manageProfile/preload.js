const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("manageProfileApi", {
  rename: (id, name) =>
    ipcRenderer.invoke("manage-profile-rename", { id, name }),
  pin: (id, pinned) => ipcRenderer.invoke("manage-profile-pin", { id, pinned }),
  remove: (id) => {
    ipcRenderer.send("manage-profile-remove", id);
  },
  close: () => {
    ipcRenderer.send("manage-profile-close");
  },
  onState: (callback) => {
    ipcRenderer.on("manage-profile-state", (_event, state) => callback(state));
  },
  onError: (callback) => {
    ipcRenderer.on("manage-profile-error", (_event, message) =>
      callback(message)
    );
  },
});
