'use strict';

const yargs = require('yargs');
const path = require('path');

function argv(configPath) {
  return yargs
    .env(true)
    .config(path.join(configPath, 'teams.json'))
    .options({
      'url': {
        demandOption: true,
        default: 'https://teams.microsoft.com/',
        describe: 'Microsoft Teams URL',
        type: 'string'
      },
      'webDebug': {
        demandOption: false,
        default: false,
        describe: 'Enable debug',
        type: 'boolean'
      },
      'firewallUsername': {
        alias: 'u',
        demandOption: false,
        describe: 'Username',
        type: 'string'
      },
      'firewallPassword': {
        alias: 'p',
        demandOption: false,
        describe: 'Password',
        type: 'string'
      },
      'userAgent': {
        demandOption: false,
        describe: 'HTTP User Agent',
        type: 'string',
        default: 'edge'
      },
      'edgeUserAgent': {
        demandOption: false,
        describe: 'Microsoft Edge User Agent',
        type: 'string',
        default: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36 Edge/16.16299'
      },
      'chromeUserAgent': {
        demandOption: false,
        describe: 'Google Chrome User Agent',
        type: 'string',
        default: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/65.0.3325.181 Safari/537.36'

      }
    })
    .implies('firewallUsername', 'firewallPassword')
    .argv;
}

exports = module.exports = argv;