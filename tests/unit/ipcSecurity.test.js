'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');

const { installIpcSecurity } = require('../../app/security/ipcSecurity');

const ALLOWED = 'webauthn:touch-cancel';
const BLOCKED = 'not-an-allowlisted-channel';

/**
 * An ipcMain stand-in: the real one is an EventEmitter with `handle` bolted on,
 * which is exactly the surface installIpcSecurity() wraps.
 */
function fakeIpcMain() {
  const emitter = new EventEmitter();
  emitter.invokeHandlers = new Map();
  emitter.handle = (channel, handler) => emitter.invokeHandlers.set(channel, handler);
  return emitter;
}

// validateIpcChannel warns on the console for every blocked channel, and the
// wrapper logs its own line. Neither is what is under test.
const silent = { error() {} };
let originalWarn;

beforeEach(() => {
  originalWarn = console.warn;
  console.warn = () => {};
});

afterEach(() => {
  console.warn = originalWarn;
});

describe('IPC security - listener removal', () => {
  // Registration replaces the caller's function with a validating wrapper, so
  // without matching support in removeListener nothing can ever be unregistered
  // and every per-window listener outlives its window.
  it('removes a listener that was registered through the wrapper', () => {
    const ipcMain = fakeIpcMain();
    installIpcSecurity(ipcMain, silent);
    const handler = () => {};

    ipcMain.on(ALLOWED, handler);
    assert.strictEqual(ipcMain.listenerCount(ALLOWED), 1);

    ipcMain.removeListener(ALLOWED, handler);
    assert.strictEqual(ipcMain.listenerCount(ALLOWED), 0);
  });

  it('removes through off() as well', () => {
    const ipcMain = fakeIpcMain();
    installIpcSecurity(ipcMain, silent);
    const handler = () => {};

    ipcMain.on(ALLOWED, handler);
    ipcMain.off(ALLOWED, handler);

    assert.strictEqual(ipcMain.listenerCount(ALLOWED), 0);
  });

  // One security-key ceremony registers and removes one listener. Eleven
  // ceremonies used to be enough for Node to print MaxListenersExceededWarning,
  // with every leaked handler retaining a destroyed BrowserWindow.
  it('leaves nothing behind after many register/remove cycles', () => {
    const ipcMain = fakeIpcMain();
    installIpcSecurity(ipcMain, silent);

    for (let i = 0; i < 20; i++) {
      const handler = () => {};
      ipcMain.on(ALLOWED, handler);
      ipcMain.removeListener(ALLOWED, handler);
    }

    assert.strictEqual(ipcMain.listenerCount(ALLOWED), 0);
  });

  it('removes one instance at a time when the same handler is registered twice', () => {
    const ipcMain = fakeIpcMain();
    installIpcSecurity(ipcMain, silent);
    const handler = () => {};

    ipcMain.on(ALLOWED, handler);
    ipcMain.on(ALLOWED, handler);
    ipcMain.removeListener(ALLOWED, handler);
    assert.strictEqual(ipcMain.listenerCount(ALLOWED), 1);

    ipcMain.removeListener(ALLOWED, handler);
    assert.strictEqual(ipcMain.listenerCount(ALLOWED), 0);
  });

  it('still removes listeners registered before the wrapping was installed', () => {
    const ipcMain = fakeIpcMain();
    const handler = () => {};
    ipcMain.on(ALLOWED, handler);

    installIpcSecurity(ipcMain, silent);
    ipcMain.removeListener(ALLOWED, handler);

    assert.strictEqual(ipcMain.listenerCount(ALLOWED), 0);
  });

  it('does not resurrect a once() listener that already fired', () => {
    const ipcMain = fakeIpcMain();
    installIpcSecurity(ipcMain, silent);
    let calls = 0;
    const handler = () => { calls++; };

    ipcMain.once(ALLOWED, handler);
    ipcMain.emit(ALLOWED, {});
    assert.strictEqual(ipcMain.listenerCount(ALLOWED), 0);

    // The stale bookkeeping entry from the once() would otherwise be handed to
    // removeListener here, leaving the on() registration in place.
    ipcMain.on(ALLOWED, handler);
    ipcMain.removeListener(ALLOWED, handler);

    ipcMain.emit(ALLOWED, {});
    assert.strictEqual(calls, 1);
    assert.strictEqual(ipcMain.listenerCount(ALLOWED), 0);
  });
});

describe('IPC security - allowlist enforcement', () => {
  it('passes allowlisted events through to the handler', () => {
    const ipcMain = fakeIpcMain();
    installIpcSecurity(ipcMain, silent);
    const seen = [];

    ipcMain.on(ALLOWED, (event, payload) => seen.push([event, payload]));
    ipcMain.emit(ALLOWED, { sender: 'win' }, { ok: true });

    assert.deepStrictEqual(seen, [[{ sender: 'win' }, { ok: true }]]);
  });

  it('drops events on channels that are not allowlisted', () => {
    const ipcMain = fakeIpcMain();
    const logged = [];
    installIpcSecurity(ipcMain, { error: (msg) => logged.push(msg) });
    let called = false;

    ipcMain.on(BLOCKED, () => { called = true; });
    ipcMain.emit(BLOCKED, {});

    assert.strictEqual(called, false);
    assert.match(logged[0], /Rejected event for channel: not-an-allowlisted-channel/);
  });

  it('drops once() events on channels that are not allowlisted', () => {
    const ipcMain = fakeIpcMain();
    installIpcSecurity(ipcMain, silent);
    let called = false;

    ipcMain.once(BLOCKED, () => { called = true; });
    ipcMain.emit(BLOCKED, {});

    assert.strictEqual(called, false);
  });

  it('rejects invoke requests on channels that are not allowlisted', async () => {
    const ipcMain = fakeIpcMain();
    installIpcSecurity(ipcMain, silent);
    let called = false;

    ipcMain.handle(BLOCKED, () => { called = true; });

    await assert.rejects(
      () => ipcMain.invokeHandlers.get(BLOCKED)({}, {}),
      /Unauthorized IPC channel: not-an-allowlisted-channel/,
    );
    assert.strictEqual(called, false);
  });

  it('passes allowlisted invoke requests through', async () => {
    const ipcMain = fakeIpcMain();
    installIpcSecurity(ipcMain, silent);

    ipcMain.handle(ALLOWED, () => 'result');

    assert.strictEqual(await ipcMain.invokeHandlers.get(ALLOWED)({}, {}), 'result');
  });

  // The allowlist check also strips prototype-pollution vectors from payloads,
  // which only happens if the wrapper is the thing being invoked.
  it('sanitizes the payload before the handler sees it', () => {
    const ipcMain = fakeIpcMain();
    installIpcSecurity(ipcMain, silent);
    let received;

    ipcMain.on(ALLOWED, (_event, payload) => { received = payload; });
    const payload = JSON.parse('{"safe": 1, "__proto__": {"polluted": true}}');
    ipcMain.emit(ALLOWED, {}, payload);

    assert.strictEqual(Object.hasOwn(received, '__proto__'), false);
    assert.strictEqual(received.safe, 1);
  });
});
