const {shell} = require('electron');

exports = module.exports = (app) => ({
	label: 'Help',
	submenu: [
		{
			label: 'Online Documentation',
			click: () => shell.openExternal('https://support.office.com/en-us/teams?omkt=en-001'),
		},
		{
			label: 'Github Project',
			click: () => shell.openExternal('https://github.com/IsmaelMartinez/teams-for-linux'),
		},
		{type: 'separator'},
		{
			label: `Version ${app.getVersion()}`,
			enabled: false,
		},
		{role: 'toggledevtools'},
	],
});
