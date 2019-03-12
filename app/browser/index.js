/* global angular */
(function () {
	const path = require('path');
	const { ipcRenderer } = require('electron');
	const pageTitleNotifications = require('./pageTitleNotifications');
	require('./onlineOfflineListener')();
	require('./rightClickMenuWithSpellcheck');
	require('./zoom')();
	require('./chrome-api');

	const iconPath = path.join(__dirname, '../assets/icons/icon-96x96.png');

	pageTitleNotifications({
		ipc: ipcRenderer,
		iconPath,
	});

	// HACK: changing the userAgent to chrome after 5 seconds to fix the issue of notifications disapearing.
	document.addEventListener(
		'DOMContentLoaded',
		() => {

			setTimeout(() => {
				// Chrome video/audio meeting related
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

				//Disabling promote stuff
				angular.element(document).injector().get('settingsService').appConfig.promoteMobile = false;
				angular.element(document).injector().get('settingsService').appConfig.promoteDesktop = false;
				angular.element(document).injector().get('settingsService').appConfig.hideGetAppButton = true;
				angular.element(document).injector().get('settingsService').appConfig.enableMobileDownloadMailDialog = false;

				angular.element(document).injector().get('settingsService').settingsService.refreshSettings();
				// Future tests can be done in here...
				// angular.element(document).injector().get('settingsService').appConfig.replyBoxFocusAfterNewMessage = true;
				//last I look is enableIncomingVideoUnsupportedUfd groing from down to up.
			}, 3000);
		},
	);
}());
