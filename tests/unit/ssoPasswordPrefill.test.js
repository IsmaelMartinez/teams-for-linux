'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');
const {
  isLoginUrl,
  codeFrom,
  buildObserverScript,
  buildPasswordFillScript,
  buildTotpFillScript,
} = require('../../app/ssoPasswordPrefill/index');

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

// The code command's output is user-controlled, and password managers group TOTP
// digits for readability, so normalisation is part of the contract.
describe('ssoPasswordPrefill.codeFrom', () => {
  it('takes the first line only', () => {
    assert.strictEqual(codeFrom('123456\nignored\n'), '123456');
  });

  it('strips the grouping whitespace password managers emit', () => {
    assert.strictEqual(codeFrom('123 456'), '123456');
    assert.strictEqual(codeFrom('  123456\t'), '123456');
  });

  it('keeps non-digit codes intact, since some issuers use them', () => {
    assert.strictEqual(codeFrom('ab12cd'), 'ab12cd');
  });

  it('returns empty for empty output', () => {
    assert.strictEqual(codeFrom(''), '');
  });
});

// The injected scripts are built by string concatenation, so a syntax error or a
// broken escape would only surface at run time on a real login page.
describe('ssoPasswordPrefill injected scripts', () => {
  const compiles = (src) => {
    new vm.Script(src);
    return true;
  };

  it('produces syntactically valid scripts', () => {
    assert.ok(compiles(buildPasswordFillScript('pw', true)));
    assert.ok(compiles(buildTotpFillScript('123456', true)));
    assert.ok(compiles(buildObserverScript(1, 'a@b.com', 'Text', true, true)));
    assert.ok(compiles(buildObserverScript(1, null, null, false, false)));
  });

  it('escapes values that would otherwise break out of the string literal', () => {
    const nasty = `'"\\</script><script>alert(1)</script>`;
    assert.ok(compiles(buildTotpFillScript(nasty, false)));
    assert.ok(compiles(buildPasswordFillScript(nasty, false)));
    // The payload survives as data, not as code.
    assert.ok(buildTotpFillScript(nasty, false).includes(JSON.stringify(nasty)));
  });

  it('targets the code field and its own submit flag', () => {
    const src = buildTotpFillScript('123456', true);
    assert.match(src, /const findField = findOtc;/);
    assert.match(src, /const SUBMIT = OTC_SUBMIT_SEL;/);
    assert.ok(src.includes('"totpSubmit"'));
  });

  it('leaves the password step targeting the password field and Sign in flag', () => {
    const src = buildPasswordFillScript('pw', true);
    assert.match(src, /const findField = findPwd;/);
    assert.match(src, /const SUBMIT = SUBMIT_SEL;/);
    assert.ok(src.includes('"signIn"'));
  });

  it('never lets an older generation reclaim the supersede marker', () => {
    // The post-password re-arm re-injects with its original generation. A plain
    // NS.gen assignment would stamp that stale number over a newer document's
    // observer and stop it resolving, so the marker has to be monotonic.
    const src = buildObserverScript(2, null, null, false, true);
    assert.match(src, /if \(!\(NS\.gen > GEN\)\) NS\.gen = GEN;/);
    assert.doesNotMatch(src, /^\s*NS\.gen = GEN;/m);
  });

  it('only looks for the code field when a totpCommand is configured', () => {
    assert.match(buildObserverScript(1, null, null, false, true), /const WANT_OTC = true;/);
    assert.match(buildObserverScript(1, null, null, false, false), /const WANT_OTC = false;/);
  });
});
