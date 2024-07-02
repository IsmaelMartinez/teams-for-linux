const dbus = require('@homebridge/dbus-native');

let intuneAccount = null;
const brokerService = dbus.sessionBus().getService('com.microsoft.identity.broker1');

function processInTuneAccounts(logger, resp, ssoInTuneAuthUser) {
	const response = JSON.parse(resp);
	if ('error' in response) {
		logger.warn('Failed to retrieve InTune account list: ' + response.error.context);
		return;
	};

	if (ssoInTuneAuthUser == '') {
		intuneAccount = response.accounts[0];
		logger.debug('Using first available InTune account (' + intuneAccount.username + ')');
	} else {
		for (const account in response.accounts) {
			if (account.username == ssoInTuneAuthUser) {
				intuneAccount = account;
				logger.debug('Found matching InTune account (' + intuneAccount.username + ')');
				break;
			}
		}
		if (intuneAccount == null) {
			logger.warn('Failed to find matching InTune account for ' + ssoInTuneAuthUser + '.');
		}
	}
}

exports.initSso = function initIntuneSso(logger, ssoInTuneAuthUser) {
	logger.debug("Initializing InTune SSO");
	brokerService.getInterface(
		'/com/microsoft/identity/broker1',
		'com.microsoft.identity.Broker1', function(err, broker) {
			if (err) {
				logger.warn('Failed to find microsoft-identity-broker DBus interface');
				return;
			}
			broker.getAccounts('0.0', '', JSON.stringify({'clientId': '88200948-af09-45a1-9c03-53cdcc75c183', 'redirectUri':'urn:ietf:oob'}), function(err, resp) {
				if (err) {
					logger.warn('Failed to communicate with microsoft-identity-broker');
					return;
				}
				processInTuneAccounts(logger, resp, ssoInTuneAuthUser);
			});
		});
}

exports.setupUrlFilter = function setupUrlFilter(filter) {
	filter.urls.push('https://login.microsoftonline.com/*');
}

exports.isSsoUrl = function isSsoUrl(url) {
	return intuneAccount != null && url.startsWith('https://login.microsoftonline.com/');
}

function processPrtResponse(logger, resp, detail) {
	const response = JSON.parse(resp);
	if ('error' in response) {
		logger.warn('Failed to retrieve Intune SSO cookie: ' + response.error.context);
	} else {
		logger.debug('Adding SSO credential');
		detail.requestHeaders['X-Ms-Refreshtokencredential'] = response['cookieContent'];
	}
}

exports.addSsoCookie = function addIntuneSsoCookie(logger, detail, callback) {
	logger.debug('Retrieving InTune SSO cookie');
	if (intuneAccount == null) {
		logger.info("InTune SSO not active");
		callback({
			requestHeaders: detail.requestHeaders
		});
		return;
	}
	brokerService.getInterface(
		'/com/microsoft/identity/broker1',
		'com.microsoft.identity.Broker1', function(err, broker) {
			broker.acquirePrtSsoCookie('0.0', '', JSON.stringify({'ssoUrl':detail.url, 'account':intuneAccount, 'authParameters':{'authority':'https://login.microsoftonline.com/common/'}}), function(err, resp) {
				processPrtResponse(logger, resp, detail);
				callback({
					requestHeaders: detail.requestHeaders
				});
			});
		});
}

