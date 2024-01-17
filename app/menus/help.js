const {shell} = require('electron');

exports = module.exports = (app) => ({
	label: 'Help',
	submenu: [
		{
			label: 'Online Documentation',
			click: () => shell.openExternal('https://support.office.com/en-us/teams'),
		},
		{
			label: 'Github Project',
			click: () => shell.openExternal('https://github.com/IsmaelMartinez/teams-for-linux'),
		},
		{
			label: 'Microsoft Teams Support',
			click:() => shell.openExternal('https://answers.microsoft.com/en-us/msteams/forum'),
		},
		{type: 'separator'},
		{
			label: `Version ${app.getVersion()}`,
			enabled: false,
		},
		{role: 'toggledevtools'},
	],
});
