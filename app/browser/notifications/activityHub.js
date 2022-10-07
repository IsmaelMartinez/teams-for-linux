/**
 * @type {Array<{handler:(data)=>void,event:string,handle:number}>}
 */
const eventHandlers = [];

// Supported events
const supportedEvents = [
	'call-connected',
	'call-disconnected',
	'activities-count-updated'
];

class ActivityHub {
	constructor() {
	}

	/**
	 * @param {'call-connected'|'call-disconnected'|'activities-count-updated'} event 
	 * @param {(data)=>void} handler
	 * @returns {number} handle 
	 */
	on(event, handler) {
		return addEventHandler(event, handler);
	}

	/**
	 * @param {'call-connected'|'call-disconnected'|'activities-count-updated'} event 
	 * @param {number} handle
	 * @returns {number} handle 
	 */
	off(event, handle) {
		return removeEventHandler(event, handle);
	}

	start() {
		whenControllerReady(assignEventHandlers);
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

/**
 * 
 * @param {'call-connected'|'call-disconnected'|'activities-count-updated'} event 
 * @returns {Array<{handler:(data)=>void,event:string,handle:number}>} handlers
 */
function getEventHandlers(event) {
	return eventHandlers.filter(e => {
		return e.event === event;
	});
}

/**
 * @param {(controller)=>void} callback 
 */
function whenControllerReady(callback) {
	const controller = typeof window.angular !== 'undefined' ? window.angular.element(document.documentElement).controller() : null;
	if (controller) {
		callback(controller);
	} else {
		setTimeout(() => whenControllerReady(callback), 4000);
	}
}

function assignEventHandlers(controller) {
	assignActivitiesCountUpdateHandler(controller);
	assignCallConnectedHandler(controller);
	assignCallDisconnectedHandler(controller);
}

function assignActivitiesCountUpdateHandler(controller) {
	controller.eventingService.$on(
		controller.$scope,
		controller.constants.events.notifications.bellCountUpdated,
		() => onActivitiesCountUpdated(controller));

	controller.chatListService.safeSubscribe(
		controller.$scope,
		() => onActivitiesCountUpdated(controller),
		window.teamspace.services.ChatListServiceEvents.EventType_UnreadCount);
	onActivitiesCountUpdated(controller);
}

function onActivitiesCountUpdated(controller) {
	const count = controller.bellNotificationsService.getNewActivitiesCount() + controller.chatListService.getUnreadCountFromChatList();
	const handlers = getEventHandlers('activities-count-updated');
	for (const handler of handlers) {
		handler.handler({ count: count });
	}
}

function assignCallConnectedHandler(controller) {
	controller.eventingService.$on(
		controller.$scope,
		controller.constants.events.calling.callConnected,
		() => onCallConnected(controller));
}

function onCallConnected() {
	const handlers = getEventHandlers('call-connected');
	for (const handler of handlers) {
		handler.handler({});
	}
}

function assignCallDisconnectedHandler(controller) {
	controller.eventingService.$on(
		controller.$scope,
		controller.constants.events.calling.callDisposed,
		() => onCallDisconnected(controller));
}

function onCallDisconnected() {
	const handlers = getEventHandlers('call-disconnected');
	for (const handler of handlers) {
		handler.handler({});
	}
}

const activityHub = new ActivityHub();
module.exports = activityHub;