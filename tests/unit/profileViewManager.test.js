'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

const electronPath = require.resolve('electron');
const pvmPath = require.resolve('../../app/mainAppWindow/profileViewManager');
const mapPath = require.resolve('../../app/mainAppWindow/senderProfileMap');

// ADR-020 Phase 2 foundation: assert ProfileViewManager actually WIRES the
// SenderProfileMap (root id + root profile at initialize, register on view
// creation, cleanup on self-destroyed webContents / profile removal, clear on
// dispose) and that teardown survives a view whose page destroyed its own
// webContents. The pure map is covered in senderProfileMap.test.js. Electron
// is mocked via the repo's require.cache pattern (see downloadManager.test.js).

let nextWcId;
let createdViews;
let partitionSessions; // partition → { clearCalls }
let ipcHandlers; // channel → ipcMain.handle handler

class FakeWebContents {
  constructor() {
    this.id = nextWcId++;
    const cookieListeners = [];
    this.session = {
      clearStorageData: async () => {},
      cookies: {
        listeners: cookieListeners,
        on(event, cb) {
          cookieListeners.push({ event, cb });
        },
      },
    };
    this._once = {};
    this._on = {};
    this._destroyed = false;
  }
  loadURL(...args) {
    (this.loads ||= []).push(args);
    return Promise.resolve();
  }
  getURL() {
    return this.url || 'https://teams.cloud.microsoft/';
  }
  async loadFile() {}
  on(event, cb) {
    (this._on[event] ||= []).push(cb);
  }
  emit(event, ...args) {
    for (const cb of this._on[event] || []) cb(...args);
  }
  once(event, cb) {
    (this._once[event] ||= []).push(cb);
  }
  emitOnce(event) {
    if (event === 'destroyed') this._destroyed = true;
    for (const cb of this._once[event] || []) cb();
    this._once[event] = [];
  }
  removeListener() {}
  send() {}
  getTitle() {
    return this.title ?? '';
  }
  focus() {
    this.focusCalls = (this.focusCalls || 0) + 1;
  }
  isDestroyed() {
    return this._destroyed;
  }
  close() {
    this.closed = true;
    // Model Electron: closing a webContents destroys it, so the production
    // 'destroyed' listener runs on the removal path too. Synchronous here —
    // stricter than Electron's async delivery, which catches reentrancy.
    this.emitOnce('destroyed');
  }
}

class FakeWebContentsView {
  constructor() {
    this.webContents = new FakeWebContents();
    createdViews.push(this);
  }
  setBounds(bounds) {
    this.bounds = bounds;
  }
  setBackgroundColor() {}
  setVisible(visible) {
    this.visible = visible;
  }
  // Mirror Electron's observed behaviour when a page destroys its own
  // webContents: the `destroyed` handlers fire and afterwards the view's
  // `webContents` accessor no longer returns a usable object. Any production
  // code that reads `view.webContents.<x>` after this throws, like it would
  // in the real app.
  destroyWebContents() {
    const wc = this.webContents;
    wc.emitOnce('destroyed');
    this.webContents = undefined;
    return wc;
  }
}

function installElectronMock() {
  require.cache[electronPath] = {
    id: electronPath,
    filename: electronPath,
    loaded: true,
    exports: {
      WebContentsView: FakeWebContentsView,
      session: {
        fromPartition: (partition) => {
          const entry = (partitionSessions[partition] ||= { clearCalls: 0 });
          return {
            cookies: { get: async () => [] },
            clearStorageData: async () => {
              entry.clearCalls++;
            },
          };
        },
      },
      ipcMain: {
        handle(channel, handler) {
          ipcHandlers[channel] = handler;
        },
        on() {},
        removeHandler() {},
        removeListener() {},
      },
    },
  };
}

function fakeWindow() {
  return {
    webContents: new FakeWebContents(),
    listeners: {},
    on(event, cb) {
      (this.listeners[event] ||= []).push(cb);
    },
    emit(event) {
      for (const cb of this.listeners[event] || []) cb();
    },
    once() {},
    removeListener(event, cb) {
      this.listeners[event] = (this.listeners[event] || []).filter((l) => l !== cb);
    },
    focused: true,
    isFocused() {
      return this.focused;
    },
    contentSize: [1200, 800],
    getContentSize() {
      return this.contentSize;
    },
    isDestroyed: () => false,
    contentView: {
      listeners: {},
      on(event, cb) {
        (this.listeners[event] ||= []).push(cb);
      },
      removeListener(event, cb) {
        this.listeners[event] = (this.listeners[event] || []).filter((l) => l !== cb);
      },
      emit(event) {
        for (const cb of this.listeners[event] || []) cb();
      },
      attached: new Set(),
      removed: [],
      addChildView(view) {
        this.attached.add(view);
      },
      removeChildView(view) {
        this.attached.delete(view);
        this.removed.push(view);
      },
    },
  };
}

const LEGACY = { id: 'profile-0', partition: 'persist:teams-4-linux', name: 'My account' };
const PROFILE_A = { id: 'profile-a', partition: 'persist:teams-profile-a', name: 'A' };
const PROFILE_B = { id: 'profile-b', partition: 'persist:teams-profile-b', name: 'B' };

