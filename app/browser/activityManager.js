/* global angular, teamspace */
const TrayIconRenderer = require('./trayIconRenderer');

class ActivityManager {

	constructor(ipc, baseIconPath) {
		this.ipc = ipc;
		this.subscribed = false;
		this.iconRenderer = new TrayIconRenderer(baseIconPath);
	}

	handleNewActivityCountUpdate(count) {
		this.iconRenderer.render(count).then(icon => {
			this.ipc.send('tray-update', {
				icon: icon,
				flash: (count > 0)
			});
		});
	}

	subscribeToNewActivitiyCountUpdate(callback) {
		if (this.subscribed) {
			return;
		}
	
		if (typeof angular === 'undefined') {
			return;
		}
	
		const controller = angular.element(document.documentElement).controller();
		
		if (!controller) {
			return;
		}

		const onChange = () => {
			const count = 
				controller.bellNotificationsService.getNewActivitiesCount() +
				controller.chatListService.getUnreadCountFromChatList();

			callback(count);
		};
	
		controller.eventingService.$on(
			controller.$scope, 
			controller.constants.events.notifications.bellCountUpdated, 
			onChange);
	
		controller.chatListService.safeSubscribe(
			controller.$scope, 
			onChange, 
			teamspace.services.ChatListServiceEvents.EventType_UnreadCount);
	
		this.subscribed = true;

		onChange();
	}

	start() {
		this.ipc.on('page-title', () => {
			this.subscribeToNewActivitiyCountUpdate(count => {
				this.handleNewActivityCountUpdate(count);
			});
		});
	}
}

module.exports = exports = ActivityManager;