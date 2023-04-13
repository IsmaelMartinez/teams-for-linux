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
		this.myStatus = -1;
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
	activityHub.on('my-status-changed', myStatusChangedHandler(self));
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

/**
 * @param {ActivityManager} self 
 */
// eslint-disable-next-line no-unused-vars
function myStatusChangedHandler(self) {
	return async (event) => {
		if (PresenceState.isAway(event, self)) {
			await evaluateAndPreventAwayStatus(self, event);
		}
	};
}

async function evaluateAndPreventAwayStatus(self, event) {
	const idleTime = await self.ipcRenderer.invoke('getSystemIdleTime');
	console.log(`System Idle: ${idleTime}s`);
	if (idleTime < self.config.appIdleTimeout) {
		console.log(`Trying to prevent changing status to 'away'`);
		activityHub.setMyStatus(1);
		self.myStatus = 1;
	}
}

class PresenceState {
	static isAway(event, self) {
		console.log(`My Status: ${self.myStatus}, Event Status: ${event.data.status}, IsInactive: ${event.isInactive}`);
		const result = this.isInactive(event) && event.data.status !== self.myStatus && self.myStatus !== -1;
		self.myStatus = event.data.status !== self.myStatus ? event.data.status : self.myStatus;
		return result;
	}

	static isInactive(event) {
		return (event.data.status == 3 || event.data.status == 5) && event.isInactive;
	}
}

module.exports = exports = ActivityManager;