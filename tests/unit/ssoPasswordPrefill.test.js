'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { isLoginUrl } = require('../../app/ssoPasswordPrefill/index');

// isLoginUrl is the gate that decides where the pre-fill injects a password,
// so its host- and scheme-matching is security-relevant and covered here.
describe('ssoPasswordPrefill.isLoginUrl', () => {
  it('matches the built-in Microsoft login hosts over HTTPS', () => {
    assert.strictEqual(isLoginUrl('https://login.microsoftonline.com/common/oauth2/authorize'), true);
    assert.strictEqual(isLoginUrl('https://login.microsoft.com/'), true);
    assert.strictEqual(isLoginUrl('https://login.live.com/'), true);
  });

  it('matches subdomains of a login host', () => {
    assert.strictEqual(isLoginUrl('https://eu.login.microsoftonline.com/'), true);
  });

  it('rejects http:// even on a recognised login host (no cleartext secrets)', () => {
    assert.strictEqual(isLoginUrl('http://login.microsoftonline.com/common'), false);
  });

  it('rejects non-http(s) schemes', () => {
    assert.strictEqual(isLoginUrl('file:///login.microsoftonline.com'), false);
    assert.strictEqual(isLoginUrl('ftp://login.microsoftonline.com/'), false);
  });

  it('rejects unrelated hosts', () => {
    assert.strictEqual(isLoginUrl('https://teams.microsoft.com/'), false);
    assert.strictEqual(isLoginUrl('https://example.com/'), false);
  });

  it('rejects look-alike hosts that only suffix a login domain', () => {
    assert.strictEqual(isLoginUrl('https://login.microsoftonline.com.evil.com/'), false);
    assert.strictEqual(isLoginUrl('https://notlogin.microsoftonline.com/'), false);
  });

  it('honours extraHosts, but still requires HTTPS', () => {
    assert.strictEqual(isLoginUrl('https://adfs.example.org/', ['example.org']), true);
    assert.strictEqual(isLoginUrl('https://example.org/', ['example.org']), true);
    assert.strictEqual(isLoginUrl('http://adfs.example.org/', ['example.org']), false);
    // Without the extra host configured, the federated host is not matched.
    assert.strictEqual(isLoginUrl('https://adfs.example.org/'), false);
  });

  it('returns false for malformed or missing URLs', () => {
    assert.strictEqual(isLoginUrl('not a url'), false);
    assert.strictEqual(isLoginUrl(''), false);
    assert.strictEqual(isLoginUrl(undefined), false);
    assert.strictEqual(isLoginUrl(null), false);
  });
});
