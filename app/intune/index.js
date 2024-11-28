const dbus = require('@homebridge/dbus-native');

let inTuneAccount = null;
const brokerService = dbus.sessionBus().getService('com.microsoft.identity.broker1');

function processInTuneAccounts(resp, ssoInTuneAuthUser) {
	const response = JSON.parse(resp);
	if ('error' in response) {
		console.warn('Failed to retrieve InTune account list: ' + response.error.context);
		return;
	};

	if (ssoInTuneAuthUser == '') {
		inTuneAccount = response.accounts[0];
		console.debug('Using first available InTune account (' + inTuneAccount.username + ')');
	} else {
		for (const account of response.accounts) {
			if (account.username == ssoInTuneAuthUser) {
				inTuneAccount = account;
				console.debug('Found matching InTune account (' + inTuneAccount.username + ')');
				break;
			}
		}
		if (inTuneAccount == null) {
			console.warn('Failed to find matching InTune account for ' + ssoInTuneAuthUser + '.');
		}
	}
}

exports.initSso = function initIntuneSso(ssoInTuneAuthUser) {
	console.debug("Initializing InTune SSO");
	brokerService.getInterface(
		'/com/microsoft/identity/broker1',
		'com.microsoft.identity.Broker1', function(err, broker) {
			if (err) {
				console.warn('Failed to find microsoft-identity-broker DBus interface');
				return;
			}
			broker.getAccounts('0.0', '', JSON.stringify({'clientId': '88200948-af09-45a1-9c03-53cdcc75c183', 'redirectUri':'urn:ietf:oob'}), function(err, resp) {
				if (err) {
					console.warn('Failed to communicate with microsoft-identity-broker');
					return;
				}
				processInTuneAccounts(resp, ssoInTuneAuthUser);
			});
		});
}

exports.setupUrlFilter = function setupUrlFilter(filter) {
	filter.urls.push('https://login.microsoftonline.com/*');
}

exports.isSsoUrl = function isSsoUrl(url) {
	return inTuneAccount != null && url.startsWith('https://login.microsoftonline.com/');
}

function processPrtResponse(resp, detail) {
	const response = JSON.parse(resp);
	if ('error' in response) {
		console.warn('Failed to retrieve Intune SSO cookie: ' + response.error.context);
	} else {
		console.debug('Adding SSO credential');
		detail.requestHeaders['X-Ms-Refreshtokencredential'] = response['cookieContent'];
	}
}

exports.addSsoCookie = function addIntuneSsoCookie(detail, callback) {
	console.debug('Retrieving InTune SSO cookie');
	if (inTuneAccount == null) {
		console.info("InTune SSO not active");
		callback({
			requestHeaders: detail.requestHeaders
		});
		return;
	}
	brokerService.getInterface(
		'/com/microsoft/identity/broker1',
		'com.microsoft.identity.Broker1', function(_err, broker) {
			broker.acquirePrtSsoCookie('0.0', '', JSON.stringify({'ssoUrl':detail.url, 'account':inTuneAccount, 'authParameters':{'authority':'https://login.microsoftonline.com/common/'}}), function(_err, resp) {
				processPrtResponse(resp, detail);
				callback({
					requestHeaders: detail.requestHeaders
				});
			});
		});
}