function fakeProfilesManager(profiles) {
  const handlers = {};
  return {
    on(event, handler) {
      (handlers[event] ||= []).push(handler);
    },
    off() {},
    emit(event, payload) {
      for (const h of handlers[event] || []) h(payload);
    },
    list: () => profiles,
    activeId: profiles[0]?.id ?? null,
    getActive() {
      return profiles.find((p) => p.id === this.activeId) ?? null;
    },
    switch(id) {
      this.activeId = id;
      this.emit('switch', profiles.find((p) => p.id === id));
    },
    getLegacyProfile: () =>
      profiles.find((p) => p.partition === LEGACY.partition) ?? null,
  };
}

let ProfileViewManager;

beforeEach(() => {
  nextWcId = 100;
  createdViews = [];
  partitionSessions = {};
  ipcHandlers = {};
  installElectronMock();
  delete require.cache[pvmPath];
  delete require.cache[mapPath];
  ProfileViewManager = require(pvmPath);
});

afterEach(() => {
  delete require.cache[pvmPath];
  delete require.cache[mapPath];
  delete require.cache[electronPath];
});

function build(profiles, bindWindowOpenHandler) {
  const win = fakeWindow();
  const pm = fakeProfilesManager(profiles);
  const pvm = new ProfileViewManager(
    win,
    pm,
    { url: 'https://teams.cloud.microsoft' },
    () => {},
    bindWindowOpenHandler
  );
  pvm.initialize();
  return { win, pm, pvm };
}

describe('ProfileViewManager window-state bounds (#2947)', () => {
  const nextTick = () => new Promise((resolve) => setTimeout(resolve, 10));

  function pillOf(win) {
    return createdViews.find((v) => v !== createdViews[0] && win.contentView.attached.has(v));
  }

  it('re-lays-out profile views and the pill when the contentView bounds change', () => {
    const { win, pm } = build([LEGACY, PROFILE_A]);
    pm.switch(PROFILE_A.id);
    const view = createdViews[0];
    const pill = pillOf(win);
    win.contentSize = [1920, 1080];
    win.contentView.emit('bounds-changed');
    assert.deepStrictEqual(view.bounds, { x: 0, y: 0, width: 1920, height: 1080 });
    assert.deepStrictEqual(pill.bounds, { x: 0, y: 1024, width: 56, height: 56 });
  });

  // X11: the maximize event and any zero-delay tick still see the old size and
  // no `resize` follows; only the contentView's bounds-changed carries the new one.
  it('picks up a content size that only changes after the state event and a tick', async () => {
    const { win, pm } = build([LEGACY, PROFILE_A]);
    pm.switch(PROFILE_A.id);
    const view = createdViews[0];
    win.emit('maximize');
    await nextTick();
    win.contentSize = [1920, 1080];
    win.contentView.emit('bounds-changed');
    assert.deepStrictEqual(view.bounds, { x: 0, y: 0, width: 1920, height: 1080 });
  });

  it('dispose removes the resize and bounds-changed listeners', () => {
    const { win, pm, pvm } = build([LEGACY, PROFILE_A]);
    pm.switch(PROFILE_A.id);
    pvm.dispose();
    assert.strictEqual((win.listeners.resize || []).length, 0);
    assert.strictEqual((win.contentView.listeners['bounds-changed'] || []).length, 0);
  });
});

