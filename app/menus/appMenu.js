/**
 * Create the application menu template
 * @param {Menus} menus - The Menus instance
 * @returns {Object} The menu template
 */
function appMenu(menus) {
	const config = menus.configGroup.startupConfig;

	const template = {
		label: "Application",
		submenu: [
			{
				label: "Open",
				click: () => menus.open(),
			},
			{
				label: "Reload",
				click: () => menus.reload(),
			},
			{
				label: "Hide",
				click: () => menus.hide(),
			},
			{ type: "separator" },
			{
				label: "Join Meeting",
				click: () => menus.joinMeeting(),
			},
			{ type: "separator" },
			{
				label: "Notifications",
				submenu: [
					{
						label: "Disable Notifications",
						type: "checkbox",
						checked: config.disableNotifications,
						click: () => menus.toggleDisableNotifications(),
					},
					{
						label: "Disable Notification Sound",
						type: "checkbox",
						checked: config.disableNotificationSound,
						click: () => menus.toggleDisableNotificationSound(),
					},
					{
						label: "Disable Sound If Not Available",
						type: "checkbox",
						checked: config.disableNotificationSoundIfNotAvailable,
						click: () => menus.toggleDisableNotificationSoundIfNotAvailable(),
					},
					{
						label: "Disable Window Flash",
						type: "checkbox",
						checked: config.disableNotificationWindowFlash,
						click: () => menus.toggleDisableNotificationWindowFlash(),
					},
					{
						label: "Disable Badge Count",
						type: "checkbox",
						checked: config.disableBadgeCount,
						click: () => menus.toggleDisableBadgeCount(),
					},
					{ type: "separator" },
					{
						label: "Urgency",
						submenu: [
							{
								label: "Low",
								type: "radio",
								checked: config.defaultNotificationUrgency === "low",
								click: () => menus.setNotificationUrgency("low"),
							},
							{
								label: "Normal",
								type: "radio",
								checked: config.defaultNotificationUrgency === "normal",
								click: () => menus.setNotificationUrgency("normal"),
							},
							{
								label: "Critical",
								type: "radio",
								checked: config.defaultNotificationUrgency === "critical",
								click: () => menus.setNotificationUrgency("critical"),
							},
						],
					},
				],
			},
			{ type: "separator" },
			{
				label: "Settings",
				submenu: [
					{
						label: "Save Settings",
						click: () => menus.saveSettings(),
					},
					{
						label: "Restore Settings",
						click: () => menus.restoreSettings(),
					},
				],
			},
			{ type: "separator" },
		],
	};

	// Add video menu if enabled
	if (config.videoMenu) {
		template.submenu.push({
			label: "Video",
			submenu: [
				{
					label: "Force Picture-in-Picture",
					click: () => menus.forcePip(),
				},
				{
					label: "Toggle Video Controls",
					click: () => menus.forceVideoControls(),
				},
			],
		});
		template.submenu.push({ type: "separator" });
	}

	// Add help submenu
	template.submenu.push({
		label: "Help",
		submenu: [
			{
				label: "Documentation",
				click: () => menus.showDocumentation(),
			},
			{
				label: "GPU Info",
				click: () => menus.showGpuInfo(),
			},
			{
				label: "Debug",
				click: () => menus.debug(),
			},
			{
				label: "About",
				click: () => menus.about(),
			},
		],
	});

	template.submenu.push({ type: "separator" });

	// Quit options
	template.submenu.push({
		label: "Quit",
		accelerator: "CommandOrControl+Q",
		click: () => menus.quit(false),
	});

	template.submenu.push({
		label: "Quit and Clear Storage",
		click: () => menus.quit(true),
	});

	return template;
}

export default appMenu;
