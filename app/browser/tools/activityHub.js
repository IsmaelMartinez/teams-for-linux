const ReactHandler = require('./reactHandler');
const eventHandlers = [];

// Supported events
const supportedEvents = [
	'incoming-call-created',
	'incoming-call-connecting',
	'incoming-call-disconnecting',
	'call-connected',
	'call-disconnected',
	'activities-count-updated',
	'meeting-started',
	'my-status-changed'
];

class ActivityHub {
	on(event, handler) {
		return addEventHandler(event, handler);
	}

	off(event, handle) {
		return removeEventHandler(event, handle);
	}

	setMachineState(state) {
		const teams2IdleTracker = ReactHandler.getTeams2IdleTracker();
		if (teams2IdleTracker) {
			try {
				console.debug(`setMachineState teams2 state=${state}`);
				if (state === 1) {
					teams2IdleTracker.handleMonitoredWindowEvent();
				} else {
					teams2IdleTracker.transitionToIdle();
				}
			} catch (e) {
				console.error('Failed to set teams2 Machine State', e);
			}
		}
	}

	setUserStatus(status) {
		const teams2IdleTracker = ReactHandler.getTeams2IdleTracker();
		if (teams2IdleTracker) {
			try {
				console.debug(`setUserStatus teams2 status=${status}`);
				if (status === 1) {
					teams2IdleTracker.handleMonitoredWindowEvent();
				} else {
					teams2IdleTracker.transitionToIdle();
				}
			} catch (e) {
				console.error('Failed to set teams2 User Status', e);
			}
		}
	}

	refreshAppState(controller, state) {
		const self = controller.appStateService;
		controller.appStateService.refreshAppState.apply(self, [() => {
			self.inactiveStartTime = null;
			self.setMachineState(state);
			self.setActive(state == 1 && (self.current == 4 || self.current == 5) ? 3 : self.current);
		}, '', null, null]);
	}
}

function isSupportedEvent(event) {
	return supportedEvents.some(e => {
		return e === event;
	});
}

function isFunction(func) {
	return typeof (func) === 'function';
}

function getHandleIndex(event, handle) {
	return eventHandlers.findIndex(h => {
		return h.event === event && h.handle === handle;
	});
}

function addEventHandler(event, handler) {
	let handle;
	if (isSupportedEvent(event) && isFunction(handler)) {
		handle = Math.ceil(Math.random() * 100000);
		eventHandlers.push({
			event: event,
			handle: handle,
			handler: handler
		});
	}
	return handle;
}

function removeEventHandler(event, handle) {
	const handlerIndex = getHandleIndex(event, handle);
	if (handlerIndex > -1) {
		eventHandlers[handlerIndex].handler = null;
		eventHandlers.splice(handlerIndex, 1);
		return handle;
	}

	return null;
}

const activityHub = new ActivityHub();
module.exports = activityHub;