describe('ProfileViewManager sender attribution wiring', () => {
  it('returns root contents for legacy and active view contents for another profile', () => {
    const { win, pm, pvm } = build([LEGACY, PROFILE_A]);
    assert.strictEqual(pvm.getActiveWebContents(), win.webContents);
    pm.switch(PROFILE_A.id);
    assert.strictEqual(pvm.getActiveWebContents(), createdViews[0].webContents);
  });

  it('fails closed when the selected non-legacy renderer is destroyed', () => {
    const { pm, pvm } = build([LEGACY, PROFILE_A]);
    pm.switch(PROFILE_A.id);
    createdViews[0].destroyWebContents();
    assert.strictEqual(pvm.getActiveWebContents(), null);
  });

  it('returns null when neither selected profile contents nor root is live', () => {
    const { win, pvm } = build([LEGACY]);
    win.webContents._destroyed = true;
    assert.strictEqual(pvm.getActiveWebContents(), null);
  });

  it('resolves the root window to the legacy profile after initialize', () => {
    const { win, pvm } = build([LEGACY, PROFILE_A]);
    assert.strictEqual(pvm.resolveProfileId(win.webContents), 'profile-0');
  });

  it('resolves the root window to null pre-bootstrap, then to Profile 0 when the bootstrap add fires', () => {
    const profiles = [PROFILE_A];
    const { win, pm, pvm } = build(profiles);
    assert.strictEqual(pvm.resolveProfileId(win.webContents), null);
    const viewsBefore = createdViews.length;
    profiles.push(LEGACY);
    pm.emit('add', LEGACY);
    assert.strictEqual(pvm.resolveProfileId(win.webContents), 'profile-0');
    // The legacy profile lives on the root window — no overlay materializes.
    assert.strictEqual(createdViews.length, viewsBefore);
  });

  it('getProfileFor covers the root path: null pre-bootstrap, full record after', () => {
    const profiles = [PROFILE_A];
    const { win, pm, pvm } = build(profiles);
    const event = { sender: { id: win.webContents.id } };
    assert.strictEqual(pvm.getProfileFor(event), null);
    profiles.push(LEGACY);
    pm.emit('add', LEGACY);
    assert.deepStrictEqual(pvm.getProfileFor(event), LEGACY);
  });

  it('root attribution goes quiet again when Profile 0 is removed', () => {
    const profiles = [LEGACY, PROFILE_A];
    const { win, pm, pvm } = build(profiles);
    profiles.splice(profiles.indexOf(LEGACY), 1);
    pm.emit('remove', { removedId: 'profile-0', activeId: 'profile-a' });
    assert.strictEqual(pvm.resolveProfileId(win.webContents), null);
  });

  it('registers materialized profile views and resolves their webContents', () => {
    const { pvm } = build([LEGACY, PROFILE_A]);
    // Views created at initialize: PROFILE_A's view + the switcher pill.
    const profileView = createdViews[0];
    assert.strictEqual(pvm.resolveProfileId(profileView.webContents), 'profile-a');
  });

  it('does not attribute the switcher pill (or unknown senders) to any profile', () => {
    const { pvm } = build([LEGACY, PROFILE_A]);
    const pillView = createdViews[createdViews.length - 1];
    assert.strictEqual(pvm.resolveProfileId(pillView.webContents), null);
    assert.strictEqual(pvm.resolveProfileId({ id: 9999 }), null);
    assert.strictEqual(pvm.resolveProfileId(null), null);
  });

  it('getProfileFor returns the full record for a profile-view sender', () => {
    const { pvm } = build([LEGACY, PROFILE_A]);
    const profileView = createdViews[0];
    assert.deepStrictEqual(
      pvm.getProfileFor({ sender: { id: profileView.webContents.id } }),
      PROFILE_A
    );
  });

  it('unregisters when the view webContents destroys itself (no profile removal)', () => {
    const { pvm } = build([LEGACY, PROFILE_A]);
    const wc = createdViews[0].destroyWebContents();
    assert.strictEqual(pvm.resolveProfileId(wc), null);
  });

  it('removing a profile whose webContents already died does not throw and still clears its partition storage', () => {
    const { pm, pvm } = build([LEGACY, PROFILE_A]);
    const wc = createdViews[0].destroyWebContents();
    assert.doesNotThrow(() =>
      pm.emit('remove', { removedId: 'profile-a', activeId: 'profile-0' })
    );
    assert.strictEqual(pvm.resolveProfileId(wc), null);
    // ADR-020 remove contract: the partition's storage is cleared via the
    // cached partition string, not via the dead webContents.
    assert.strictEqual(
      partitionSessions['persist:teams-profile-a'].clearCalls,
      1
    );
  });

  // #3183: dispose() runs on every window close, so clearing there signed
  // every secondary profile out on each restart.
  it('dispose keeps profile storage; only removing a profile clears it', () => {
    const { pm, pvm } = build([LEGACY, PROFILE_A, PROFILE_B]);
    pm.emit('remove', { removedId: 'profile-b', activeId: 'profile-0' });
    pvm.dispose();
    assert.strictEqual(partitionSessions['persist:teams-profile-a']?.clearCalls ?? 0, 0);
    assert.strictEqual(partitionSessions['persist:teams-profile-b'].clearCalls, 1);
  });

  it('keeps msal.cache.encryption persistent on each profile view session (#3183)', () => {
    build([LEGACY, PROFILE_A, PROFILE_B]);
    // createdViews also holds the switcher chrome view, which hosts no account.
    const counts = createdViews.map(
      (view) => view.webContents.session.cookies.listeners.filter((l) => l.event === 'changed').length
    );
    assert.strictEqual(counts.filter((n) => n === 1).length, 2, 'one listener per profile view');
    assert.ok(counts.every((n) => n <= 1), 'never wired twice');
  });

  it('dispose after a self-destroyed view does not throw and completes cleanup', () => {
    const { win, pvm } = build([LEGACY, PROFILE_A]);
    createdViews[0].destroyWebContents();
    assert.doesNotThrow(() => pvm.dispose());
    assert.strictEqual(pvm.resolveProfileId(win.webContents), null);
  });

  it('unregisters on profile remove', () => {
    const { pm, pvm } = build([LEGACY, PROFILE_A]);
    const profileView = createdViews[0];
    pm.emit('remove', { removedId: 'profile-a', activeId: 'profile-0' });
    assert.strictEqual(pvm.resolveProfileId(profileView.webContents), null);
  });

  it('installs the window-open policy on each profile view (not on the pill), loading into itself', () => {
    const bound = [];
    build([LEGACY, PROFILE_A, PROFILE_B], (target, loadTarget) =>
      bound.push([target, loadTarget])
    );
    const [viewA, viewB] = createdViews;
    const pillView = createdViews[createdViews.length - 1];
    assert.deepStrictEqual(bound, [
      [viewA.webContents, viewA.webContents],
      [viewB.webContents, viewB.webContents],
    ]);
    assert.ok(!bound.some(([t]) => t === pillView.webContents));
  });

  it('attributes a child window opened by a profile view to that profile, until it is destroyed', () => {
    const { pvm } = build([LEGACY, PROFILE_A]);
    const child = { webContents: new FakeWebContents() };
    createdViews[0].webContents.emit('did-create-window', child);
    assert.strictEqual(pvm.resolveProfileId(child.webContents), 'profile-a');
    child.webContents.emitOnce('destroyed');
    assert.strictEqual(pvm.resolveProfileId(child.webContents), null);
  });

  it('attributes a <webview> guest attached in a profile view to that profile, until it is destroyed', () => {
    const { pvm } = build([LEGACY, PROFILE_A]);
    const guest = new FakeWebContents();
    createdViews[0].webContents.emit('did-attach-webview', {}, guest);
    assert.strictEqual(pvm.resolveProfileId(guest), 'profile-a');
    guest.emitOnce('destroyed');
    assert.strictEqual(pvm.resolveProfileId(guest), null);
  });

  it('attributes grandchildren: a popup of a popup, and a popup of a webview guest', () => {
    const { pvm } = build([LEGACY, PROFILE_A]);
    const child = { webContents: new FakeWebContents() };
    createdViews[0].webContents.emit('did-create-window', child);
    const grandchild = { webContents: new FakeWebContents() };
    child.webContents.emit('did-create-window', grandchild);
    assert.strictEqual(pvm.resolveProfileId(grandchild.webContents), 'profile-a');

    const guest = new FakeWebContents();
    createdViews[0].webContents.emit('did-attach-webview', {}, guest);
    const guestPopup = { webContents: new FakeWebContents() };
    guest.emit('did-create-window', guestPopup);
    assert.strictEqual(pvm.resolveProfileId(guestPopup.webContents), 'profile-a');
  });

  it('installs the window-open policy on descendants with the ORIGINATING view as load target', () => {
    const bound = [];
    build([LEGACY, PROFILE_A], (target, loadTarget) => bound.push([target, loadTarget]));
    const view = createdViews[0];
    const child = { webContents: new FakeWebContents() };
    view.webContents.emit('did-create-window', child);
    const grandchild = { webContents: new FakeWebContents() };
    child.webContents.emit('did-create-window', grandchild);
    assert.deepStrictEqual(bound.slice(1), [
      [child.webContents, view.webContents],
      [grandchild.webContents, view.webContents],
    ]);
  });

  it('locks the Document PiP window instead of giving it the profile policy', () => {
    const { PIP_FRAME_NAME } = require('../../app/mainAppWindow/documentPictureInPicture');
    const bound = [];
    const win = fakeWindow();
    const pvm = new ProfileViewManager(
      win,
      fakeProfilesManager([LEGACY, PROFILE_A]),
      { url: 'https://teams.cloud.microsoft', media: { documentPictureInPicture: true } },
      () => {},
      (target) => bound.push(target)
    );
    pvm.initialize();
    const view = createdViews[0];
    const pip = { webContents: new FakeWebContents() };
    pip.webContents.setWindowOpenHandler = (fn) => { pip.openHandler = fn; };
    view.webContents.emit('did-create-window', pip, { url: 'about:blank', frameName: PIP_FRAME_NAME });
    assert.ok(!bound.includes(pip.webContents), 'PiP window must not get the profile policy');
    assert.deepStrictEqual(pip.openHandler({ url: 'https://example.com/' }), { action: 'deny' });
    assert.strictEqual(pip.webContents._on['will-navigate'].length, 1);
    // Still attributed to its profile.
    assert.strictEqual(pvm.resolveProfileId(pip.webContents), 'profile-a');
    // Any other popup keeps the profile policy.
    const other = { webContents: new FakeWebContents() };
    view.webContents.emit('did-create-window', other, { url: 'about:blank', frameName: '' });
    assert.ok(bound.includes(other.webContents));
  });

  it('a deep link loaded from a background profile activates that profile', () => {
    let activateFn = null;
    const { pm } = build([LEGACY, PROFILE_A], (_t, _l, activate) => {
      activateFn = activate;
    });
    assert.strictEqual(pm.getActive().id, 'profile-0');
    activateFn();
    assert.strictEqual(pm.getActive().id, 'profile-a');
    // Idempotent once active.
    activateFn();
    assert.strictEqual(pm.getActive().id, 'profile-a');
  });

  it('removing a profile unregisters AND closes its live descendants (not just on dispose)', () => {
    const { pm, pvm } = build([LEGACY, PROFILE_A]);
    const view = createdViews[0];
    const child = { webContents: new FakeWebContents() };
    view.webContents.emit('did-create-window', child);
    const grandchild = { webContents: new FakeWebContents() };
    child.webContents.emit('did-create-window', grandchild);
    pm.emit('remove', { removedId: 'profile-a', activeId: 'profile-0' });
    assert.strictEqual(pvm.resolveProfileId(child.webContents), null);
    assert.strictEqual(pvm.resolveProfileId(grandchild.webContents), null);
    assert.strictEqual(child.webContents.closed, true);
    assert.strictEqual(grandchild.webContents.closed, true);
  });

  it('a view that destroys itself takes its descendants out of attribution too', () => {
    const { pvm } = build([LEGACY, PROFILE_A]);
    const view = createdViews[0];
    const child = { webContents: new FakeWebContents() };
    view.webContents.emit('did-create-window', child);
    view.destroyWebContents();
    assert.strictEqual(pvm.resolveProfileId(child.webContents), null);
    assert.strictEqual(child.webContents.closed, true);
  });

  it("attributes the root window's descendants to Profile 0 — null pre-bootstrap, the id after", () => {
    const profiles = [PROFILE_A];
    const { win, pm, pvm } = build(profiles);
    const popup = { webContents: new FakeWebContents() };
    win.webContents.emit('did-create-window', popup);
    assert.strictEqual(pvm.resolveProfileId(popup.webContents), null);
    profiles.push(LEGACY);
    pm.emit('add', LEGACY);
    assert.strictEqual(pvm.resolveProfileId(popup.webContents), 'profile-0');
    popup.webContents.emitOnce('destroyed');
    assert.strictEqual(pvm.resolveProfileId(popup.webContents), null);
  });

  it('descendant attribution is dropped on dispose', () => {
    const { pvm } = build([LEGACY, PROFILE_A]);
    const child = { webContents: new FakeWebContents() };
    createdViews[0].webContents.emit('did-create-window', child);
    pvm.dispose();
    assert.strictEqual(pvm.resolveProfileId(child.webContents), null);
  });

  it('isPrimaryProfileSurface: true for root and profile views, false for pill, descendants, and dead views', () => {
    const { win, pvm } = build([LEGACY, PROFILE_A]);
    const profileView = createdViews[0];
    const pillView = createdViews[createdViews.length - 1];
    const popup = { webContents: new FakeWebContents() };
    profileView.webContents.emit('did-create-window', popup);

    const eventFor = (wc) => ({ sender: { id: wc.id } });
    assert.strictEqual(pvm.isPrimaryProfileSurface(eventFor(win.webContents)), true);
    assert.strictEqual(pvm.isPrimaryProfileSurface(eventFor(profileView.webContents)), true);
    assert.strictEqual(pvm.isPrimaryProfileSurface(eventFor(pillView.webContents)), false);
    // The popup attributes to the profile but is NOT a primary surface.
    assert.strictEqual(pvm.resolveProfileId(popup.webContents), 'profile-a');
    assert.strictEqual(pvm.isPrimaryProfileSurface(eventFor(popup.webContents)), false);
    assert.strictEqual(pvm.isPrimaryProfileSurface({}), false);
    // A self-destroyed view keeps its #viewMeta (for removal's storage
    // clear) but must NOT stay primary — a stale primary would let its
    // stashed pre-attach update replay into an unremovable bucket.
    const deadWc = profileView.destroyWebContents();
    assert.strictEqual(pvm.isPrimaryProfileSurface(eventFor(deadWc)), false);
  });

  it('onProfileViewGone fires when a view self-destroys, not on profile removal', () => {
    const { pm, pvm } = build([LEGACY, PROFILE_A, PROFILE_B]);
    const gone = [];
    pvm.onProfileViewGone((profileId) => gone.push(profileId));
    createdViews[0].destroyWebContents(); // PROFILE_A's view dies on its own
    assert.deepStrictEqual(gone, ['profile-a']);
    // Removal closes the view's webContents, which DOES fire 'destroyed'
    // (the fake models that) — but the removal path must stay silent here:
    // it is already observable via ProfilesManager's "remove" event.
    pm.emit('remove', { removedId: 'profile-b', activeId: 'profile-0' });
    assert.strictEqual(createdViews[1].webContents.closed, true);
    assert.deepStrictEqual(gone, ['profile-a']);
  });

  it('dispose clears all attribution including the root window', () => {
    const { win, pvm } = build([LEGACY, PROFILE_A]);
    const profileView = createdViews[0];
    const profileWc = profileView.webContents;
    pvm.dispose();
    assert.strictEqual(pvm.resolveProfileId(win.webContents), null);
    assert.strictEqual(pvm.resolveProfileId(profileWc), null);
  });
});

