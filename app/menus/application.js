exports = module.exports = (Menus) => ({
	label: 'Application',
	submenu: [
		{
			label: 'Open',
			accelerator: 'ctrl+O',
			click: () => Menus.open(),
		},
		{
			label: 'Refresh',
			accelerator: 'ctrl+R',
			click: () => Menus.reload(),
		},
		{
			label: 'Hide',
			accelerator: 'ctrl+H',
			click: () => Menus.hide(),
		},
		{
			label: 'Debug',
			accelerator: 'ctrl+D',
			click: () => Menus.debug(),
		},
		{
			type: 'separator',
		},
		getSettingsMenu(Menus),
		getNotificationsMenu(Menus),
		{
			type: 'separator',
		},
		getQuitMenu(Menus),
		{
			type: 'separator',
		},
		{
			label: 'About',
			click: () => Menus.about(),
		}
	],
});

function getSettingsMenu(Menus) {
	return {
		label: 'Settings',
		submenu: [
			{
				label: 'Save',
				click: () => Menus.saveSettings()
			},
			{
				label: 'Restore',
				click: () => Menus.restoreSettings()
			}
		]
	};
}

function getQuitMenu(Menus) {
	return {
		label: 'Quit',
		submenu: [
			{
				label: 'Normally',
				accelerator: 'ctrl+Q',
				click: () => Menus.quit()
			},
			{
				label: 'Clear Storage',
				click: () => Menus.quit(true)
			}
		]
	};
}

function getNotificationsMenu(Menus) {
	return {
		label: 'Notifications',
		submenu: [
			{
				label: 'Disable All Notifications',
				type: 'checkbox',
				checked: Menus.config.disableNotifications,
				click: () => Menus.config.disableNotifications = !Menus.config.disableNotifications
			},
			{
				label: 'Disable Meeting Notifications',
				type: 'checkbox',
				checked: Menus.config.disableMeetingNotifications,
				click: () => Menus.config.disableMeetingNotifications = !Menus.config.disableMeetingNotifications
			},
			{
				label: 'Disable Notifications Sound',
				type: 'checkbox',
				checked: Menus.config.disableNotificationSound,
				click: () => Menus.config.disableNotificationSound = !Menus.config.disableNotificationSound
			},
			{
				label: 'Disable Sound when Not Available (e.g: busy, in a call)',
				type: 'checkbox',
				checked: Menus.config.disableNotificationSoundIfNotAvailable,
				click: () => Menus.config.disableNotificationSoundIfNotAvailable = !Menus.config.disableNotificationSoundIfNotAvailable
			},
			{
				label: 'Disables Window Flash on New Notifications',
				type: 'checkbox',
				checked: Menus.config.disableNotificationWindowFlash,
				click: () => Menus.config.disableNotificationWindowFlash = !Menus.config.disableNotificationWindowFlash
			}
		]
	};
}