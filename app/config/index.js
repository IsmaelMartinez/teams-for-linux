const yargs = require('yargs');
const path = require('path');
const os = require('os');
const { LucidLog } = require('lucid-log');

const isMac = os.platform() === 'darwin';

let logger;

function getConfigFile(configPath) {
	try {
		return require(path.join(configPath, 'config.json'));
	} catch (e) {
		return null;
	}
}

function argv(configPath) {
	let configFile = getConfigFile(configPath);
	const missingConfig = configFile == null;
	configFile = configFile || {};
	let config = yargs
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
			customUserDir: {
				default: null,
				describe: 'Custom User Directory so that you can have multiple profiles',
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
					'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.110 Safari/537.36'
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
			},
			appLogLevels: {
				default: 'error,warn',
				describe: 'Comma separated list of log levels (error,warn,info,debug)',
				type: 'string'
			},
			clearStorage: {
				default: false,
				describe: 'Whether to clear the storage before creating the window or not',
				type: 'boolean',
			},
			disableMeetingNotifications: {
				default: false,
				describe: 'Whether to disable meeting notifications or not',
				type: 'boolean',
			},
			appIcon: {
				default: path.join(__dirname, '..', 'assets', 'icons', isMac ? 'icon-16x16.png' : 'icon-96x96.png'),
				describe: 'Teams app icon to show in the tray',
				type: 'string'
			},
			spellCheckerLanguages: {
				default: [],
				describe: 'Array of languages to use with Electron\'s spell checker (experimental)',
				type: 'array',
			},
			appTitle: {
				default: 'Microsoft Teams',
				describe: 'A value to be suffixed with page title',
				type: 'string',
			}
		})
		.parse(process.argv.slice(1));

	logger = new LucidLog({
		levels: config.appLogLevels.split(',')
	});

	logger.debug('configPath:', configPath);
	if (missingConfig) {
		logger.info('No config file found, using default values');
	}
	logger.debug('configFile:', configFile);

	return config;
}

exports = module.exports = argv;
