import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
	ipcRenderer: {
		send: (channel, data) => {
			let validChannels = ['source-selected'];
			if (validChannels.includes(channel)) {
				ipcRenderer.send(channel, data);
			}
		},
		on: (channel, func) => {
			let validChannels = ['sources-list'];
			if (validChannels.includes(channel)) {
				// Deliberately strip event as it includes `sender`
				ipcRenderer.on(channel, (event, ...args) => func(...args));
			}
		}
	}
});
