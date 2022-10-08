const TrayIconRenderer = require('./trayIconRenderer');
const activityHub = require('./activityHub');

class ActivityManager {
	/**
	 * @param {Electron.IpcRenderer} ipcRenderer 
	 * @param {string} baseIconPath 
	 */
	constructor(ipcRenderer, baseIconPath) {
		this.ipcRenderer = ipcRenderer;
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
		activityHub.on('activities-count-updated', updateActivityCountHandler(this));
		activityHub.on('call-connected', disablePowerSaverHandler(this));
		activityHub.on('call-disconnected', restorePowerSaverHandler(this));
		activityHub.start();
	}
}

/**
 * @param {ActivityManager} self 
 */
function updateActivityCountHandler(self) {
	return (data) => {
		self.updateActivityCount(data.count);
	};
}

/**
 * @param {ActivityManager} self 
 */
function disablePowerSaverHandler(self) {
	return () => {
		self.ipcRenderer.invoke('disable-powersaver');
	};
}

/**
 * @param {ActivityManager} self 
 */
function restorePowerSaverHandler(self) {
	return () => {
		self.ipcRenderer.invoke('restore-powersaver');
	};
}

module.exports = exports = ActivityManager;