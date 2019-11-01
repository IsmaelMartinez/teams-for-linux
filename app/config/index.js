const yargs = require('yargs');
const path = require('path');

function argv(configPath) {
	console.log('configPath =', configPath);
	let configFile = getConfigFile(configPath);
	console.log('configFile =', configFile);
	return yargs
		.env(true)
		.config(configFile)
		.options({
			closeAppOnCross: {
				default: false,
				describe: 'Close the app when clicking the close (X) cross',
				type: 'boolean',
			},
			onlineOfflineReload: {
				default: true,
				describe: 'Reload page when going from offline to online',
				type: 'boolean',
			},
			rightClickWithSpellcheck: {
				default: true,
				describe: 'Enable/Disable the right click menu with spellchecker',
				type: 'boolean',
			},
			enableDesktopNotificationsHack: {
				default: false,
				describe: 'Enable electron-native-notifications hack',
				type: 'boolean',
			},
			url: {
				default: 'https://teams.microsoft.com/',
				describe: 'Microsoft Teams URL',
				type: 'string',
			},
			proxyServer: {
				default: null,
				describe: 'Proxy Server with format address:port',
				type: 'string',
			},
			useElectronDl: {
				default: false,
				describe: 'Use Electron dl to automatically download files to the download folder',
				type: 'boolean',
			},
			minimized: {
				default: false,
				describe: 'Start the application minimized',
				type: 'boolean',
			},
			webDebug: {
				default: false,
				describe: 'Enable debug at start',
				type: 'boolean',
			},
			partition: {
				default: 'persist:teams-4-linux',
				describe: 'BrowserWindow webpreferences partition',
				type: 'string',
			},
			chromeUserAgent: {
				describe: 'Google Chrome User Agent',
				type: 'string',
				default:
					'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/77.0.3831.6 Safari/537.36',
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
			customCSSName: {
				default: '',
				describe: 'custom CSS name for the packaged available css files. Currently those are: "compactDark", "compactLight", "tweaks", "condensedDark" and "condensedLight" ',
				type: 'string'
			},
			customCSSLocation: {
				default: '',
				describe: 'custom CSS styles file location',
				type: 'string'
			},
			customCACertsFingerprints: {
				default: [],
				describe: 'Array of custom CA Certs Fingerprints to allow SSL unrecognized signer or self signed certificate',
				type: 'array'
			}
		})
		.parse(process.argv.slice(1));
}

function getConfigFile(configPath) {
	try {
		return require(path.join(configPath, 'config.json'));
	} catch (e){
		console.info('Failed to get the config file, using default values');
		return {};
	}
}

exports = module.exports = argv;
