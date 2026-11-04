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
const allowed = (request, trusted = none) => isPermissionAllowed(request, trusted);

describe('isPermissionAllowed', () => {
	it('allows the Teams, government Teams and Microsoft sign-in hosts', () => {
		for (const url of [
			'https://teams.cloud.microsoft/v2/',
			'https://teams.microsoft.com/',
			'https://teams.live.com/',
			'https://teams.microsoft.com.mcas.ms/',
			'https://gov.teams.microsoft.us/',
			'https://dod.teams.microsoft.us/',
			'https://login.microsoftonline.com/common/oauth2',
			'https://login.microsoftonline.us/common/oauth2',
		]) {
			assert.strictEqual(allowed({ permission: 'notifications', isMainFrame: true, topLevelUrl: url, requestingUrl: url }), true, url);
		}
	});

	it('lets a frame embedded by Teams use only frame-policy-gated permissions', () => {
		const frame = { isMainFrame: false, topLevelUrl: 'https://teams.microsoft.com/', requestingUrl: 'https://contoso.sharepoint.com/' };
		for (const permission of ['media', 'display-capture', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen']) {
			assert.strictEqual(allowed({ ...frame, permission }), true, permission);
		}
		for (const permission of ['notifications', 'openExternal', 'fileSystem', 'hid', 'usb', 'serial', 'geolocation']) {
			assert.strictEqual(allowed({ ...frame, permission }), false, permission);
		}
	});

	it('allows the PiP about:blank window through its inherited Teams origin', () => {
		assert.strictEqual(
			allowed({ permission: 'media', isMainFrame: true, topLevelUrl: 'about:blank', requestingUrl: 'https://teams.microsoft.com' }),
			true,
		);
	});

	it('lets Teams open any external app, other main frames only mail and phone links', () => {
		const teams = { permission: 'openExternal', isMainFrame: true, topLevelUrl: 'https://teams.microsoft.com/', requestingUrl: 'https://teams.microsoft.com/' };
		assert.strictEqual(allowed({ ...teams, externalURL: 'msteams:/l/meetup-join/x' }), true);
		assert.strictEqual(allowed({ ...teams, externalURL: 'sip:user@example.com' }), true);

		const other = { permission: 'openExternal', isMainFrame: true, topLevelUrl: 'https://idp.example/', requestingUrl: 'https://idp.example/' };
		assert.strictEqual(allowed({ ...other, externalURL: 'mailto:help@example.com' }), true);
		assert.strictEqual(allowed({ ...other, externalURL: 'tel:+15551234' }), true);
		assert.strictEqual(allowed({ ...other, externalURL: 'com-okta-authenticator:/x' }), false);
		assert.strictEqual(allowed({ ...other, externalURL: 'ssh://host' }), false);
		assert.strictEqual(allowed({ ...other }), false);
		assert.strictEqual(allowed({ ...other, isMainFrame: false, externalURL: 'mailto:x@example.com' }), false);
	});

	it('allows the configured URL and profile URL origins outside the known hosts', () => {
		const trusted = new Set(['https://tenant.example']);
		assert.strictEqual(allowed({ permission: 'notifications', isMainFrame: true, requestingUrl: 'https://tenant.example/teams' }, trusted), true);
	});

	it('allows the app\'s own local pages only', () => {
		const appPage = pathToFileURL(path.join(__dirname, '..', '..', 'app', 'quickChat', 'quickChatModal.html')).href;
		assert.strictEqual(allowed({ permission: 'clipboard-sanitized-write', isMainFrame: true, requestingUrl: appPage }), true);
		assert.strictEqual(allowed({ permission: 'clipboard-sanitized-write', isMainFrame: true, requestingUrl: 'file:///tmp/evil.html' }), false);
	});

	it('denies a page that is neither Teams nor sign-in', () => {
		for (const url of [
			'https://evil.example/',
			'http://teams.microsoft.com/',
			'https://teams.microsoft.com.evil.example/',
			'https://evil.com.teams.microsoft.com.example/',
			'not a url',
		]) {
			for (const permission of ['media', 'notifications']) {
				assert.strictEqual(allowed({ permission, isMainFrame: true, topLevelUrl: url, requestingUrl: url }), false, `${permission} ${url}`);
			}
		}
		assert.strictEqual(allowed({ permission: 'media' }), false);
	});
});

describe('installPermissionHandlers', () => {
	function fakeSession() {
		return {
			setPermissionRequestHandler(fn) { this.request = fn; },
			setPermissionCheckHandler(fn) { this.check = fn; },
		};
	}
	const page = (url) => ({ getURL: () => url });

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
		const s = fakeSession();
		const profileUrls = [];
		installPermissionHandlers({ url: 'https://teams.cloud.microsoft' }, { on() {} }, s, () => profileUrls);

		let granted;
		s.request(page('https://teams.cloud.microsoft/'), 'media', (v) => { granted = v; }, { isMainFrame: true, requestingUrl: 'https://teams.cloud.microsoft/' });
		assert.strictEqual(granted, true);
		s.request(page('https://evil.example/'), 'media', (v) => { granted = v; }, { isMainFrame: true, requestingUrl: 'https://evil.example/' });
		assert.strictEqual(granted, false);

		assert.strictEqual(s.check(page('https://tenant.example/'), 'notifications', 'https://tenant.example', { isMainFrame: true }), false);
		profileUrls.push('https://tenant.example/teams');
		assert.strictEqual(s.check(page('https://tenant.example/'), 'notifications', 'https://tenant.example', { isMainFrame: true }), true);
	});

	it('prefers securityOrigin over requestingUrl for the PiP window', () => {
		const s = fakeSession();
		installPermissionHandlers({ url: 'https://teams.cloud.microsoft' }, { on() {} }, s);
		let granted;
		s.request(page('about:blank'), 'media', (v) => { granted = v; }, {
			isMainFrame: true, requestingUrl: 'about:blank', securityOrigin: 'https://teams.cloud.microsoft',
		});
		assert.strictEqual(granted, true);
	});
});