describe('ProfileViewManager per-view load hook (#2979)', () => {
  it('runs the load hook on every did-finish-load of each profile view, never for the pill', () => {
    const loaded = [];
    const pvm = new ProfileViewManager(
      fakeWindow(),
      fakeProfilesManager([LEGACY, PROFILE_A, PROFILE_B]),
      { url: 'https://teams.cloud.microsoft' },
      () => {},
      () => {},
      (webContents) => loaded.push(webContents)
    );
    pvm.initialize();
    const [viewA, viewB] = createdViews;
    const pillView = createdViews[createdViews.length - 1];

    viewA.webContents.emit('did-finish-load');
    viewB.webContents.emit('did-finish-load');
    // A reload fires did-finish-load again and must re-run the hook, as the
    // root window's own did-finish-load listener does.
    viewA.webContents.emit('did-finish-load');
    pillView.webContents.emit('did-finish-load');

    assert.deepStrictEqual(loaded, [
      viewA.webContents,
      viewB.webContents,
      viewA.webContents,
    ]);
  });

  it('loads the profile URL again instead of the load hook when a view lands on the signed-out page', () => {
    const loaded = [];
    const pvm = new ProfileViewManager(
      fakeWindow(),
      fakeProfilesManager([LEGACY, PROFILE_A]),
      { url: 'https://teams.cloud.microsoft', chromeUserAgent: 'UA' },
      () => {},
      () => {},
      (webContents) => loaded.push(webContents)
    );
    pvm.initialize();
    const [viewA] = createdViews;

    viewA.webContents.url = 'https://login.microsoftonline.com/common/oauth2/v2.0/logout?x=1';
    viewA.webContents.emit('did-finish-load');

    assert.deepStrictEqual(loaded, []);
    assert.deepStrictEqual(viewA.webContents.loads.at(-1), [
      PROFILE_A.url || 'https://teams.cloud.microsoft',
      { userAgent: 'UA' },
    ]);
  });
});

