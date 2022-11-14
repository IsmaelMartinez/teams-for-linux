const TrayIconRenderer = require('./trayIconRenderer');
const activityHub = require('./activityHub');

class ActivityManager {
	/**
	 * @param {Electron.IpcRenderer} ipcRenderer 
	 * @param {./config} config
	 */
	constructor(ipcRenderer, config) {
		this.ipcRenderer = ipcRenderer;
		this.iconRenderer = new TrayIconRenderer(config.appIcon);
		this.config = config;
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
		activityHub.on('meeting-started', meetingStartNotifyHandler(this));
		activityHub.start();
	}
}

/**
 * @param {ActivityManager} self 
 */
function updateActivityCountHandler(self) {
	return async (data) => {
		self.updateActivityCount(data.count);
	};
}

/**
 * @param {ActivityManager} self 
 */
function disablePowerSaverHandler(self) {
	return async () => {
		self.ipcRenderer.invoke('disable-powersaver');
	};
}

/**
 * @param {ActivityManager} self 
 */
function restorePowerSaverHandler(self) {
	return async () => {
		self.ipcRenderer.invoke('restore-powersaver');
	};
}

/**
 * @param {ActivityManager} self 
 */
// eslint-disable-next-line no-unused-vars
function meetingStartNotifyHandler(self) {
	if (!self.config.disableMeetingNotifications) {
		return async (meeting) => {
			new window.Notification('Meeting has started', {
				type: 'meeting-started', body: meeting.title
			});
		};
	}
	return null;
}

module.exports = exports = ActivityManager;