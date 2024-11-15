const {
    contextBridge,
    ipcRenderer
} = require("electron");

contextBridge.exposeInMainWorld(
    "api", {
        submitForm: (args) => {
            ipcRenderer.send('submitForm', args);
        },
    },
);