// GHSA-58j7-22f8-6xqp: a profile URL stored before https was enforced must
// not load with the full preload.
describe('ProfileViewManager ignores stored non-https profile URLs', () => {
  it('loads the Teams URL instead, on first load and on the signed-out reload', () => {
    const stale = { ...PROFILE_A, url: 'http://evil.example/' };
    const custom = { ...PROFILE_B, url: 'https://tenant.example/' };
    const pvm = new ProfileViewManager(
      fakeWindow(),
      fakeProfilesManager([LEGACY, stale, custom]),
      { url: 'https://teams.cloud.microsoft', chromeUserAgent: 'UA' },
      () => {},
      () => {}
    );
    pvm.initialize();
    const [viewA, viewB] = createdViews;

    assert.strictEqual(viewA.webContents.loads[0][0], 'https://teams.cloud.microsoft');
    assert.strictEqual(viewB.webContents.loads[0][0], 'https://tenant.example/');

    viewA.webContents.url = 'https://login.microsoftonline.com/common/oauth2/v2.0/logout?x=1';
    viewA.webContents.emit('did-finish-load');
    assert.strictEqual(viewA.webContents.loads.at(-1)[0], 'https://teams.cloud.microsoft');
  });
});

// #3057: on Linux a profile view that loads while detached and is attached
// later paints but never receives input. Views are therefore attached at
// creation and a switch only toggles visibility; nothing is detached.
describe('ProfileViewManager keeps profile views attached (#3057)', () => {
  it('attaches every profile view at creation, visible only when active', () => {
    const { win } = build([PROFILE_A, PROFILE_B]);
    const [viewA, viewB] = createdViews;
    assert.ok(win.contentView.attached.has(viewA));
    assert.ok(win.contentView.attached.has(viewB));
    assert.strictEqual(viewA.visible, true);
    assert.strictEqual(viewB.visible, false);
  });

  it('switches by toggling visibility and focusing, never by detaching', () => {
    const { win, pm } = build([LEGACY, PROFILE_A, PROFILE_B]);
    const [viewA, viewB] = createdViews;

    pm.switch('profile-b');
    assert.strictEqual(viewB.visible, true);
    assert.strictEqual(viewA.visible, false);
    assert.ok(viewB.webContents.focusCalls >= 1);

    pm.switch('profile-0');
    assert.strictEqual(viewA.visible, false);
    assert.strictEqual(viewB.visible, false);
    assert.ok(win.webContents.focusCalls >= 1);

    pm.switch('profile-a');
    assert.strictEqual(viewA.visible, true);
    assert.deepStrictEqual(win.contentView.removed, []);
  });

  it('focuses the active view when its page loads, but not a background one', () => {
    build([PROFILE_A, PROFILE_B]);
    const [viewA, viewB] = createdViews;
    const before = viewA.webContents.focusCalls || 0;
    viewA.webContents.emit('did-finish-load');
    viewB.webContents.emit('did-finish-load');
    assert.strictEqual(viewA.webContents.focusCalls, before + 1);
    assert.strictEqual(viewB.webContents.focusCalls || 0, 0);
  });

  // #3064: a window focus-in (e.g. a keyboard layout switch on X11) must not
  // leave keyboard focus on the root webContents (Profile 0).
  it('refocuses the active profile when the window regains focus, unless the switcher is open', () => {
    const { win, pm } = build([LEGACY, PROFILE_A, PROFILE_B]);
    const [, viewB] = createdViews;
    const chrome = createdViews.at(-1);
    pm.switch('profile-b');
    const before = viewB.webContents.focusCalls;

    win.emit('focus');
    assert.strictEqual(viewB.webContents.focusCalls, before + 1);

    ipcHandlers['profile-switcher-set-expanded']({ sender: chrome.webContents }, true);
    win.emit('focus');
    assert.strictEqual(viewB.webContents.focusCalls, before + 1);
  });

  it('refocuses the active view when the switcher closes, only while the window is focused', () => {
    const { win } = build([PROFILE_A, PROFILE_B]);
    const [viewA] = createdViews;
    const chrome = createdViews.at(-1);
    const setExpanded = ipcHandlers['profile-switcher-set-expanded'];
    const event = { sender: chrome.webContents };

    setExpanded(event, true);
    const before = viewA.webContents.focusCalls || 0;
    viewA.webContents.emit('did-finish-load');
    assert.strictEqual(viewA.webContents.focusCalls || 0, before);

    setExpanded(event, false);
    assert.strictEqual(viewA.webContents.focusCalls, before + 1);

    win.focused = false;
    setExpanded(event, true);
    setExpanded(event, false);
    assert.strictEqual(viewA.webContents.focusCalls, before + 1);
  });

  it('detaches a profile view whose page destroyed its own webContents', () => {
    const { win } = build([PROFILE_A, PROFILE_B]);
    const [, viewB] = createdViews;
    viewB.destroyWebContents();
    assert.ok(!win.contentView.attached.has(viewB));
  });

  it('turns off focus-on-navigation so a background profile cannot take focus', () => {
    const source = require('node:fs').readFileSync(pvmPath, 'utf8');
    assert.match(source, /focusOnNavigation:\s*false/);
  });
});

