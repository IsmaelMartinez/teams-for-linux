const activityHub = require('../tools/activityHub');
const wakeLock = require('../tools/wakeLock');

class ActivityManager {
	constructor(ipcRenderer, config) {
		this.ipcRenderer = ipcRenderer;
		this.config = config;
		this.myStatus = -1;
	}

	start() {
		setActivityHandlers(this);
		setEventHandlers(this);
		activityHub.start();
		activityHub.setDefaultTitle(this.config.appTitle);
		this.watchSystemIdleState();
	}

	watchSystemIdleState() {
		const self = this;
		self.ipcRenderer.invoke('get-system-idle-state').then((state) => {
			let timeOut;
			if (this.config.awayOnSystemIdle) {
				/*
					Same logic as before: 
						awayOnSystemIdle = true, sets status "Away" when screen is locked.
				*/
				activityHub.setMachineState(state.system === 'active' ? 1 : 2);
				timeOut = (state.system === 'active' ? self.config.appIdleTimeoutCheckInterval : self.config.appActiveCheckInterval) * 1000;

				if (state.system === 'active' && state.userIdle === 1) {
					activityHub.setUserStatus(1);
				} else if (state.system !== 'active' && state.userCurrent === 1) {
					activityHub.setUserStatus(3);
				}
			} else {
				/*
					Handle screen locked: 
						awayOnSystemIdle = false, keeps status "Available" when locking the screen.
				*/
				if ((state.system === 'active') || (state.system === 'locked')) {
					activityHub.setMachineState(1);
					timeOut = self.config.appIdleTimeoutCheckInterval * 1000;
				} else {
					activityHub.setMachineState(2);
					timeOut = self.config.appActiveCheckInterval * 1000;
				}			
			}

			setTimeout(() => self.watchSystemIdleState(), timeOut);
		});
	}
}

function setActivityHandlers(self) {
	activityHub.on('activities-count-updated', updateActivityCountHandler());
	activityHub.on('incoming-call-created', incomingCallCreatedHandler(self));
	activityHub.on('incoming-call-connecting', incomingCallConnectingHandler(self));
	activityHub.on('incoming-call-disconnecting', incomingCallDisconnectingHandler(self));
	activityHub.on('call-connected', callConnectedHandler(self));
	activityHub.on('call-disconnected', callDisconnectedHandler(self));
	activityHub.on('meeting-started', meetingStartNotifyHandler(self));
	activityHub.on('my-status-changed', myStatusChangedHandler(self));
}

function setEventHandlers(self) {
	self.ipcRenderer.on('enable-wakelock', () => wakeLock.enable());
	self.ipcRenderer.on('disable-wakelock', () => wakeLock.disable());
}

function updateActivityCountHandler() {
	return async (data) => {
		const event = new CustomEvent('unread-count', { detail: { number: data.count } });
		window.dispatchEvent(event);
	};
}

function incomingCallCreatedHandler(self) {
	return async (data) => {
		self.ipcRenderer.invoke('incoming-call-created', data);
	};
}

function incomingCallConnectingHandler(self) {
	return async () => {
		self.ipcRenderer.invoke('incoming-call-connecting');
	};
}

function incomingCallDisconnectingHandler(self) {
	return async () => {
		self.ipcRenderer.invoke('incoming-call-disconnecting');
	};
}

function callConnectedHandler(self) {
	return async () => {
		self.ipcRenderer.invoke('call-connected');
	};
}

function callDisconnectedHandler(self) {
	return async () => {
		self.ipcRenderer.invoke('call-disconnected');
	};
}

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

// eslint-disable-next-line no-unused-vars
function myStatusChangedHandler(self) {
	// eslint-disable-next-line no-unused-vars
	return async (event) => {
		self.ipcRenderer.invoke('user-status-changed', { data: event.data });
	};
}

module.exports = exports = ActivityManager;
