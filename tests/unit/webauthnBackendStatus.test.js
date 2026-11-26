'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {
  NO_BACKEND_ARG,
  descriptorHasFidoUsagePage,
  hasFido2Tools,
  hasFidoDevice,
  rendererArguments,
} = require('../../app/webauthn/backendStatus');

// Electron has no WebAuthn transport on Linux: with no fido2-tools backend
// the page must not be offered a security key, or Microsoft's sign-in hangs.

describe('rendererArguments', () => {
  const enabled = { auth: { webauthn: { enabled: true } } };
  // Every collaborator is stubbed so results never depend on attached
  // hardware, PATH or the SNAP environment variable.
  const base = { platform: 'linux', fidoDevicePresent: () => false, isSnap: false };
  const withTools = { ...base, toolsAvailable: () => true };
  const withoutTools = { ...base, toolsAvailable: () => false };

  it('flags the default (auth.webauthn.enabled off) on Linux', () => {
    assert.deepStrictEqual(rendererArguments({}, withTools), [NO_BACKEND_ARG]);
  });

  it('flags enabled support when fido2-tools is missing', () => {
    assert.deepStrictEqual(rendererArguments(enabled, withoutTools), [NO_BACKEND_ARG]);
  });

  it('leaves the page alone when the fido2-tools backend will answer', () => {
    assert.deepStrictEqual(rendererArguments(enabled, withTools), []);
  });

  it('keeps native WebAuthn when a security key is plugged in, flag off', () => {
    const env = { ...withoutTools, fidoDevicePresent: () => true };
    assert.deepStrictEqual(rendererArguments({}, env), []);
  });

  it('flags the page when no security key is plugged in, flag off', () => {
    const env = { ...withoutTools, fidoDevicePresent: () => false };
    assert.deepStrictEqual(rendererArguments({}, env), [NO_BACKEND_ARG]);
  });

  it('does not look for a key when the fido2-tools backend will answer', () => {
    const env = { ...withTools, fidoDevicePresent: () => { throw new Error('unexpected'); } };
    assert.deepStrictEqual(rendererArguments(enabled, env), []);
  });

  it('keeps hiding on the snap without looking for a key', () => {
    let called = false;
    const env = { ...withoutTools, isSnap: true, fidoDevicePresent: () => { called = true; return true; } };
    assert.deepStrictEqual(rendererArguments({}, env), [NO_BACKEND_ARG]);
    assert.strictEqual(called, false);
  });

  it('falls back to hiding when the detector throws', () => {
    const env = { ...withoutTools, fidoDevicePresent: () => { throw new Error('EACCES'); } };
    assert.deepStrictEqual(rendererArguments({}, env), [NO_BACKEND_ARG]);
  });

  it('never flags macOS or Windows, where Chromium WebAuthn works', () => {
    for (const platform of ['darwin', 'win32']) {
      assert.deepStrictEqual(rendererArguments({}, { ...withoutTools, platform }), []);
    }
  });
});

describe('FIDO device detection', () => {
  const fidoDescriptor = Buffer.from([0x06, 0xd0, 0xf1, 0x09, 0x01, 0xa1, 0x01, 0xc0]);
  const keyboardDescriptor = Buffer.from([0x05, 0x01, 0x09, 0x06, 0xa1, 0x01, 0x05, 0x07, 0xc0]);

  it('finds the FIDO usage page and ignores other pages', () => {
    assert.strictEqual(descriptorHasFidoUsagePage(fidoDescriptor), true);
    assert.strictEqual(descriptorHasFidoUsagePage(keyboardDescriptor), false);
    assert.strictEqual(descriptorHasFidoUsagePage(Buffer.alloc(0)), false);
  });

  it('scans hidraw descriptors under a class directory', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 't4l-hidraw-'));
    try {
      assert.strictEqual(hasFidoDevice(path.join(root, 'missing')), false);
      const add = (name, bytes) => {
        const dir = path.join(root, name, 'device');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'report_descriptor'), bytes);
      };
      add('hidraw0', keyboardDescriptor);
      fs.mkdirSync(path.join(root, 'hidraw1'));
      assert.strictEqual(hasFidoDevice(root), false);
      add('hidraw2', fidoDescriptor);
      assert.strictEqual(hasFidoDevice(root), true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
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

describe('fido2Backend.isAvailable', () => {
  const { isAvailable } = require('../../app/webauthn/fido2Backend');

  it('agrees with the renderer gate, with and without the binaries on PATH', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 't4l-fido2-'));
    const savedPath = process.env.PATH;
    try {
      process.env.PATH = dir;
      assert.strictEqual(await isAvailable(), false);
      assert.strictEqual(hasFido2Tools(), false);
      for (const tool of ['fido2-cred', 'fido2-assert', 'fido2-token']) {
        fs.writeFileSync(path.join(dir, tool), '#!/bin/sh\n', { mode: 0o755 });
      }
      assert.strictEqual(await isAvailable(), true);
      assert.strictEqual(hasFido2Tools(), true);
    } finally {
      process.env.PATH = savedPath;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
