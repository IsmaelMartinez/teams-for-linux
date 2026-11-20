'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { isSafeExternalUrl, schemeOf } = require('../../app/helpers/externalUrl');

describe('isSafeExternalUrl', () => {
	it('allows web, mail, phone, SIP and Teams links', () => {
		for (const url of [
			'https://example.com/a?b=1',
			'http://example.com/',
			'HTTPS://EXAMPLE.COM/',
			'mailto:help@example.com',
			'tel:+15551234',
			'sip:user@example.com',
			'msteams:/l/meetup-join/x',
			'web+msteams:/l/meetup-join/x',
		]) {
			assert.strictEqual(isSafeExternalUrl(url), true, url);
		}
	});

	it('refuses file shares, other handlers and non-URLs', () => {
		for (const url of [
			'smb://host/share/x.exe',
			'file:///etc/passwd',
			'ftp://host/x',
			'ssh://user@host',
			'search-ms:query=x',
			'ms-excel:ofe|u|https://example.com/x.xlsx',
			'vscode://vscode.git/clone?url=https://example.com',
			'foo-custom://payload',
			'javascript:alert(1)',
			'data:text/html,<b>x</b>',
			'about:blank#x',
			'not a url',
			'',
			undefined,
			null,
		]) {
			assert.strictEqual(isSafeExternalUrl(url), false, String(url));
		}
	});
});

describe('schemeOf', () => {
	it('returns the scheme with its colon, or null when the URL does not parse', () => {
		assert.strictEqual(schemeOf('https://example.com/'), 'https:');
		assert.strictEqual(schemeOf('smb://host/x'), 'smb:');
		assert.strictEqual(schemeOf('not a url'), null);
		assert.strictEqual(schemeOf(undefined), null);
	});
});
