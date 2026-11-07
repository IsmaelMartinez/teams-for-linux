'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const { keepMsalEncryptionCookiePersistent } = require('../../app/mainAppWindow/msalCookiePersistence');

// #3183: msal.cache.encryption must be promoted to a persistent cookie on every
// session that hosts an account, not only the root window session.

function fakeSession() {
	const listeners = [];
	const setCalls = [];
	return {
		listeners,
		setCalls,
		cookies: {
			on: (event, cb) => listeners.push({ event, cb }),
			set: async (details) => { setCalls.push(details); },
		},
	};
}

const sessionCookie = {
	name: 'msal.cache.encryption',
	value: 'v',
	domain: '.teams.example.com',
	path: '/',
	secure: true,
	httpOnly: false,
	sameSite: 'no_restriction',
	session: true,
};

describe('keepMsalEncryptionCookiePersistent', () => {
	it('attaches a changed listener to a profile session', () => {
		const s = fakeSession();
		keepMsalEncryptionCookiePersistent(s, {});
		assert.strictEqual(s.listeners.length, 1);
		assert.strictEqual(s.listeners[0].event, 'changed');
	});

	it('does not attach twice to the same session', () => {
		const s = fakeSession();
		keepMsalEncryptionCookiePersistent(s, {});
		keepMsalEncryptionCookiePersistent(s, {});
		assert.strictEqual(s.listeners.length, 1);
	});

	it('attaches to each distinct session', () => {
		const a = fakeSession();
		const b = fakeSession();
		keepMsalEncryptionCookiePersistent(a, {});
		keepMsalEncryptionCookiePersistent(b, {});
		assert.strictEqual(a.listeners.length, 1);
		assert.strictEqual(b.listeners.length, 1);
	});

	it('does not attach when explicitly disabled', () => {
		const s = fakeSession();
		keepMsalEncryptionCookiePersistent(s, { auth: { keepMsalCacheEncryptionCookie: { enabled: false } } });
		assert.strictEqual(s.listeners.length, 0);
	});

	it('rewrites the session cookie with an expiry and preserved attributes', () => {
		const s = fakeSession();
		keepMsalEncryptionCookiePersistent(s, { auth: { keepMsalCacheEncryptionCookie: { days: 10 } } });
		const before = Math.floor(Date.now() / 1000);
		s.listeners[0].cb({}, sessionCookie, 'explicit', false);
		assert.strictEqual(s.setCalls.length, 1);
		const d = s.setCalls[0];
		assert.strictEqual(d.url, 'https://teams.example.com/');
		assert.strictEqual(d.domain, '.teams.example.com');
		assert.strictEqual(d.secure, true);
		assert.ok(d.expirationDate >= before + 10 * 86400);
		assert.ok(d.expirationDate <= before + 10 * 86400 + 5);
	});

	it('ignores removed, other-named and already persistent cookies', () => {
		const s = fakeSession();
		keepMsalEncryptionCookiePersistent(s, {});
		const cb = s.listeners[0].cb;
		cb({}, sessionCookie, 'explicit', true);
		cb({}, { ...sessionCookie, name: 'other' }, 'explicit', false);
		cb({}, { ...sessionCookie, session: false }, 'explicit', false);
		assert.strictEqual(s.setCalls.length, 0);
	});
});

describe('profile views wire the cookie listener', () => {
	it('profileViewManager calls the helper on the view session', () => {
		const src = readFileSync(join(__dirname, '..', '..', 'app', 'mainAppWindow', 'profileViewManager.js'), 'utf8');
		assert.match(src, /keepMsalEncryptionCookiePersistent\(view\.webContents\.session/);
	});
});
