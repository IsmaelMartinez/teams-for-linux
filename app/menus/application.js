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
			label: 'Quit',
			accelerator: 'ctrl+Q',
			click: () => Menus.quit(),
		},
	],
});
