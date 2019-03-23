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
				enableChromeVideoAudioMeetings();
				disablePromoteStuff();
				
				angular.element(document).injector().get('settingsService').settingsService.refreshSettings();
				// Future tests can be done in here...
				// angular.element(document).injector().get('settingsService').appConfig.replyBoxFocusAfterNewMessage = true;
				//last I look is enableIncomingVideoUnsupportedUfd groing from down to up.
			}, 3000);
		},
	);

	function enableChromeVideoAudioMeetings() {
		angular.element(document).injector().get('callingSupportService').oneOnOneCallingEnabled = true;
		angular.element(document).injector().get('callingSupportService').isChromeMeetingSingleVideoEnabled = true;
		angular.element(document).injector().get('callingSupportService').isChromeVideoOneOnOneEnabled = true;
		angular.element(document).injector().get('callingSupportService').isChromeVideoMultipartyEnabled = true;
		angular.element(document).injector().get('settingsService').appConfig.enableCallingChromeOneOnOne = true;
		angular.element(document).injector().get('settingsService').appConfig.callingEnableChromeMeetingSingleVideo = true;
		angular.element(document).injector().get('settingsService').appConfig.callingEnableChromeMultipartyVideo = true;
		angular.element(document).injector().get('settingsService').appConfig.enableChromeScreenSharing = true;
		angular.element(document).injector().get('settingsService').appConfig.enableAddToChatButtonForMeetings = true;
		angular.element(document).injector().get('settingsService').appConfig.enableSharingOnlyCallChrome = true;
		angular.element(document).injector().get('settingsService').appConfig.enableScreenSharingToolbar = true;
		angular.element(document).injector().get('settingsService').appConfig.enableCallingScreenPreviewLabel = true;
		angular.element(document).injector().get('settingsService').appConfig.callingEnableChromeOneToOneVideo = true;
	}

	function disablePromoteStuff() {
		angular.element(document).injector().get('settingsService').appConfig.promoteMobile = false;
		angular.element(document).injector().get('settingsService').appConfig.promoteDesktop = false;
		angular.element(document).injector().get('settingsService').appConfig.hideGetAppButton = true;
		angular.element(document).injector().get('settingsService').appConfig.enableMobileDownloadMailDialog = false;
	}
}());
