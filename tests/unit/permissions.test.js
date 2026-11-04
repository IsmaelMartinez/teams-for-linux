'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { isPermissionAllowed, installPermissionHandlers } = require('../../app/security/permissions');

// GHSA-58j7-22f8-6xqp: Electron grants every permission unless a handler says
// otherwise, so pages that are not Teams must not get the mic, camera or
// notifications for free.
const none = new Set();

describe('isPermissionAllowed', () => {
	it('allows the Teams hosts and the Microsoft sign-in hosts', () => {
		for (const url of [
			'https://teams.cloud.microsoft/v2/',
			'https://teams.microsoft.com/',
			'https://teams.live.com/',
			'https://teams.microsoft.com.mcas.ms/',
			'https://login.microsoftonline.com/common/oauth2',
		]) {
			assert.strictEqual(isPermissionAllowed({ topLevelUrl: url }, none), true, url);
		}
	});

	it('allows an iframe embedded by Teams through the top-level page', () => {
		assert.strictEqual(
			isPermissionAllowed({ topLevelUrl: 'https://teams.microsoft.com/', requestingUrl: 'https://contoso.sharepoint.com/' }, none),
			true,
		);
	});

	it('allows the PiP about:blank window through the inherited Teams origin', () => {
		assert.strictEqual(
			isPermissionAllowed({ topLevelUrl: 'about:blank', requestingUrl: 'https://teams.microsoft.com' }, none),
			true,
		);
	});

	it('allows the configured URL and profile URL origins outside the known hosts', () => {
		const trusted = new Set(['https://gov.teams.microsoft.us']);
		assert.strictEqual(isPermissionAllowed({ topLevelUrl: 'https://gov.teams.microsoft.us/v2/' }, trusted), true);
	});

	it('allows the app\'s own local pages only', () => {
		const appPage = pathToFileURL(path.join(__dirname, '..', '..', 'app', 'quickChat', 'quickChatModal.html')).href;
		assert.strictEqual(isPermissionAllowed({ topLevelUrl: appPage }, none), true);
		assert.strictEqual(isPermissionAllowed({ topLevelUrl: 'file:///tmp/evil.html' }, none), false);
	});

	it('denies a page that is neither Teams nor sign-in', () => {
		for (const url of [
			'https://evil.example/',
			'http://teams.microsoft.com/',
			'https://teams.microsoft.com.evil.example/',
			'https://evil.com.teams.microsoft.com.example/',
			'not a url',
		]) {
			assert.strictEqual(isPermissionAllowed({ topLevelUrl: url, requestingUrl: url }, none), false, url);
		}
		assert.strictEqual(isPermissionAllowed({}, none), false);
	});
});

describe('installPermissionHandlers', () => {
	function fakeSession() {
		return {
			setPermissionRequestHandler(fn) { this.request = fn; },
			setPermissionCheckHandler(fn) { this.check = fn; },
		};
	}

	it('installs on the default session and on sessions created later', () => {
		const listeners = {};
		const app = { on: (name, fn) => { listeners[name] = fn; } };
		const defaultSession = fakeSession();
		installPermissionHandlers({ url: 'https://teams.cloud.microsoft' }, app, defaultSession);
		assert.strictEqual(typeof defaultSession.request, 'function');

		const later = fakeSession();
		listeners['session-created'](later);
		assert.strictEqual(typeof later.check, 'function');
	});

	it('answers requests and checks with the policy, reading profile URLs live', () => {
		const app = { on() {} };
		const s = fakeSession();
		const profileUrls = [];
		installPermissionHandlers({ url: 'https://teams.cloud.microsoft' }, app, s, () => profileUrls);
		const page = (url) => ({ getURL: () => url });

		let granted;
		s.request(page('https://teams.cloud.microsoft/'), 'media', (v) => { granted = v; }, { requestingUrl: 'https://teams.cloud.microsoft/' });
		assert.strictEqual(granted, true);
		s.request(page('https://evil.example/'), 'media', (v) => { granted = v; }, { requestingUrl: 'https://evil.example/' });
		assert.strictEqual(granted, false);

		assert.strictEqual(s.check(page('https://tenant.example/'), 'notifications', 'https://tenant.example'), false);
		profileUrls.push('https://tenant.example/teams');
		assert.strictEqual(s.check(page('https://tenant.example/'), 'notifications', 'https://tenant.example'), true);
	});
});
