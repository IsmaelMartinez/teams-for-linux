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
        demandOption: true,
        describe: 'HTTP User Agent',
        type: 'string',
        default: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36 Edge/16.16299'
      }
    })
    .implies('firewallUsername', 'firewallPassword')
    .argv;
}

exports = module.exports = argv;