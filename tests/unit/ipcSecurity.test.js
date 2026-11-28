'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const { installIpcSecurity } = require('../../app/security/ipcSecurity');

// Any-sender channels: the tests using these are about registration and
// removal, not about who sent the message, and they emit bare events.
const ALLOWED = 'get-zoom-level';
const OTHER_ALLOWED = 'get-config';
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
const silent = { error() {}, warn() {} };
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

  // A fired once() has to drop its own record. Popping the newest instead makes
  // it consume a later on()'s record, and that on() can then never be removed.
  it('lets a fired once() drop its own registration, not a later on()', () => {
    const ipcMain = fakeIpcMain();
    installIpcSecurity(ipcMain, silent);
    let calls = 0;
    const handler = () => { calls++; };

    ipcMain.once(ALLOWED, handler);
    ipcMain.on(ALLOWED, handler);
    ipcMain.emit(ALLOWED, {});
    assert.strictEqual(calls, 2);
    assert.strictEqual(ipcMain.listenerCount(ALLOWED), 1);

    ipcMain.removeListener(ALLOWED, handler);

    assert.strictEqual(ipcMain.listenerCount(ALLOWED), 0);
  });

  // The screen-share pickers register their reply with once() and remove it
  // when the window closes without a choice. If that removal misses, every
  // cancelled picker leaves a listener behind.
  it('removes a once() listener that has not fired yet', () => {
    const ipcMain = fakeIpcMain();
    installIpcSecurity(ipcMain, silent);
    let calls = 0;
    const handler = () => { calls++; };

    ipcMain.once(ALLOWED, handler);
    ipcMain.removeListener(ALLOWED, handler);
    ipcMain.emit(ALLOWED, {});

    assert.strictEqual(calls, 0);
    assert.strictEqual(ipcMain.listenerCount(ALLOWED), 0);
  });

  it('clears only the channel removeAllListeners was given', () => {
    const ipcMain = fakeIpcMain();
    installIpcSecurity(ipcMain, silent);
    const handler = () => {};

    ipcMain.on(ALLOWED, handler);
    ipcMain.on(OTHER_ALLOWED, handler);
    ipcMain.removeAllListeners(OTHER_ALLOWED);

    assert.strictEqual(ipcMain.listenerCount(OTHER_ALLOWED), 0);
    assert.strictEqual(ipcMain.listenerCount(ALLOWED), 1);
  });

  // EventEmitter branches on arguments.length, so a wrapper that forwards an
  // explicit `undefined` clears nothing at all.
  it('clears every channel when removeAllListeners is called with no arguments', () => {
    const ipcMain = fakeIpcMain();
    installIpcSecurity(ipcMain, silent);
    const handler = () => {};

    ipcMain.on(ALLOWED, handler);
    ipcMain.on(OTHER_ALLOWED, handler);
    ipcMain.removeAllListeners();

    assert.strictEqual(ipcMain.listenerCount(ALLOWED), 0);
    assert.strictEqual(ipcMain.listenerCount(OTHER_ALLOWED), 0);
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

// GHSA-3vg9-cwq9-p773: the Teams page could reach the screen-share picker's
// channels and capture the screen with no picker shown. Those channels must
// only answer frames that show a file shipped in the app directory.
describe('IPC security - picker-only channels', () => {
  const PICKER_CHANNEL = 'desktop-capturer-get-sources';
  const appPage = { senderFrame: { url: pathToFileURL(path.join(__dirname, '..', '..', 'app', 'screenSharing', 'index.html')).href } };

  for (const [label, event] of [
    ['a remote page', { senderFrame: { url: 'https://teams.microsoft.com/v2/' } }],
    ['a file outside the app directory', { senderFrame: { url: 'file:///tmp/evil.html' } }],
    ['a sender with no frame', {}],
  ]) {
    it(`rejects invoke requests from ${label}`, async () => {
      const ipcMain = fakeIpcMain();
      installIpcSecurity(ipcMain, silent);
      let called = false;
      ipcMain.handle(PICKER_CHANNEL, () => { called = true; });

      await assert.rejects(
        () => ipcMain.invokeHandlers.get(PICKER_CHANNEL)(event, { types: ['screen'] }),
        /Unauthorized IPC channel/,
      );
      assert.strictEqual(called, false);
    });
  }

  it('drops picker events sent by a remote page', () => {
    const ipcMain = fakeIpcMain();
    installIpcSecurity(ipcMain, silent);
    let called = false;
    ipcMain.once('selected-source', () => { called = true; });

    ipcMain.emit('selected-source', { senderFrame: { url: 'https://teams.microsoft.com/v2/' } }, { id: 'screen:0' });
    assert.strictEqual(called, false);
  });

  // The once() wrapper checks the sender first and removes itself only for an
  // allowed event, so a rejected event cannot spend the picker's listener.
  it('keeps a once() listener armed after a rejected event, then fires it once', () => {
    const ipcMain = fakeIpcMain();
    installIpcSecurity(ipcMain, silent);
    const received = [];
    ipcMain.once('selected-source', (_event, source) => received.push(source.id));

    ipcMain.emit('selected-source', { senderFrame: { url: 'https://teams.microsoft.com/v2/' } }, { id: 'spoofed' });
    ipcMain.emit('selected-source', appPage, { id: 'screen:1' });
    ipcMain.emit('selected-source', appPage, { id: 'screen:2' });

    assert.deepStrictEqual(received, ['screen:1']);
    assert.strictEqual(ipcMain.listenerCount('selected-source'), 0);
  });

  it('serves the picker page itself', async () => {
    const ipcMain = fakeIpcMain();
    installIpcSecurity(ipcMain, silent);
    ipcMain.handle(PICKER_CHANNEL, () => 'sources');

    assert.strictEqual(await ipcMain.invokeHandlers.get(PICKER_CHANNEL)(appPage, { types: ['screen'] }), 'sources');
  });

  it('leaves an any-sender channel open to any page', async () => {
    const ipcMain = fakeIpcMain();
    installIpcSecurity(ipcMain, silent);
    ipcMain.handle(ALLOWED, () => 'result');

    assert.strictEqual(
      await ipcMain.invokeHandlers.get(ALLOWED)({ senderFrame: { url: 'https://teams.microsoft.com/v2/' } }, {}),
      'result',
    );
  });
});

describe('IPC security - listener failures', () => {
  function recordingLogger() {
    const errors = [];
    return { errors, error: (...args) => errors.push(args) };
  }

  it('contains an exception thrown by an on() listener and keeps it registered', () => {
    const ipcMain = fakeIpcMain();
    const logger = recordingLogger();
    installIpcSecurity(ipcMain, logger);
    let calls = 0;
    ipcMain.on(ALLOWED, (_event, payload) => {
      calls += 1;
      return payload.width;
    });

    assert.doesNotThrow(() => ipcMain.emit(ALLOWED, { sender: 'win' }));
    ipcMain.emit(ALLOWED, { sender: 'win' }, { width: 1 });

    assert.strictEqual(calls, 2);
    assert.strictEqual(logger.errors.length, 1);
    assert.ok(logger.errors[0][0].includes(ALLOWED), logger.errors[0][0]);
    assert.strictEqual(logger.errors[0][1].name, 'TypeError');
  });

  it('contains an exception thrown by a once() listener', () => {
    const ipcMain = fakeIpcMain();
    const logger = recordingLogger();
    installIpcSecurity(ipcMain, logger);
    ipcMain.once(ALLOWED, () => {
      const error = new Error("ENOENT: no such file, open '/home/alice/.config/teams-for-linux/settings.json'");
      error.code = 'ENOENT';
      throw error;
    });

    assert.doesNotThrow(() => ipcMain.emit(ALLOWED, { sender: 'win' }, {}));
    assert.strictEqual(logger.errors.length, 1);
    assert.deepStrictEqual(logger.errors[0][1], { name: 'Error', code: 'ENOENT' });
    // Neither the message nor the stack is logged: both can carry a path.
    assert.ok(!JSON.stringify(logger.errors[0]).includes('alice'));
    assert.strictEqual(ipcMain.listenerCount(ALLOWED), 0);
  });

  it('handles the rejection of an async listener', async () => {
    const ipcMain = fakeIpcMain();
    const logger = recordingLogger();
    installIpcSecurity(ipcMain, logger);
    const unhandled = [];
    const onUnhandled = (reason) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
      ipcMain.on(ALLOWED, async () => {
        throw new Error('async boom');
      });
      ipcMain.emit(ALLOWED, { sender: 'win' }, {});
      await new Promise((resolve) => setImmediate(resolve));
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }

    assert.deepStrictEqual(unhandled, []);
    assert.strictEqual(logger.errors.length, 1);
    assert.strictEqual(logger.errors[0][1].name, 'Error');
  });
});

// ADR-035: the preload runs on every page the Teams window shows, so channels
// outside the pinned and any-sender lists answer only the app's own pages and
// trusted web pages.
describe('IPC security - channels that answer trusted pages', () => {
  const CLASS_3 = 'show-notification';
  const trusted = { senderFrame: { url: 'https://teams.microsoft.com/v2/' } };
  const untrusted = { senderFrame: { url: 'https://sso.corp.example/login?user=alice' } };

  function recordingLogger() {
    const warnings = [];
    const errors = [];
    return {
      warnings,
      errors,
      warn: (...args) => warnings.push(args),
      error: (...args) => errors.push(args),
    };
  }

  it('refuses an on() event from an untrusted sender and accepts a trusted one', () => {
    const ipcMain = fakeIpcMain();
    installIpcSecurity(ipcMain, silent);
    const seen = [];
    ipcMain.on(CLASS_3, (_event, payload) => seen.push(payload));

    ipcMain.emit(CLASS_3, untrusted, 'refused');
    ipcMain.emit(CLASS_3, trusted, 'accepted');

    assert.deepStrictEqual(seen, ['accepted']);
  });

  it('refuses a once() event without consuming the listener', () => {
    const ipcMain = fakeIpcMain();
    installIpcSecurity(ipcMain, silent);
    const seen = [];
    ipcMain.once(CLASS_3, (_event, payload) => seen.push(payload));

    ipcMain.emit(CLASS_3, untrusted, 'refused');
    assert.strictEqual(ipcMain.listenerCount(CLASS_3), 1);
    ipcMain.emit(CLASS_3, trusted, 'accepted');
    ipcMain.emit(CLASS_3, trusted, 'again');

    assert.deepStrictEqual(seen, ['accepted']);
    assert.strictEqual(ipcMain.listenerCount(CLASS_3), 0);
  });

  it('rejects a handle() request from an untrusted sender and serves a trusted one', async () => {
    const ipcMain = fakeIpcMain();
    installIpcSecurity(ipcMain, silent);
    let calls = 0;
    ipcMain.handle(CLASS_3, () => { calls += 1; return 'result'; });
    const handler = ipcMain.invokeHandlers.get(CLASS_3);

    await assert.rejects(() => handler(untrusted, {}), /Unauthorized IPC channel/);
    assert.strictEqual(calls, 0);
    assert.strictEqual(await handler(trusted, {}), 'result');
  });

  it('accepts the configured origin through the predicate, resolved on every message', () => {
    const ipcMain = fakeIpcMain();
    let trustedNow = false;
    installIpcSecurity(ipcMain, silent, () => trustedNow);
    const seen = [];
    ipcMain.on(CLASS_3, (_event, payload) => seen.push(payload));

    ipcMain.emit(CLASS_3, untrusted, 'before');
    trustedNow = true;
    ipcMain.emit(CLASS_3, untrusted, 'after');

    assert.deepStrictEqual(seen, ['after']);
  });

  it('lets an in-process emit with no event reach the listener', () => {
    const ipcMain = fakeIpcMain();
    installIpcSecurity(ipcMain, silent);
    let calls = 0;
    ipcMain.on('config-file-changed', () => { calls += 1; });

    ipcMain.emit('config-file-changed');

    assert.strictEqual(calls, 1);
  });

  it('logs the first refusal per channel, with the scheme only, and counts the rest silently', () => {
    const ipcMain = fakeIpcMain();
    const logger = recordingLogger();
    installIpcSecurity(ipcMain, logger);
    ipcMain.on(CLASS_3, () => {});
    ipcMain.on('get-sticker-list', () => {});

    for (let i = 0; i < 5; i += 1) ipcMain.emit(CLASS_3, untrusted, {});
    ipcMain.emit('get-sticker-list', untrusted, {});

    assert.strictEqual(logger.warnings.length, 2);
    assert.ok(logger.warnings[0][0].includes(CLASS_3));
    assert.deepStrictEqual(logger.warnings[0][1], { scheme: 'https' });
    assert.ok(logger.warnings[1][0].includes('get-sticker-list'));
    assert.strictEqual(logger.errors.length, 0);
  });

  it('never logs the sender host, path or query', () => {
    const ipcMain = fakeIpcMain();
    const logger = recordingLogger();
    installIpcSecurity(ipcMain, logger);
    ipcMain.on(CLASS_3, () => {});
    ipcMain.handle('get-sticker-list', () => {});

    ipcMain.emit(CLASS_3, untrusted, {});
    ipcMain.invokeHandlers.get('get-sticker-list')(untrusted, {}).catch(() => {});

    const logged = JSON.stringify([logger.warnings, logger.errors]);
    assert.ok(!logged.includes('sso.corp.example'), logged);
    assert.ok(!logged.includes('alice'), logged);
  });

  it('logs the scheme as unknown when the sender frame is gone', () => {
    const ipcMain = fakeIpcMain();
    const logger = recordingLogger();
    installIpcSecurity(ipcMain, logger);
    ipcMain.on(CLASS_3, () => {});

    ipcMain.emit(CLASS_3, { get senderFrame() { throw new Error('disposed'); } }, {});

    assert.deepStrictEqual(logger.warnings[0][1], { scheme: 'unknown' });
  });

  it('keeps logging unknown-channel rejections at error level every time', () => {
    const ipcMain = fakeIpcMain();
    const logger = recordingLogger();
    installIpcSecurity(ipcMain, logger);
    ipcMain.on(BLOCKED, () => {});

    ipcMain.emit(BLOCKED, trusted, {});
    ipcMain.emit(BLOCKED, trusted, {});

    assert.strictEqual(logger.errors.length, 2);
  });
});
