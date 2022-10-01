const TrayIconRenderer = require('./trayIconRenderer');
const activityHub = require('./activityHub');

class ActivityManager {
	constructor(ipc, baseIconPath) {
		this.ipc = ipc;
		this.subscribed = false;
		this.iconRenderer = new TrayIconRenderer(baseIconPath);
	}

	updateActivityCount(count) {
		this.iconRenderer.render(count).then(icon => {
			this.ipc.send('tray-update', {
				icon: icon,
				flash: (count > 0)
			});
		});
	}

	start() {
		activityHub.on('activities-count-updated', (data) => this.updateActivityCount(data.count));
		activityHub.start();
	}
}

module.exports = exports = ActivityManager;