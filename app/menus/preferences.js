exports = module.exports = () => ({
	label: 'Preferences',
	submenu: [
		{
			label: 'Zoom',
			submenu: [
				{role: 'resetZoom'},
				{role: 'zoomIn'},
				{role: 'zoomOut'},
				{role: 'togglefullscreen'},
			],
		},
	],
});
