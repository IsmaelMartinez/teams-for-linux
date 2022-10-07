const TrayIconRenderer = require('./trayIconRenderer');
const activityHub = require('./activityHub');

class ActivityManager {
	/**
	 * @param {Electron.IpcRenderer} ipcRenderer 
	 * @param {string} baseIconPath 
	 */
	constructor(ipcRenderer, baseIconPath) {
		this.ipcRenderer = ipcRenderer;
		this.subscribed = false;
		this.iconRenderer = new TrayIconRenderer(baseIconPath);
	}

	updateActivityCount(count) {
		this.iconRenderer.render(count).then(icon => {
			this.ipcRenderer.send('tray-update', {
				icon: icon,
				flash: (count > 0)
			});
		});
	}

	start() {
		activityHub.on('activities-count-updated', (data) => this.updateActivityCount(data.count));
		activityHub.on('call-connected', () => this.ipcRenderer.invoke('disable-screensaver'));
		activityHub.on('call-disconnected', () => this.ipcRenderer.invoke('enable-screensaver'));
		activityHub.start();
	}
}

module.exports = exports = ActivityManager;