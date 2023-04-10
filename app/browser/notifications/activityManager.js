const TrayIconRenderer = require('../tools/trayIconRenderer');
const activityHub = require('../tools/activityHub');
const wakeLock = require('../tools/wakeLock');

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
		setActivityHandlers(this);
		setEventHandlers(this);
		activityHub.start();
		activityHub.setDefaultTitle(this.config.appTitle);
	}
}

/**
 * @param {ActivityManager} self 
 */
function setActivityHandlers(self) {
	activityHub.on('activities-count-updated', updateActivityCountHandler(self));
	activityHub.on('call-connected', callConnectedHandler(self));
	activityHub.on('call-disconnected', callDisconnectedHandler(self));
	activityHub.on('meeting-started', meetingStartNotifyHandler(self));
}

/**
 * @param {ActivityManager} self 
 */
function setEventHandlers(self) {
	self.ipcRenderer.on('enable-wakelock', () => wakeLock.enable());
	self.ipcRenderer.on('disable-wakelock', () => wakeLock.disable());
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
function callConnectedHandler(self) {
	return async () => {
		self.ipcRenderer.invoke('call-connected');
	};
}

/**
 * @param {ActivityManager} self 
 */
function callDisconnectedHandler(self) {
	return async () => {
		self.ipcRenderer.invoke('call-disconnected');
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