// #3068: Electron only mirrors the root webContents (Profile 0) onto the
// window title, so the active profile view's title has to be pushed instead.
describe('ProfileViewManager switcher unread push (ADR-020 Phase 2)', () => {
  function recordSends(wc) {
    const sent = [];
    wc.send = (channel, payload) => sent.push({ channel, payload });
    return sent;
  }

  it('pushes per-profile unread to the pill on its own channel', () => {
    const { pvm } = build([LEGACY, PROFILE_A]);
    const chrome = createdViews.at(-1);
    const sent = recordSends(chrome.webContents);
    pvm.updateSwitcherUnread({ 'profile-a': 4 });
    assert.deepStrictEqual(sent, [
      {
        channel: 'profile-switcher-unread',
        payload: { unreadByProfileId: { 'profile-a': 4 } },
      },
    ]);
  });

  it('replays the last snapshot alongside the state push on every pill load', () => {
    const { pvm } = build([LEGACY, PROFILE_A]);
    const chrome = createdViews.at(-1);
    pvm.updateSwitcherUnread({ 'profile-a': 2 });
    const sent = recordSends(chrome.webContents);
    chrome.webContents.emit('did-finish-load');
    chrome.webContents.emit('did-finish-load'); // a reload must not lose the dots
    assert.deepStrictEqual(
      sent.map((m) => m.channel),
      [
        'profile-switcher-state',
        'profile-switcher-unread',
        'profile-switcher-state',
        'profile-switcher-unread',
      ]
    );
    assert.deepStrictEqual(sent[3].payload, {
      unreadByProfileId: { 'profile-a': 2 },
    });
  });

  it('skips the push once the pill is destroyed', () => {
    const { pvm } = build([LEGACY, PROFILE_A]);
    const chrome = createdViews.at(-1);
    const sent = recordSends(chrome.webContents);
    chrome.webContents._destroyed = true;
    pvm.updateSwitcherUnread({ 'profile-a': 1 });
    assert.deepStrictEqual(sent, []);
  });
});

