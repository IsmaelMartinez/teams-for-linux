'use strict';
const yargs = require('yargs');
const path = require('path');

function argv(configPath) {
  return yargs
    .env(true)
    .config(path.join(configPath, 'teams.json'))
    .options({
      disableDesktopNotifications: {
        default: false,
        describe: 'disable electron-native-notifications',
        type: 'boolean'
      },
      openLinksInExternalBrowser: {
        default: true,
        describe: 'open links in external browser',
        type: 'boolean'
      },
      url: {
        default: 'https://teams.microsoft.com/',
        describe: 'Microsoft Teams URL',
        type: 'string'
      },
      webDebug: {
        default: false,
        describe: 'Enable debug',
        type: 'boolean'
      },
      partition: {
        default: 'persist:teams-4-linux',
        describe: 'BrowserWindow webpreferences partition',
        type: 'string'
      },
      edgeUserAgent: {
        describe: 'Microsoft Edge User Agent',
        type: 'string',
        default:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36 Edge/42.17134'
      },
      chromeUserAgent: {
        describe: 'Google Chrome User Agent',
        type: 'string',
        default: 
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36'
      },
      ntlmV2enabled: {
        default: 'true',
        describe: 'enable-ntlm-v2 value',
        type: 'string'
      },
      authServerWhitelist: {
        default: '*',
        describe: 'auth-server-whitelist value',
        type: 'string'
      }
    })
    .parse(process.argv.slice(1));
}

exports = module.exports = argv;