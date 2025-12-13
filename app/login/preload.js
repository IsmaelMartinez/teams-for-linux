import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("api", {
	submitForm: (args) => {
		ipcRenderer.send("submitForm", args);
	},
});