describe('ProfileViewManager window title follows the active profile (#3068)', () => {
  it('sets the title from the active view, ignores background profiles, hands back to Profile 0', () => {
    const titles = [];
    const win = fakeWindow();
    const pm = fakeProfilesManager([LEGACY, PROFILE_A, PROFILE_B]);
    new ProfileViewManager(
      win,
      pm,
      { url: 'https://teams.cloud.microsoft' },
      () => {},
      () => {},
      () => {},
      (title) => titles.push(title)
    ).initialize();
    const [viewA, viewB] = createdViews;
    viewB.webContents.title = 'Chat | B | Microsoft Teams';
    titles.length = 0;

    pm.switch('profile-b');
    assert.deepStrictEqual(titles, ['Chat | B | Microsoft Teams']);

    viewB.webContents.emit('page-title-updated', {}, '(1) Chat | B | Microsoft Teams');
    // Profile 0 (root) and profile A keep updating in the background.
    win.webContents.emit('page-title-updated', {}, 'Chat | Profile 0 | Microsoft Teams');
    viewA.webContents.emit('page-title-updated', {}, 'Chat | A | Microsoft Teams');
    assert.deepStrictEqual(titles, [
      'Chat | B | Microsoft Teams',
      '(1) Chat | B | Microsoft Teams',
    ]);

    pm.switch('profile-0');
    assert.strictEqual(titles.at(-1), null);
  });

  it('hands the title back when the active view destroys itself, not for a background one', () => {
    const titles = [];
    const pm = fakeProfilesManager([LEGACY, PROFILE_A, PROFILE_B]);
    new ProfileViewManager(
      fakeWindow(),
      pm,
      { url: 'https://teams.cloud.microsoft' },
      () => {},
      () => {},
      () => {},
      (title) => titles.push(title)
    ).initialize();
    const [viewA, viewB] = createdViews;
    pm.switch('profile-b');
    titles.length = 0;

    viewA.destroyWebContents();
    assert.deepStrictEqual(titles, []);
    viewB.destroyWebContents();
    assert.deepStrictEqual(titles, [null]);
  });
});

// A link the app was launched with belongs to the active profile (ADR-020):
// its view takes the link as its first load instead of the root window.
describe('ProfileViewManager launch link', () => {
  const LINK = 'https://teams.cloud.microsoft/l/chat/0/0?users=a@b.com';

  function buildWithLaunch(profiles, activeId, link) {
    const pm = fakeProfilesManager(profiles);
    pm.activeId = activeId;
    const pvm = new ProfileViewManager(
      fakeWindow(),
      pm,
      { url: 'https://teams.cloud.microsoft', chromeUserAgent: 'UA' },
      () => {},
      () => {}
    );
    pvm.setLaunchUrl(link);
    pvm.initialize();
    return pvm;
  }

  it('loads the link in the active profile view and the profile page in the others', () => {
    buildWithLaunch([LEGACY, PROFILE_A, PROFILE_B], 'profile-b', LINK);
    const [viewA, viewB] = createdViews;

    assert.strictEqual(viewB.webContents.loads[0][0], LINK);
    assert.strictEqual(viewA.webContents.loads[0][0], 'https://teams.cloud.microsoft');
  });

  it('does not take the link for a background profile when the active one is Profile 0', () => {
    buildWithLaunch([LEGACY, PROFILE_A], 'profile-0', LINK);

    assert.strictEqual(createdViews[0].webContents.loads[0][0], 'https://teams.cloud.microsoft');
  });

  it('ignores a link that is not https, which a view with the full preload must not load', () => {
    buildWithLaunch([LEGACY, PROFILE_A], 'profile-a', 'http://evil.example/');

    assert.strictEqual(createdViews[0].webContents.loads[0][0], 'https://teams.cloud.microsoft');
  });

  it('drops a link the active view did not take, so a later profile does not inherit it', () => {
    const profiles = [LEGACY];
    const pm = fakeProfilesManager(profiles);
    const pvm = new ProfileViewManager(
      fakeWindow(),
      pm,
      { url: 'https://teams.cloud.microsoft', chromeUserAgent: 'UA' },
      () => {},
      () => {}
    );
    pvm.setLaunchUrl(LINK);
    pvm.initialize();

    profiles.push(PROFILE_A);
    pm.activeId = 'profile-a';
    pm.emit('add', PROFILE_A);

    assert.strictEqual(createdViews.at(-1).webContents.loads[0][0], 'https://teams.cloud.microsoft');
  });
});

