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
			label: `Teams-for-linux version ${require('./../../package.json').version}`,
			enabled: false,
		},
		{
			label: `Electron version ${app.getVersion()}`,
			enabled: false,
		},
		{role: 'toggledevtools'},
	],
});
