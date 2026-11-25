'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {
  NO_BACKEND_ARG,
  findBrowser,
  backendName,
  rendererArguments,
} = require('../../app/webauthn/backendStatus');
const browserBackend = require('../../app/webauthn/browserBackend');
const { CANCELLED_MESSAGE } = require('../../app/webauthn/fido2Backend');

const b64u = (buf) => Buffer.from(buf).toString('base64url');

function tempBin(names) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tfl-browser-test-'));
  for (const name of names) {
    fs.writeFileSync(path.join(dir, name), '#!/bin/sh\n', { mode: 0o755 });
  }
  return dir;
}

describe('findBrowser', () => {
  it('returns the first known browser on PATH, in order of preference', () => {
    const dir = tempBin(['chromium', 'microsoft-edge-stable']);
    assert.strictEqual(findBrowser('', dir), path.join(dir, 'microsoft-edge-stable'));
  });

  it('looks a configured command name up on PATH', () => {
    const dir = tempBin(['my-chrome']);
    assert.strictEqual(findBrowser('my-chrome', dir), path.join(dir, 'my-chrome'));
  });

  it('takes a configured absolute path only if it is executable', () => {
    const dir = tempBin(['edge']);
    const file = path.join(dir, 'edge');
    assert.strictEqual(findBrowser(file, ''), file);
    fs.chmodSync(file, 0o644);
    assert.strictEqual(findBrowser(file, ''), null);
  });

  it('returns null when nothing is found', () => {
    assert.strictEqual(findBrowser('', tempBin([])), null);
    assert.strictEqual(findBrowser('relative/chrome', tempBin(['chrome'])), null);
  });
});

describe('backendName', () => {
  it('is fido2 unless browser is asked for', () => {
    assert.strictEqual(backendName({}), 'fido2');
    assert.strictEqual(backendName({ auth: { webauthn: { backend: 'other' } } }), 'fido2');
    assert.strictEqual(backendName({ auth: { webauthn: { backend: 'browser' } } }), 'browser');
  });
});

describe('rendererArguments with the browser backend', () => {
  const config = { auth: { webauthn: { enabled: true, backend: 'browser', browserPath: '/x/edge' } } };

  it('leaves the page alone when a browser is found, without needing fido2-tools', () => {
    let asked = null;
    const args = rendererArguments(config, {
      platform: 'linux',
      toolsAvailable: () => false,
      browserAvailable: (p) => { asked = p; return true; },
    });
    assert.deepStrictEqual(args, []);
    assert.strictEqual(asked, '/x/edge');
  });

  it('hides WebAuthn when no browser is found', () => {
    const args = rendererArguments(config, { platform: 'linux', toolsAvailable: () => true, browserAvailable: () => false });
    assert.deepStrictEqual(args, [NO_BACKEND_ARG]);
  });
});

describe('metadataPageUrl', () => {
  it('uses a static same-origin JSON page for each Microsoft login host', () => {
    assert.strictEqual(browserBackend.metadataPageUrl('https://login.microsoft.com'),
      'https://login.microsoft.com/common/v2.0/.well-known/openid-configuration');
    assert.strictEqual(browserBackend.metadataPageUrl('https://login.microsoftonline.com'),
      'https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration');
    assert.strictEqual(browserBackend.metadataPageUrl('https://login.live.com'),
      'https://login.live.com/.well-known/openid-configuration');
  });

  it('falls back to the root page for other origins', () => {
    assert.strictEqual(browserBackend.metadataPageUrl('https://sso.example.com'), 'https://sso.example.com/');
  });

  // The URL becomes a browser command-line argument (--app=...).
  it('refuses anything but an exact https origin', () => {
    for (const bad of ['http://login.microsoft.com', 'https://user@login.microsoft.com', 'https://login.microsoft.com/path',
      'https://login.microsoft.com/', '--headless', 'javascript:alert(1)', 'https://login.microsoft.com ', '', undefined]) {
      assert.throws(() => browserBackend.metadataPageUrl(bad), /SecurityError/, String(bad));
    }
  });
});

