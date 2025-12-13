import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('notificationApi', {
	onNotificationToastInit: (callback) => {
		ipcRenderer.on('notification-toast-init', (event, data) => {
			if (typeof callback === 'function') {
				callback(data);
			}
		});
	},

	notifyClick: () => {
		ipcRenderer.send('notification-toast-click');
	},
});
