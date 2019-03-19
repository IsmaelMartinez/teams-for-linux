const yargs = require('yargs');
const path = require('path');

function argv(configPath) {
	return yargs
		.env(true)
		.config('settings', path.join(configPath, 'outlook.json'))
		.options({
			closeAppOnCross: {
				default: false,
				describe: 'Close the app when clicking the close (X) cross',
				type: 'boolean',
			},
			enableDesktopNotificationsHack: {
				default: false,
				describe: 'Enable electron-native-notifications hack',
				type: 'boolean',
			},
			url: {
				default: 'https://outlook.office.com/',
				describe: 'Microsoft Outlook URL',
				type: 'string',
			},
			webDebug: {
				default: false,
				describe: 'Enable debug',
				type: 'boolean',
			},
			partition: {
				default: 'persist:outlook-4-linux',
				describe: 'BrowserWindow webpreferences partition',
				type: 'string',
			},
			chromeUserAgent: {
				describe: 'Google Chrome User Agent',
				type: 'string',
				default:
					'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/71.0.3578.80 Safari/537.36',
			},
			ntlmV2enabled: {
				default: 'true',
				describe: 'Set enable-ntlm-v2 value',
				type: 'string',
			},
			authServerWhitelist: {
				default: '*',
				describe: 'Set auth-server-whitelist value',
				type: 'string',
			},
			customCSSLocation: {
				default: '',
				describe: 'custom CSS styles file location',
				type: 'string'
			}
		})
		.parse(process.argv.slice(1));
}

exports = module.exports = argv;
