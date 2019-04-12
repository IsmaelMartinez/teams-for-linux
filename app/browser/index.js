/* global angular */
(function () {
	const path = require('path');
	const { ipcRenderer } = require('electron');
	const pageTitleNotifications = require('./notifications/pageTitleNotifications');
	const ActivityManager = require('./notifications/activityManager');
	
	require('./onlineOfflineListener')();
	require('./rightClickMenuWithSpellcheck');
	require('./zoom')();
	require('./desktopShare/chromeApi');

	const iconPath = path.join(__dirname, '../assets/icons/icon-96x96.png');

	new ActivityManager(ipcRenderer, iconPath).start();

	pageTitleNotifications(ipcRenderer);

	document.addEventListener(
		'DOMContentLoaded',
		() => {

			setTimeout(() => {
				let injector = angular.element(document).injector();

				if(injector) {
					enableChromeVideoAudioMeetings(injector);
					disablePromoteStuff(injector);
					
					injector.get('settingsService').settingsService.refreshSettings();
					
				}
				// Future tests can be done in here...
				// angular.element(document).injector().get('settingsService').appConfig.replyBoxFocusAfterNewMessage = true;
				//last I look is enableIncomingVideoUnsupportedUfd groing from down to up.
			}, 3000);
		},
	);

	function enableChromeVideoAudioMeetings(injector) {
		injector.get('callingSupportService').oneOnOneCallingEnabled = true;
		injector.get('callingSupportService').isChromeMeetingSingleVideoEnabled = true;
		injector.get('callingSupportService').isChromeVideoOneOnOneEnabled = true;
		injector.get('callingSupportService').isChromeVideoMultipartyEnabled = true;
		injector.get('settingsService').appConfig.enableCallingChromeOneOnOne = true;
		injector.get('settingsService').appConfig.callingEnableChromeMeetingSingleVideo = true;
		injector.get('settingsService').appConfig.callingEnableChromeMultipartyVideo = true;
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
	}

	function disablePromoteStuff(injector) {
		injector.get('settingsService').appConfig.promoteMobile = false;
		injector.get('settingsService').appConfig.promoteDesktop = false;
		injector.get('settingsService').appConfig.hideGetAppButton = true;
		injector.get('settingsService').appConfig.enableMobileDownloadMailDialog = false;
	}
}());
