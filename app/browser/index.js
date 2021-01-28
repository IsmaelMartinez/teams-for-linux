/* global angular */
(function () {
	const path = require('path');
	const { ipcRenderer, remote } = require('electron');
	const pageTitleNotifications = require('./notifications/pageTitleNotifications');
	const ActivityManager = require('./notifications/activityManager');
	const config = remote.getGlobal('config');

	if (config.onlineOfflineReload) {
		require('./onlineOfflineListener')();
	}
	if (config.rightClickWithSpellcheck) {
		require('./rightClickMenuWithSpellcheck');
	}
	require('./zoom')();

	require('./desktopShare/chromeApi');

	const iconPath = path.join(__dirname, '../assets/icons/icon-96x96.png');

	new ActivityManager(ipcRenderer, iconPath).start();

	if (config.enableDesktopNotificationsHack) {
		pageTitleNotifications(ipcRenderer);
	}

	document.addEventListener('DOMContentLoaded', () => {
		modifyAngularSettingsWithTimeot();
	});

	function disablePromoteStuff(injector) {
		injector.get('settingsService').appConfig.promoteMobile = false;
		injector.get('settingsService').appConfig.promoteDesktop = false;
		injector.get('settingsService').appConfig.hideGetAppButton = true;
		injector.get('settingsService').appConfig.enableMobileDownloadMailDialog = false;
	}

	function modifyAngularSettingsWithTimeot() {
		setTimeout(() => {
			try {
				let injector = angular.element(document).injector();

				if (injector) {
					disablePromoteStuff(injector);

					injector.get('settingsService').settingsService.refreshSettings();
				}
			} catch (error) {
				if (error instanceof ReferenceError) {
					modifyAngularSettingsWithTimeot();
				}
			}
		}, 4000);
	}

	Object.defineProperty(navigator.serviceWorker, 'register', {
		value: () => {
			return Promise.reject();
		}
	});
}());

