/* global angular */
(function () {
	const path = require('path');
	const { ipcRenderer } = require('electron');
	const pageTitleNotifications = require('./notifications/pageTitleNotifications');
	const ActivityManager = require('./notifications/activityManager');
	let config;
	ipcRenderer.invoke('getConfig').then(mainConfig => {
		config = mainConfig;
		if (config.onlineOfflineReload) {
			require('./onlineOfflineListener')();
		}
		require('./zoom')(config);

		require('./desktopShare/chromeApi');

		const iconPath = path.join(__dirname, '../assets/icons/icon-96x96.png');

		new ActivityManager(ipcRenderer, iconPath).start();

		if (config.enableDesktopNotificationsHack) {
			pageTitleNotifications(ipcRenderer);
		}

		document.addEventListener('DOMContentLoaded', () => {
			modifyAngularSettingsWithTimeout();
		});
	});

	function disablePromoteStuff(injector) {
		injector.get('settingsService').appConfig.promoteMobile = false;
		injector.get('settingsService').appConfig.promoteDesktop = false;
		injector.get('settingsService').appConfig.hideGetAppButton = true;
		injector.get('settingsService').appConfig.enableMobileDownloadMailDialog = false;
	}

	function modifyAngularSettingsWithTimeout() {
		setTimeout(() => {
			try {
				let injector = angular.element(document).injector();

				if (injector) {
					disablePromoteStuff(injector);

					injector.get('settingsService').settingsService.refreshSettings();
				}
			} catch (error) {
				if (error instanceof ReferenceError) {
					modifyAngularSettingsWithTimeout();
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

