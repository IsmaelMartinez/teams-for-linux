'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

const {
  createAuthRecovery,
  ROOT_SURFACE,
  AUTH_SIGNAL_STORE_KEY,
} = require('../../app/mainAppWindow/authRecovery');
const { createCallRegistry } = require('../../app/mainAppWindow/callRegistry');

// In-app auth recovery (#2622) with per-surface state: the root window
// (Profile 0, the only surface without multi-account) and each multi-account
// profile view (ADR-020). Electron is not loaded: the module takes its clock,
// timers, settings store, webContents and dialog as dependencies.

const RELIABLE = 'InteractionRequired: acquireTokenV2 needs user interaction';
const WORKER_UPR = 'Uncaught Error: UPR: token refresh failed';
const TRUSTED_WORKER = 'https://teams.cloud.microsoft/v2/worker/precompiled-web-worker.js';
const TEAMS_URL = 'https://teams.cloud.microsoft';
const MINUTE = 60 * 1000;

let nextId;

class FakeWebContents {
  constructor() {
    this.id = nextId++;
    this.session = { owner: this.id };
    this.executed = [];
    this.loads = [];
    this.destroyed = false;
    this.listeners = {};
  }
  on(event, cb) {
    (this.listeners[event] ||= []).push(cb);
  }
  once(event, cb) {
    const wrapped = (...args) => {
      this.removeListener(event, wrapped);
      cb(...args);
    };
    // As EventEmitter does, so removeListener(cb) finds a once() listener.
    wrapped.listener = cb;
    this.on(event, wrapped);
  }
  removeListener(event, cb) {
    this.listeners[event] = (this.listeners[event] || []).filter(
      (l) => l !== cb && l.listener !== cb
    );
  }
  emit(event, ...args) {
    for (const cb of [...(this.listeners[event] || [])]) cb(...args);
  }
  listenerCount(event) {
    return (this.listeners[event] || []).length;
  }
  isDestroyed() {
    return this.destroyed;
  }
  async executeJavaScript(code) {
    this.executed.push(code);
    return 3;
  }
  loadURL(url, options) {
    this.loads.push({ url, options });
    return Promise.resolve();
  }
  destroy() {
    this.destroyed = true;
    this.emit('destroyed');
  }
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

function build({ reauth = true } = {}) {
  const h = {
    clock: 1_000_000_000,
    timers: [],
    soon: [],
    store: new Map(),
    storeWrites: [],
    cleaned: [],
    prompts: [],
    promptResponse: 2,
    root: new FakeWebContents(),
    config: {
      url: TEAMS_URL,
      chromeUserAgent: 'UA',
      auth: { reauthRecovery: { enabled: reauth } },
    },
  };
  h.calls = createCallRegistry();
  const settingsStore = {
    get: (key) => h.store.get(key),
    set: (key, value) => {
      h.storeWrites.push(key);
      h.store.set(key, value);
    },
  };
  h.recovery = createAuthRecovery({
    getConfig: () => h.config,
    getSettingsStore: () => settingsStore,
    getRootWebContents: () => h.root,
    cleanAuthCookies: async (session, force = false) => {
      h.cleaned.push({ session, force });
      if (force) h.onForceClean?.(session);
      return { cleaned: 0, total: 0, expired: 0 };
    },
    showMessageBox: async (options) => {
      h.prompts.push(options);
      return { response: h.promptResponse };
    },
    now: () => h.clock,
    setTimer: (fn, ms) => h.timers.push({ fn, ms }),
    runSoon: (fn) => h.soon.push(fn),
    getActiveCallSenderIds: () => h.calls.activeIds(),
  });
  // What mainAppWindow/index.js does on the teams-call-* events and on the
  // root window's did-navigate.
  // A call event without a sender is the root window's.
  h.callStart = (sender) => {
    const caller = sender ?? h.root;
    h.calls.connected(caller);
    h.recovery.onCallConnected(caller);
  };
  h.callEnd = (sender) => {
    const caller = sender ?? h.root;
    h.calls.disconnected(caller);
    return h.recovery.onCallDisconnected(caller);
  };
  h.navigateRoot = () => {
    h.root.emit('did-navigate');
    h.recovery.onNavigated(ROOT_SURFACE);
  };
  // Runs every pending timer and setImmediate callback, then lets the async
  // recovery they started finish.
  h.runPending = async () => {
    const pending = [...h.timers.splice(0), ...h.soon.splice(0).map((fn) => ({ fn }))];
    for (const { fn } of pending) fn();
    for (let i = 0; i < 5; i++) await flush();
  };
  h.advance = (ms) => {
    h.clock += ms;
  };
  return h;
}

// Multi-account: the root window is Profile 0 ('p0'); `addView` creates a
// profile view registered with the same owner map ProfileViewManager keeps.
function withProfiles(h, { rootProfileId = 'p0' } = {}) {
  const owner = new Map();
  if (rootProfileId) owner.set(h.root.id, rootProfileId);
  const names = { p0: 'Work', pa: 'Client A', pb: 'Client B' };
  h.recovery.setProfiles({
    resolveProfileId: (wc) => owner.get(wc?.id) ?? null,
    getStartUrl: (id) => `${TEAMS_URL}/?start=${id}`,
    getProfileName: (id) => names[id] ?? null,
  });
  h.owner = owner;
  h.addView = (profileId) => {
    const wc = new FakeWebContents();
    owner.set(wc.id, profileId);
    h.startupClean = h.recovery.addProfileView(profileId, wc);
    return wc;
  };
  h.addPopup = (profileId) => {
    const wc = new FakeWebContents();
    owner.set(wc.id, profileId);
    return wc;
  };
  return h;
}

function untouched(wc) {
  return wc.executed.length === 0 && wc.loads.length === 0;
}

function assertRecovered(h, wc, url) {
  assert.strictEqual(wc.executed.length, 1, 'localStorage cleared in that renderer');
  assert.match(wc.executed[0], /localStorage\.removeItem/);
  assert.ok(
    h.cleaned.some((c) => c.session === wc.session && c.force === true),
    'that session\'s auth cookies force-cleaned'
  );
  assert.deepStrictEqual(wc.loads, [{ url, options: { userAgent: 'UA' } }]);
}

let infoLogs;
let originalInfo;
let originalDebug;

beforeEach(() => {
  nextId = 1;
  infoLogs = [];
  originalInfo = console.info;
  originalDebug = console.debug;
  console.info = (...args) => infoLogs.push(args);
  console.debug = () => {};
});

afterEach(() => {
  console.info = originalInfo;
  console.debug = originalDebug;
});

describe('auth recovery without multi-account (flag-off parity)', () => {
  it('a reliable signal from any renderer recovers the root window after 5 s, with the pre-split logs', async () => {
    const h = build();
    const stranger = new FakeWebContents();
    h.recovery.onRendererError(RELIABLE, undefined, stranger);

    assert.strictEqual(h.timers.length, 1);
    assert.strictEqual(h.timers[0].ms, 5000);
    assert.deepStrictEqual(infoLogs, [
      ['[AUTH_RECOVERY] Auth failure detected, scheduling recovery'],
    ]);
    await h.runPending();

    assertRecovered(h, h.root, TEAMS_URL);
    assert.ok(untouched(stranger));
    assert.deepStrictEqual(infoLogs.map((args) => args.length === 1 ? args[0] : args), [
      '[AUTH_RECOVERY] Auth failure detected, scheduling recovery',
      '[AUTH_RECOVERY] Clearing auth state and reloading...',
      ['[AUTH_RECOVERY] Cleared localStorage auth entries', { count: 3 }],
      '[AUTH_RECOVERY] Reloading for fresh auth...',
    ]);
  });

  it('does nothing at all with auth.reauthRecovery off', () => {
    const h = build({ reauth: false });
    h.recovery.onRendererError(RELIABLE, undefined, h.root);
    h.recovery.onSurfaceMessage(ROOT_SURFACE, RELIABLE, '');
    assert.deepStrictEqual(h.timers, []);
    assert.deepStrictEqual(h.storeWrites, []);
    assert.strictEqual(h.recovery.shouldInterceptPopup(ROOT_SURFACE), false);
  });

  it('persists the root signal under the unchanged key, throttled to one write per 5 min', () => {
    const h = build();
    assert.strictEqual(AUTH_SIGNAL_STORE_KEY, 'authRecovery.lastFailureSignalAt');
    h.recovery.onSurfaceMessage(ROOT_SURFACE, WORKER_UPR, TRUSTED_WORKER);
    h.advance(MINUTE);
    h.recovery.onSurfaceMessage(ROOT_SURFACE, WORKER_UPR, TRUSTED_WORKER);
    assert.deepStrictEqual(h.storeWrites, ['authRecovery.lastFailureSignalAt']);
    assert.strictEqual(h.store.get('authRecovery.lastFailureSignalAt'), h.clock - MINUTE);
    h.advance(5 * MINUTE);
    h.recovery.onSurfaceMessage(ROOT_SURFACE, WORKER_UPR, TRUSTED_WORKER);
    assert.strictEqual(h.storeWrites.length, 2);
  });

  it('restores the persisted root signal, so popup correlation survives a restart', () => {
    const h = build();
    h.store.set('authRecovery.lastFailureSignalAt', h.clock - 10 * MINUTE);
    assert.strictEqual(h.recovery.shouldInterceptPopup(ROOT_SURFACE), false);
    h.recovery.restoreFailureSignal();
    assert.strictEqual(h.recovery.shouldInterceptPopup(ROOT_SURFACE), true);
    h.advance(60 * MINUTE);
    assert.strictEqual(h.recovery.shouldInterceptPopup(ROOT_SURFACE), false);
  });

  it('a worker UPR only feeds popup correlation and never reloads on its own', async () => {
    const h = build();
    h.recovery.onSurfaceMessage(ROOT_SURFACE, WORKER_UPR, TRUSTED_WORKER);
    assert.deepStrictEqual(h.timers, []);
    assert.strictEqual(h.recovery.shouldInterceptPopup(ROOT_SURFACE), true);
    await h.runPending();
    assert.ok(untouched(h.root));
  });

  it('ignores a signal from an untrusted script', () => {
    const h = build();
    h.recovery.onSurfaceMessage(ROOT_SURFACE, RELIABLE, 'https://evil.example/x.js');
    assert.deepStrictEqual(h.timers, []);
    assert.strictEqual(h.recovery.shouldInterceptPopup(ROOT_SURFACE), false);
  });

  it('cools down for 30 min after an automatic recovery', () => {
    const h = build();
    h.recovery.onSurfaceMessage(ROOT_SURFACE, RELIABLE, '');
    h.advance(29 * MINUTE);
    h.recovery.onSurfaceMessage(ROOT_SURFACE, RELIABLE, '');
    assert.strictEqual(h.timers.length, 1);
    h.advance(MINUTE);
    h.recovery.onSurfaceMessage(ROOT_SURFACE, RELIABLE, '');
    assert.strictEqual(h.timers.length, 2);
  });

  it('mid-call: prompts with the generic message, queues on "After the call", runs at call end', async () => {
    const h = build();
    h.callStart(h.root);
    assert.strictEqual(h.calls.active, true);
    h.promptResponse = 1;
    h.recovery.onSurfaceMessage(ROOT_SURFACE, RELIABLE, '');
    await flush();
    assert.deepStrictEqual(h.timers, [], 'no silent reload during a call');
    assert.strictEqual(h.prompts.length, 1);
    assert.strictEqual(h.prompts[0].message, 'Teams needs you to sign in again.');

    const recovering = h.callEnd(h.root);
    assert.strictEqual(recovering, h.root);
    assert.strictEqual(h.calls.active, false);
    assert.strictEqual(h.timers.length, 1);
    assert.strictEqual(h.timers[0].ms, 5000);
    await h.runPending();
    assertRecovered(h, h.root, TEAMS_URL);
  });

  it('a call-disconnect with nothing queued returns null and runs nothing', () => {
    const h = build();
    h.callStart(null);
    assert.strictEqual(h.callEnd(null), null);
    assert.deepStrictEqual(h.timers, []);
  });

  it('a root navigation ends the root call and drops a queued recovery', async () => {
    const h = build();
    h.callStart(h.root);
    h.promptResponse = 1;
    h.recovery.onSurfaceMessage(ROOT_SURFACE, RELIABLE, '');
    await flush();
    h.navigateRoot();
    assert.strictEqual(h.calls.active, false);
    assert.strictEqual(h.callEnd(h.root), null);
  });

  it('resume cleans the root session only (not forced)', async () => {
    const h = build();
    await h.recovery.cleanAfterResume();
    assert.deepStrictEqual(h.cleaned, [{ session: h.root.session, force: false }]);
  });
});

describe('auth recovery with multi-account', () => {
  it('a signal from profile B recovers B on its own start page, never the root window', async () => {
    const h = withProfiles(build());
    const a = h.addView('pa');
    const b = h.addView('pb');
    h.recovery.onRendererError(RELIABLE, undefined, b);
    assert.deepStrictEqual(infoLogs[0], [
      '[AUTH_RECOVERY] Auth failure detected, scheduling recovery',
      { isRoot: false },
    ]);
    await h.runPending();

    assertRecovered(h, b, `${TEAMS_URL}/?start=pb`);
    assert.ok(untouched(h.root), 'root window not cleared or reloaded');
    assert.ok(untouched(a));
    assert.ok(!h.cleaned.some((c) => c.force && c.session !== b.session));
  });

  it("a signal from B's popup recovers B (the popup shares B's partition)", async () => {
    const h = withProfiles(build());
    const b = h.addView('pb');
    const popup = h.addPopup('pb');
    h.recovery.onRendererError(RELIABLE, undefined, popup);
    await h.runPending();
    assertRecovered(h, b, `${TEAMS_URL}/?start=pb`);
    assert.ok(untouched(popup));
    assert.ok(untouched(h.root));
  });

  it("B's own console output feeds detection for B", async () => {
    const h = withProfiles(build());
    const b = h.addView('pb');
    b.emit('console-message', { message: RELIABLE, sourceId: '' });
    await h.runPending();
    assertRecovered(h, b, `${TEAMS_URL}/?start=pb`);
    assert.ok(untouched(h.root));
  });

  it('the root window and its popups still recover the root window', async () => {
    const h = withProfiles(build());
    h.addView('pb');
    const rootPopup = h.addPopup('p0');
    h.recovery.onRendererError(RELIABLE, undefined, rootPopup);
    await h.runPending();
    assertRecovered(h, h.root, TEAMS_URL);
  });

  it('an unattributable sender does nothing: no recovery, no state, no persisted write', async () => {
    const h = withProfiles(build(), { rootProfileId: null });
    const b = h.addView('pb');
    const strangers = [new FakeWebContents(), undefined, null, { id: 'x' }];
    for (const sender of strangers) {
      h.recovery.onRendererError(RELIABLE, undefined, sender);
      h.recovery.onRendererError(WORKER_UPR, TRUSTED_WORKER, sender);
    }
    // A popup of the root window before Profile 0 exists is unattributable too.
    h.recovery.onRendererError(RELIABLE, undefined, h.addPopup(null));
    await h.runPending();
    assert.deepStrictEqual(h.storeWrites, []);
    assert.ok(untouched(h.root));
    assert.ok(untouched(b));
    assert.strictEqual(h.recovery.shouldInterceptPopup(ROOT_SURFACE), false);
    assert.strictEqual(h.recovery.shouldInterceptPopup('pb'), false);
    assert.strictEqual(h.recovery.shouldInterceptPopup(null), false);
  });

  it('each profile has its own cooldown', () => {
    const h = withProfiles(build());
    const a = h.addView('pa');
    const b = h.addView('pb');
    h.recovery.onRendererError(RELIABLE, undefined, b);
    h.advance(MINUTE);
    h.recovery.onRendererError(RELIABLE, undefined, b);
    assert.strictEqual(h.timers.length, 1, "B's second signal is inside B's cooldown");
    h.recovery.onRendererError(RELIABLE, undefined, a);
    h.recovery.onRendererError(RELIABLE, undefined, h.root);
    assert.strictEqual(h.timers.length, 3, "A and the root window are not held by B's cooldown");
  });

  it("a call in A does not stop B's silent recovery", async () => {
    const h = withProfiles(build());
    const a = h.addView('pa');
    const b = h.addView('pb');
    h.callStart(a);
    h.recovery.onRendererError(RELIABLE, undefined, b);
    await h.runPending();
    assert.deepStrictEqual(h.prompts, []);
    assertRecovered(h, b, `${TEAMS_URL}/?start=pb`);
    assert.ok(untouched(a), "A's call is not reloaded");
  });

  it('a call in B prompts, naming B, instead of reloading silently', async () => {
    const h = withProfiles(build());
    const a = h.addView('pa');
    const b = h.addView('pb');
    h.callStart(b);
    h.recovery.onRendererError(RELIABLE, undefined, b);
    await flush();
    assert.deepStrictEqual(h.timers, []);
    assert.strictEqual(h.prompts.length, 1);
    assert.strictEqual(h.prompts[0].message, 'Teams needs you to sign in again to Client B.');
    // "Not now" (the default response here) leaves every surface alone.
    await h.runPending();
    assert.ok(untouched(b));
    assert.ok(untouched(a));
  });

  it("the root window's prompt names Profile 0", async () => {
    const h = withProfiles(build());
    h.callStart(h.root);
    h.recovery.onSurfaceMessage(ROOT_SURFACE, RELIABLE, '');
    await flush();
    assert.strictEqual(h.prompts[0].message, 'Teams needs you to sign in again to Work.');
  });

  it("'Sign in now' during B's call recovers B only", async () => {
    const h = withProfiles(build());
    const b = h.addView('pb');
    h.callStart(b);
    h.callStart(h.root);
    h.promptResponse = 0;
    h.recovery.onRendererError(RELIABLE, undefined, b);
    for (let i = 0; i < 5; i++) await flush();
    assertRecovered(h, b, `${TEAMS_URL}/?start=pb`);
    assert.ok(untouched(h.root));
  });

  it("B's queued recovery runs when B's call ends, and A's call stays active", async () => {
    const h = withProfiles(build());
    const a = h.addView('pa');
    const b = h.addView('pb');
    h.callStart(a);
    h.callStart(b);
    h.promptResponse = 1;
    h.recovery.onRendererError(RELIABLE, undefined, b);
    await flush();
    assert.strictEqual(h.callEnd(a), null, "A's call end runs nothing");
    assert.strictEqual(h.calls.active, true, "B's call is still on");
    h.callStart(a);
    assert.strictEqual(h.callEnd(b), b);
    assert.strictEqual(h.calls.active, true, "A's call is still on");
    await h.runPending();
    assertRecovered(h, b, `${TEAMS_URL}/?start=pb`);
    assert.ok(untouched(a));
  });

  it("B's navigation resets B's call state, not A's, and drops B's queued recovery", async () => {
    const h = withProfiles(build());
    const a = h.addView('pa');
    const b = h.addView('pb');
    h.callStart(a);
    h.callStart(b);
    h.promptResponse = 1;
    h.recovery.onRendererError(RELIABLE, undefined, b);
    await flush();
    b.emit('did-navigate');
    // B's reload ended B's call, so B's next signal recovers silently.
    h.recovery.onRendererError(RELIABLE, undefined, b);
    assert.strictEqual(h.timers.length, 1);
    assert.strictEqual(h.prompts.length, 1);
    assert.strictEqual(h.callEnd(b), null, 'queued recovery dropped');
    // B is out of its call; A still blocks only A.
    h.recovery.onRendererError(RELIABLE, undefined, a);
    await flush();
    assert.strictEqual(h.prompts.length, 2, "A's call still prompts");
    assert.strictEqual(h.calls.active, true);
    h.navigateRoot();
    assert.strictEqual(h.calls.active, true, "a root reload does not end A's call");
  });

  it("B's queued recovery waits until no renderer of B is in a call", async () => {
    const h = withProfiles(build());
    const b = h.addView('pb');
    const popup = h.addPopup('pb');
    h.callStart(b);
    h.callStart(popup);
    h.promptResponse = 1;
    h.recovery.onRendererError(RELIABLE, undefined, b);
    await flush();
    assert.strictEqual(h.callEnd(b), null, "B's popup is still in the call");
    assert.deepStrictEqual(h.timers, []);
    assert.strictEqual(h.callEnd(popup), b);
    await h.runPending();
    assertRecovered(h, b, `${TEAMS_URL}/?start=pb`);
  });

  it("an intercepted popup asks during its own profile's call, not during another's", async () => {
    const h = withProfiles(build());
    const a = h.addView('pa');
    const b = h.addView('pb');
    h.callStart(a);
    h.callStart(b);
    h.recovery.triggerPopupRecovery('pb', 'Direct login popup intercepted');
    await flush();
    assert.strictEqual(h.prompts.length, 1);
    assert.strictEqual(h.prompts[0].message, 'Teams needs you to sign in again to Client B.');
    assert.deepStrictEqual(h.soon, []);

    h.callEnd(b);
    h.advance(MINUTE);
    h.recovery.triggerPopupRecovery('pb', 'Direct login popup intercepted');
    assert.strictEqual(h.prompts.length, 1, "A's call does not make B ask");
    await h.runPending();
    assertRecovered(h, b, `${TEAMS_URL}/?start=pb`);
    assert.ok(untouched(a));
  });

  it('popup correlation is per profile and recovers the popup owner', async () => {
    const h = withProfiles(build());
    const a = h.addView('pa');
    const b = h.addView('pb');
    h.recovery.onRendererError(WORKER_UPR, TRUSTED_WORKER, b);
    assert.strictEqual(h.recovery.shouldInterceptPopup('pb'), true);
    assert.strictEqual(h.recovery.shouldInterceptPopup('pa'), false);
    assert.strictEqual(h.recovery.shouldInterceptPopup(ROOT_SURFACE), false);

    h.recovery.triggerPopupRecovery('pb', 'Direct login popup intercepted');
    h.recovery.triggerPopupRecovery('pb', 'Direct login popup intercepted');
    assert.strictEqual(h.soon.length, 1, 'deduped within 10 s');
    h.recovery.triggerPopupRecovery(ROOT_SURFACE, 'Direct login popup intercepted');
    assert.strictEqual(h.soon.length, 2, "the root window's dedupe is its own");
    h.soon.pop();
    await h.runPending();
    assertRecovered(h, b, `${TEAMS_URL}/?start=pb`);
    assert.ok(untouched(a));
    assert.ok(untouched(h.root));
  });

  it("a profile's signal stays in memory; the root keeps its persisted key", () => {
    const h = withProfiles(build());
    const b = h.addView('pb');
    h.recovery.onRendererError(WORKER_UPR, TRUSTED_WORKER, b);
    assert.deepStrictEqual(h.storeWrites, []);
    h.recovery.onRendererError(WORKER_UPR, TRUSTED_WORKER, h.root);
    assert.deepStrictEqual(h.storeWrites, ['authRecovery.lastFailureSignalAt']);
  });

  it("removing a profile drops its state and its listeners; a pending recovery does nothing", async () => {
    const h = withProfiles(build());
    const b = h.addView('pb');
    assert.strictEqual(b.listenerCount('console-message'), 1);
    h.callStart(b);
    h.recovery.onRendererError(WORKER_UPR, TRUSTED_WORKER, b);
    b.emit('did-navigate');
    h.recovery.onRendererError(RELIABLE, undefined, b);
    assert.strictEqual(h.timers.length, 1);
    assert.strictEqual(h.recovery.shouldInterceptPopup('pb'), true);

    h.callStart(b);
    b.destroy();
    assert.strictEqual(h.recovery.shouldInterceptPopup('pb'), false);
    assert.strictEqual(h.calls.active, false);
    assert.strictEqual(b.listenerCount('console-message'), 0);
    assert.strictEqual(b.listenerCount('did-navigate'), 0);
    assert.strictEqual(h.recovery.resolveSurface(b), null);

    await h.runPending();
    assert.ok(untouched(b));
    assert.ok(untouched(h.root));
  });

  it('a new view gets its expired auth cookies cleaned (not forced)', async () => {
    const h = withProfiles(build());
    const b = h.addView('pb');
    const result = await h.startupClean;
    assert.deepStrictEqual(result, { cleaned: 0, total: 0, expired: 0 });
    assert.deepStrictEqual(h.cleaned, [{ session: b.session, force: false }]);
  });

  it('resume cleans every live session, root first', async () => {
    const h = withProfiles(build());
    const a = h.addView('pa');
    const b = h.addView('pb');
    const gone = h.addView('pc');
    gone.destroy();
    h.cleaned.length = 0;
    await h.recovery.cleanAfterResume();
    assert.deepStrictEqual(h.cleaned, [
      { session: h.root.session, force: false },
      { session: a.session, force: false },
      { session: b.session, force: false },
    ]);
  });
});

// A recovery decided while the surface had no call runs later (a 5 s timer,
// setImmediate, the async clean). A call that started in between must never be
// ended by a silent reload; only the user's own "Sign in now" goes ahead.
describe('auth recovery when a call starts before the recovery runs', () => {
  it('a call that starts after the automatic recovery is scheduled gets the prompt, not a reload', async () => {
    const h = withProfiles(build());
    const b = h.addView('pb');
    h.recovery.onRendererError(RELIABLE, undefined, b);
    assert.strictEqual(h.timers.length, 1);
    h.callStart(b);
    await h.runPending();
    assert.ok(untouched(b), 'not cleared and not reloaded');
    assert.ok(!h.cleaned.some((c) => c.force), 'no cookies force-cleaned');
    assert.strictEqual(h.prompts.length, 1);
    assert.strictEqual(h.prompts[0].message, 'Teams needs you to sign in again to Client B.');
  });

  it('a call that starts during the clean stops the reload and asks', async () => {
    const h = withProfiles(build());
    const b = h.addView('pb');
    h.onForceClean = (session) => {
      if (session === b.session) h.callStart(b);
    };
    h.recovery.onRendererError(RELIABLE, undefined, b);
    await h.runPending();
    assert.strictEqual(b.executed.length, 1, 'the clean had already started');
    assert.deepStrictEqual(b.loads, [], 'but the reload that would end the call is skipped');
    assert.strictEqual(h.prompts.length, 1);
  });

  it('"Sign in now" still reloads although the call is on', async () => {
    const h = withProfiles(build());
    const b = h.addView('pb');
    h.onForceClean = () => h.callStart(b);
    h.callStart(b);
    h.promptResponse = 0;
    h.recovery.onRendererError(RELIABLE, undefined, b);
    for (let i = 0; i < 5; i++) await flush();
    assertRecovered(h, b, `${TEAMS_URL}/?start=pb`);
  });

  it('a recovery queued for the end of a call waits for a call that starts in the teardown delay', async () => {
    const h = build();
    h.callStart(h.root);
    h.promptResponse = 1;
    h.recovery.onSurfaceMessage(ROOT_SURFACE, RELIABLE, '');
    await flush();
    assert.strictEqual(h.callEnd(h.root), h.root);
    h.callStart(h.root);
    await h.runPending();
    assert.ok(untouched(h.root));
    assert.strictEqual(h.prompts.length, 1, 'the user already chose; no second prompt');
    assert.strictEqual(h.callEnd(h.root), h.root, 'still queued for the new call\'s end');
    await h.runPending();
    assertRecovered(h, h.root, TEAMS_URL);
  });

  it('a queued recovery whose new call starts during the clean waits again', async () => {
    const h = build();
    h.callStart(h.root);
    h.promptResponse = 1;
    h.recovery.onSurfaceMessage(ROOT_SURFACE, RELIABLE, '');
    await flush();
    h.callEnd(h.root);
    h.onForceClean = () => h.callStart(h.root);
    await h.runPending();
    assert.deepStrictEqual(h.root.loads, []);
    h.onForceClean = null;
    assert.strictEqual(h.callEnd(h.root), h.root);
    await h.runPending();
    assert.strictEqual(h.root.loads.length, 1);
  });

  it('a banner-click recovery whose call starts before it runs asks instead of reloading', async () => {
    const h = withProfiles(build());
    const b = h.addView('pb');
    h.callStart(b);
    h.recovery.onRendererError(RELIABLE, undefined, b);
    await flush();
    assert.strictEqual(h.prompts.length, 1, 'first prompt answered "Not now"');
    h.callEnd(b);
    h.recovery.triggerPopupRecovery('pb', 'Direct login popup intercepted');
    h.callStart(b);
    await h.runPending();
    assert.ok(untouched(b));
    assert.strictEqual(h.prompts.length, 2);
  });
});

describe('auth recovery reload failures', () => {
  it('an aborted reload is absorbed and logs neither the URL nor the error', async (t) => {
    const unhandled = [];
    const onUnhandled = (reason) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    t.after(() => process.off('unhandledRejection', onUnhandled));
    // As the console prints them: an Error's message and stack included.
    const { inspect } = require('node:util');
    const lines = [];
    const sink = (...args) => lines.push(args.map((a) => inspect(a)).join(' '));
    for (const level of ['debug', 'info', 'warn', 'error']) t.mock.method(console, level, sink);

    const h = withProfiles(build());
    const b = h.addView('pb');
    b.loadURL = (url) => {
      const error = new Error(`ERR_ABORTED (-3) loading '${url}'`);
      error.code = 'ERR_ABORTED';
      return Promise.reject(error);
    };
    h.recovery.onRendererError(RELIABLE, undefined, b);
    await h.runPending();
    await new Promise((resolve) => setTimeout(resolve, 20));

    assert.deepStrictEqual(unhandled, []);
    assert.ok(lines.some((line) => line.includes('ERR_ABORTED')), 'the code is noted');
    for (const line of lines) {
      assert.ok(!line.includes('start=pb') && !line.includes("loading '"), line);
    }
  });
});