// Teams' launcher redirects reject loadURL with ERR_ABORTED; an unhandled
// rejection exits the app and logs the URL-bearing error.
describe('ProfileViewManager first load rejection', () => {
  const LINK = 'https://teams.cloud.microsoft/l/chat/0/0?users=a@b.com';

  async function startWithRejectingLoads(t, launchLink) {
    const unhandled = [];
    const onUnhandled = (reason) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    t.after(() => process.off('unhandledRejection', onUnhandled));
    const lines = [];
    const sink = (...args) => lines.push(JSON.stringify(args));
    for (const level of ['debug', 'info', 'warn', 'error']) t.mock.method(console, level, sink);
    const originalLoad = FakeWebContents.prototype.loadURL;
    FakeWebContents.prototype.loadURL = function loadURL(url) {
      const error = new Error(`ERR_ABORTED (-3) loading '${url}'`);
      error.code = 'ERR_ABORTED';
      return Promise.reject(error);
    };
    t.after(() => {
      FakeWebContents.prototype.loadURL = originalLoad;
    });
    const pm = fakeProfilesManager([LEGACY, PROFILE_A]);
    pm.activeId = 'profile-a';
    const pvm = new ProfileViewManager(
      fakeWindow(),
      pm,
      { url: 'https://teams.cloud.microsoft', chromeUserAgent: 'UA' },
      () => {},
      () => {}
    );
    if (launchLink) pvm.setLaunchUrl(launchLink);
    pvm.initialize();
    await new Promise((resolve) => setImmediate(resolve));
    return { unhandled, lines };
  }

  it('absorbs an aborted launch-link load without logging the link or the error', async (t) => {
    const { unhandled, lines } = await startWithRejectingLoads(t, LINK);

    assert.deepStrictEqual(unhandled, []);
    assert.ok(lines.length > 0, 'the interruption is noted');
    for (const line of lines) {
      assert.ok(!line.includes('a@b.com') && !line.includes('/l/chat'), line);
    }
  });

  it('absorbs a failed ordinary profile first load too', async (t) => {
    const { unhandled } = await startWithRejectingLoads(t, null);

    assert.deepStrictEqual(unhandled, []);
  });
});

// Per-profile auth recovery: main wires each view in as it is created and
// cleans its session's expired auth cookies before the first load (#2296),
// as the root window's startup does.
describe('ProfileViewManager view-created hook (auth recovery)', () => {
  function buildWithHook(profiles, onViewCreated, launchUrl) {
    const pm = fakeProfilesManager(profiles);
    pm.activeId = profiles.at(-1).id;
    const pvm = new ProfileViewManager(
      fakeWindow(),
      pm,
      { url: 'https://teams.cloud.microsoft', chromeUserAgent: 'UA' },
      () => {},
      () => {},
      () => {},
      () => {},
      onViewCreated
    );
    if (launchUrl) pvm.setLaunchUrl(launchUrl);
    pvm.initialize();
    return { pm, pvm };
  }

  it('is called once per profile view with its webContents and profile id, never for the pill', () => {
    const calls = [];
    buildWithHook([LEGACY, PROFILE_A, PROFILE_B], (wc, id) => {
      calls.push([wc, id]);
    });
    const [viewA, viewB] = createdViews;
    assert.deepStrictEqual(calls, [
      [viewA.webContents, 'profile-a'],
      [viewB.webContents, 'profile-b'],
    ]);
  });

  it('holds the first load until the returned promise settles, then loads the same URL', async () => {
    const LINK = 'https://teams.cloud.microsoft/l/chat/0/0?users=a@b.com';
    let finish;
    buildWithHook(
      [LEGACY, PROFILE_A],
      () => new Promise((resolve) => {
        finish = resolve;
      }),
      LINK
    );
    const [viewA] = createdViews;
    assert.strictEqual(viewA.webContents.loads, undefined, 'not loaded while cleaning');
    finish({ cleaned: 0 });
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepStrictEqual(viewA.webContents.loads, [[LINK, { userAgent: 'UA' }]]);
  });

  it('still loads when the hook rejects, and skips a view destroyed meanwhile', async () => {
    let fail;
    let finishB;
    let n = 0;
    buildWithHook([LEGACY, PROFILE_A, PROFILE_B], () => {
      n += 1;
      return n === 1
        ? new Promise((_resolve, reject) => {
          fail = reject;
        })
        : new Promise((resolve) => {
          finishB = resolve;
        });
    });
    const [viewA, viewB] = createdViews;
    // Electron keeps the accessor on a destroyed webContents.
    viewB.webContents.emitOnce('destroyed');
    fail(new Error('cookie store unavailable'));
    finishB();
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepStrictEqual(viewA.webContents.loads, [['https://teams.cloud.microsoft', { userAgent: 'UA' }]]);
    assert.strictEqual(viewB.webContents.loads, undefined);
  });

  it('getStartUrl gives the page a view starts on, and null for a profile that is gone', () => {
    const custom = { ...PROFILE_B, url: 'https://tenant.example/' };
    const stale = { ...PROFILE_A, url: 'http://evil.example/' };
    const { pvm } = buildWithHook([LEGACY, stale, custom], () => {});
    assert.strictEqual(pvm.getStartUrl('profile-b'), 'https://tenant.example/');
    assert.strictEqual(pvm.getStartUrl('profile-a'), 'https://teams.cloud.microsoft');
    assert.strictEqual(pvm.getStartUrl('missing'), null);
  });
});
