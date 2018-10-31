'use strict';
const yargs = require('yargs');
const path = require('path');

function argv(configPath) {
  return yargs
    .env(true)
    .config(path.join(configPath, 'teams.json'))
    .options({
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
        default: 'nopersist',
        describe: 'BrowserWindow webpreferences partition',
        type: 'string'
      },
      userAgent: {
        describe: 'HTTP User Agent',
        type: 'string',
        default: 'chrome'
      },
      edgeUserAgent: {
        describe: 'Microsoft Edge User Agent',
        type: 'string',
        default:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/64.0.3282.140 Safari/537.36 Edge/17.17134'
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