describe('buildGetScript', () => {
  // Runs the page script against a stub navigator.credentials.get().
  async function run(options, credential) {
    let seen = null;
    const context = vm.createContext({
      atob, btoa, Uint8Array,
      navigator: { credentials: { get: async (o) => { seen = o; if (credential instanceof Error) throw credential; return credential; } } },
    });
    const value = await vm.runInContext(browserBackend._buildGetScript(options), context);
    // Objects made in the sandbox have its prototypes; compare plain copies.
    const plain = (o) => JSON.parse(JSON.stringify(o));
    const seenPlain = seen && { publicKey: { ...plain(seen.publicKey), challenge: seen.publicKey.challenge,
      allowCredentials: seen.publicKey.allowCredentials.map((c) => ({ ...plain(c), id: c.id })) } };
    return { value: plain(value), seen: seenPlain };
  }

  const challenge = b64u(Buffer.from('challenge-bytes'));
  const credId = Buffer.from([1, 2, 3, 250, 251]);
  const credential = {
    id: b64u(credId), rawId: new Uint8Array(credId).buffer, type: 'public-key', authenticatorAttachment: 'cross-platform',
    response: {
      authenticatorData: new Uint8Array([9, 8, 7]).buffer,
      clientDataJSON: new TextEncoder().encode('{"type":"webauthn.get"}').buffer,
      signature: new Uint8Array([4, 5]).buffer,
      userHandle: new Uint8Array([6]).buffer,
    },
  };

  it('passes challenge, rpId, allowCredentials, userVerification and timeout to the browser', async () => {
    const { seen } = await run({
      challenge, rpId: 'login.microsoft.com', userVerification: 'required', timeout: 90,
      allowCredentials: [{ id: b64u(credId), type: 'public-key', transports: ['hybrid'] }],
    }, credential);
    assert.deepStrictEqual(Buffer.from(seen.publicKey.challenge), Buffer.from('challenge-bytes'));
    assert.strictEqual(seen.publicKey.rpId, 'login.microsoft.com');
    assert.strictEqual(seen.publicKey.userVerification, 'required');
    assert.strictEqual(seen.publicKey.timeout, 90000);
    assert.deepStrictEqual(Buffer.from(seen.publicKey.allowCredentials[0].id), credId);
    assert.deepStrictEqual(seen.publicKey.allowCredentials[0].transports, ['hybrid']);
  });

  it('returns the assertion base64url-encoded, in the fido2Backend shape', async () => {
    const { value } = await run({ challenge, rpId: 'login.microsoft.com' }, credential);
    assert.deepStrictEqual(value, {
      ok: true, credentialId: b64u(credId), rawId: b64u(credId), type: 'public-key', attachment: 'cross-platform',
      authenticatorData: b64u([9, 8, 7]), clientDataJson: b64u(Buffer.from('{"type":"webauthn.get"}')),
      signature: b64u([4, 5]), userHandle: b64u([6]),
    });
  });

  it('reports the browser error by name', async () => {
    const err = Object.assign(new Error('The operation either timed out or was not allowed.'), { name: 'NotAllowedError' });
    const { value } = await run({ challenge }, err);
    assert.deepStrictEqual(value, { ok: false, name: 'NotAllowedError', message: err.message });
  });

  it('embeds options as data, so a hostile value cannot become code', async () => {
    const { seen } = await run({ challenge, rpId: '"); throw 1; ("' }, credential);
    assert.strictEqual(seen.publicKey.rpId, '"); throw 1; ("');
  });
});

describe('getAssertion setup failures', () => {
  const browserPath = path.join(tempBin(['fake-browser']), 'fake-browser');

  it('refuses a bad origin before starting anything', async () => {
    await assert.rejects(browserBackend.getAssertion({ challenge: 'AA', origin: '--headless' }, { browserPath }), /SecurityError/);
  });

  it('does not stay busy when the temporary profile cannot be created', async () => {
    const tmpDir = path.join(os.tmpdir(), 'tfl-no-such-dir-' + process.pid, 'missing');
    const call = () => browserBackend.getAssertion(
      { challenge: 'AA', origin: 'https://login.microsoft.com' }, { browserPath, tmpDir });
    await assert.rejects(call(), { code: 'ENOENT' });
    // Before the fix the second call failed with BUSY_MESSAGE.
    await assert.rejects(call(), { code: 'ENOENT' });
  });
});

