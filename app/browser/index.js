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

	document.addEventListener('DOMContentLoaded',() => {
		modifyAngularSettingsWithTimeot();
	});

	function modifyAngularSettingsWithTimeot() {
		setTimeout(() => {
			try {
				let injector = angular.element(document).injector();

				if(injector) {
					enableChromeVideoAudioMeetings(injector);
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

	function enableChromeVideoAudioMeetings(injector) {
		injector.get('callingSupportService').oneOnOneCallingEnabled = true;
		injector.get('callingSupportService').isDesktopApp	 = true;
		injector.get('callingSupportService').isChromeMeetingSingleVideoEnabled = true;
		injector.get('callingSupportService').isChromeVideoOneOnOneEnabled = true;
		injector.get('callingSupportService').isChromeVideoMultipartyEnabled = true;
		injector.get('settingsService').appConfig.angularDebugInfoEnabled = true;
		injector.get('settingsService').appConfig.enableCallingChromeOneOnOne = true;
		injector.get('settingsService').appConfig.callingEnableChromeMeetingSingleVideo = true;
		injector.get('settingsService').appConfig.callingEnableChromeMultipartyVideo = true;
		injector.get('settingsService').appConfig.callingEnabledLinux = true;
		injector.get('settingsService').appConfig.enableChromeScreenSharing = true;
		injector.get('settingsService').appConfig.enableAddToChatButtonForMeetings = true;
		injector.get('settingsService').appConfig.enableSharingOnlyCallChrome = true;
		injector.get('settingsService').appConfig.enableScreenSharingToolbar = true;
		injector.get('settingsService').appConfig.enableCallingScreenPreviewLabel = true;
		injector.get('settingsService').appConfig.callingEnableChromeOneToOneVideo = true;
		injector.get('settingsService').appConfig.enableMeetingStartedNotificationWeb = true;
		injector.get('settingsService').appConfig.enableMicOSUnmuteOnUnmute = true;
		injector.get('settingsService').appConfig.enableModeratorsSupport = true;
		injector.get('settingsService').appConfig.enableRecordPPTSharing = true;
		injector.get('settingsService').appConfig.enable3x3VideoLayout = true;
		injector.get('settingsService').appConfig.enableCallTranscript = true;
		injector.get('settingsService').appConfig.enableCallTransferredScreen = true;
		injector.get('settingsService').appConfig.enableCameraSharing = true;
		injector.get('settingsService').appConfig.enableEdgeScreenSharing = true;
		injector.get('settingsService').appConfig.enableSeeMyScreenshare = true;
		injector.get('settingsService').appConfig.enableSmartReplies = true;
		injector.get('settingsService').appConfig.enableSms = true;
		injector.get('settingsService').appConfig.enableTestCallForAll = true;
		injector.get('settingsService').appConfig.enableUnreadMessagesButton = true;
		injector.get('settingsService').appConfig.enableVideoBackground = true;
		injector.get('settingsService').appConfig.disableCallingOnlineCheck = false;
	}

	function disablePromoteStuff(injector) {
		injector.get('settingsService').appConfig.promoteMobile = false;
		injector.get('settingsService').appConfig.promoteDesktop = false;
		injector.get('settingsService').appConfig.hideGetAppButton = true;
		injector.get('settingsService').appConfig.enableMobileDownloadMailDialog = false;
	}
	Object.defineProperty(navigator.serviceWorker, 'register', {
		value: () => {
			return Promise.reject()
		}
	});
}());

