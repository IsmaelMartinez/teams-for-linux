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
		{
			label: 'Quit',
			accelerator: 'ctrl+Q',
			click: () => Menus.quit()
		},
		{
			label: 'Quit (Clear Storage)',
			click: () => Menus.quit(true)
		},
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

function getNotificationsMenu(Menus) {
	return {
		label: 'Notifications',
		submenu: [
			{
				label: 'Disable All Notifications',
				type: 'checkbox',
				checked: Menus.configGroup.startupConfig.disableNotifications,
				click: () => Menus.toggleDisableNotifications()
			},
			{
				label: 'Disable Meeting Notifications',
				type: 'checkbox',
				checked: Menus.configGroup.startupConfig.disableMeetingNotifications,
				click: () => Menus.toggleDisableMeetingNotifications()
			},
			{
				label: 'Disable Notifications Sound',
				type: 'checkbox',
				checked: Menus.configGroup.startupConfig.disableNotificationSound,
				click: () => Menus.toggleDisableNotificationSound()
			},
			{
				label: 'Disable Sound when Not Available (e.g: busy, in a call)',
				type: 'checkbox',
				checked: Menus.configGroup.startupConfig.disableNotificationSoundIfNotAvailable,
				click: () => Menus.toggleDisableNotificationSoundIfNotAvailable()
			},
			{
				label: 'Disables Window Flash on New Notifications',
				type: 'checkbox',
				checked: Menus.configGroup.startupConfig.disableNotificationWindowFlash,
				click: () => Menus.toggleDisableNotificationWindowFlash()
			},
			{
				label: 'Urgency',
				submenu:[
					{
						label: 'Low',
						type: 'checkbox',
						checked: Menus.configGroup.startupConfig.defaultNotificationUrgency === 'low',
						click: () => Menus.setNotificationUrgency('low')
					},
					{
						label: 'Normal',
						type: 'checkbox',
						checked: Menus.configGroup.startupConfig.defaultNotificationUrgency === 'normal',
						click: () => Menus.setNotificationUrgency('normal')
					},
					{
						label: 'Critical',
						type: 'checkbox',
						checked: Menus.configGroup.startupConfig.defaultNotificationUrgency === 'critical',
						click: () => Menus.setNotificationUrgency('critical')
					}
				]
			}
		]
	};
}