// The real thing: a headless browser, Microsoft's real page (network needed),
// and a DevTools virtual authenticator holding a passkey for
// login.microsoft.com. Opt-in, since it needs a browser and the network:
//   WEBAUTHN_BROWSER_IT=1 node --test tests/unit/webauthnBrowserBackend.test.js
// A virtual authenticator skips Chromium's TLS check, so this proves the
// plumbing and the response shape, not that a real page passes that check.
const integration = process.env.WEBAUTHN_BROWSER_IT === '1' && findBrowser(process.env.WEBAUTHN_BROWSER || '');

describe('getAssertion against a real browser', { skip: !integration && 'set WEBAUTHN_BROWSER_IT=1 (needs Chrome/Edge and the network)' }, () => {
  const rpId = 'login.microsoft.com';
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const credId = crypto.randomBytes(16);
  const userHandle = Buffer.from('user-1');

  const addVirtualPasskey = async (cdp, sessionId) => {
    await cdp.call('WebAuthn.enable', {}, sessionId);
    const { authenticatorId } = await cdp.call('WebAuthn.addVirtualAuthenticator', {
      options: { protocol: 'ctap2', transport: 'usb', hasResidentKey: true, hasUserVerification: true,
        isUserVerified: true, automaticPresenceSimulation: true },
    }, sessionId);
    await cdp.call('WebAuthn.addCredential', {
      authenticatorId,
      credential: { credentialId: credId.toString('base64'), isResidentCredential: true, rpId,
        privateKey: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
        userHandle: userHandle.toString('base64'), signCount: 0 },
    }, sessionId);
  };

  it('returns an assertion that verifies against the passkey, for the requesting origin', async () => {
    const challenge = b64u(crypto.randomBytes(32));
    const result = await browserBackend.getAssertion(
      { challenge, rpId, origin: 'https://login.microsoft.com', userVerification: 'required', timeout: 30 },
      { browserPath: process.env.WEBAUTHN_BROWSER || '', headless: true, beforeGet: addVirtualPasskey },
    );
    const clientData = JSON.parse(Buffer.from(result.clientDataJson, 'base64url'));
    assert.strictEqual(clientData.type, 'webauthn.get');
    assert.strictEqual(clientData.challenge, challenge);
    assert.strictEqual(clientData.origin, 'https://login.microsoft.com');
    const authData = Buffer.from(result.authenticatorData, 'base64url');
    assert.deepStrictEqual(authData.subarray(0, 32), crypto.createHash('sha256').update(rpId).digest());
    assert.strictEqual(result.credentialId, b64u(credId));
    assert.strictEqual(result.userHandle, b64u(userHandle));
    const signed = Buffer.concat([authData, crypto.createHash('sha256').update(Buffer.from(result.clientDataJson, 'base64url')).digest()]);
    assert.ok(crypto.verify('sha256', signed, publicKey, Buffer.from(result.signature, 'base64url')), 'signature verifies');
  });

  it('cancels when the request is aborted, and closes the browser', async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 3000);
    // No virtual authenticator: the request would wait for the timeout.
    await assert.rejects(
      browserBackend.getAssertion(
        { challenge: b64u(crypto.randomBytes(32)), rpId, origin: 'https://login.microsoft.com', timeout: 60, abortSignal: controller.signal },
        { browserPath: process.env.WEBAUTHN_BROWSER || '', headless: true },
      ),
      { message: CANCELLED_MESSAGE },
    );
  });

  it('refuses a second request while one is open', async () => {
    const controller = new AbortController();
    const first = browserBackend.getAssertion(
      { challenge: b64u(crypto.randomBytes(32)), rpId, origin: 'https://login.microsoft.com', timeout: 60, abortSignal: controller.signal },
      { browserPath: process.env.WEBAUTHN_BROWSER || '', headless: true },
    );
    await assert.rejects(
      browserBackend.getAssertion({ challenge: 'AA', rpId, origin: 'https://login.microsoft.com' }, { headless: true }),
      { message: browserBackend.BUSY_MESSAGE },
    );
    controller.abort();
    await assert.rejects(first, { message: CANCELLED_MESSAGE });
  });
});
