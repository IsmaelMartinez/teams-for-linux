'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {
  NO_BACKEND_ARG,
  hasFido2Tools,
  rendererArguments,
} = require('../../app/webauthn/backendStatus');

// Electron has no WebAuthn transport on Linux: with no fido2-tools backend
// the page must not be offered a security key, or Microsoft's sign-in hangs.

describe('rendererArguments', () => {
  const enabled = { auth: { webauthn: { enabled: true } } };
  const withTools = { platform: 'linux', toolsAvailable: () => true };
  const withoutTools = { platform: 'linux', toolsAvailable: () => false };

  it('flags the default (auth.webauthn.enabled off) on Linux', () => {
    assert.deepStrictEqual(rendererArguments({}, withTools), [NO_BACKEND_ARG]);
  });

  it('flags enabled support when fido2-tools is missing', () => {
    assert.deepStrictEqual(rendererArguments(enabled, withoutTools), [NO_BACKEND_ARG]);
  });

  it('leaves the page alone when the fido2-tools backend will answer', () => {
    assert.deepStrictEqual(rendererArguments(enabled, withTools), []);
  });

  it('never flags macOS or Windows, where Chromium WebAuthn works', () => {
    for (const platform of ['darwin', 'win32']) {
      assert.deepStrictEqual(rendererArguments({}, { platform, toolsAvailable: () => false }), []);
    }
  });
});

describe('hasFido2Tools', () => {
  function binDir(tools) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fido2-tools-'));
    for (const tool of tools) {
      fs.writeFileSync(path.join(dir, tool), '#!/bin/sh\n', { mode: 0o755 });
    }
    return dir;
  }

  it('needs all three binaries on PATH', () => {
    const all = binDir(['fido2-cred', 'fido2-assert', 'fido2-token']);
    const partial = binDir(['fido2-token']);
    assert.strictEqual(hasFido2Tools(all), true);
    assert.strictEqual(hasFido2Tools(partial), false);
    assert.strictEqual(hasFido2Tools(`${partial}${path.delimiter}${all}`), true);
    assert.strictEqual(hasFido2Tools(''), false);
  });
});

describe('neutralizeIfNoBackend', () => {
  const TOOLS_DIR = path.join(__dirname, '..', '..', 'app', 'browser', 'tools');
  const source = fs.readFileSync(path.join(TOOLS_DIR, 'webauthnOverride.js'), 'utf8');
  const requireFromTools = (id) => require(id.startsWith('.') ? path.resolve(TOOLS_DIR, id) : id);

  function load() {
    const passwordCalls = [];
    const credentials = {
      get: async (options) => { passwordCalls.push(options); return 'native'; },
      create: async (options) => { passwordCalls.push(options); return 'native'; },
    };
    const context = {
      PublicKeyCredential: class {},
      AuthenticatorAssertionResponse: class {},
      AuthenticatorAttestationResponse: class {},
      DOMException,
      console: { debug: () => {}, error: () => {}, info: () => {}, warn: () => {} },
      module: { exports: {} },
      navigator: { credentials },
      process: { platform: 'linux', argv: [] },
      require: requireFromTools,
      window: { addEventListener: () => {} },
    };
    vm.createContext(context);
    new vm.Script(source, { filename: 'webauthnOverride.js' }).runInContext(context);
    return { context, credentials, passwordCalls, api: context.module.exports };
  }

  it('does nothing without the flag', () => {
    const { context, api } = load();
    api.neutralizeIfNoBackend(['electron']);
    assert.strictEqual(typeof context.PublicKeyCredential, 'function');
  });

  it('hides WebAuthn and refuses public-key requests with NotSupportedError', async () => {
    const { context, credentials, api } = load();
    api.neutralizeIfNoBackend(['electron', NO_BACKEND_ARG]);

    assert.strictEqual(vm.runInContext('typeof PublicKeyCredential', context), 'undefined');
    assert.strictEqual(vm.runInContext('typeof AuthenticatorAssertionResponse', context), 'undefined');
    for (const call of ['get', 'create']) {
      await assert.rejects(credentials[call]({ publicKey: {} }), { name: 'NotSupportedError' });
    }
  });

  it('keeps password credentials working', async () => {
    const { credentials, passwordCalls, api } = load();
    api.neutralizeIfNoBackend([NO_BACKEND_ARG]);
    assert.strictEqual(await credentials.get({ password: true }), 'native');
    assert.deepStrictEqual(passwordCalls, [{ password: true }]);
  });

  it('stops init() from routing requests to an IPC handler that does not exist', async () => {
    const { credentials, api } = load();
    api.neutralizeIfNoBackend([NO_BACKEND_ARG]);
    let invoked = false;
    api.init({ auth: { webauthn: { enabled: true } } }, { invoke: async () => { invoked = true; } });
    await assert.rejects(credentials.get({ publicKey: {} }), { name: 'NotSupportedError' });
    assert.strictEqual(invoked, false);
  });
});
