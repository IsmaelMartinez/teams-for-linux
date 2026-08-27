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

class FakeWebContents {
  constructor() {
    this.id = nextWcId++;
    this.session = { clearStorageData: async () => {} };
    this._once = {};
    this._on = {};
    this._destroyed = false;
  }
  loadURL() {}
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
  isDestroyed() {
    return this._destroyed;
  }
  close() {
    this.closed = true;
  }
}

class FakeWebContentsView {
  constructor() {
    this.webContents = new FakeWebContents();
    createdViews.push(this);
  }
  setBounds() {}
  setBackgroundColor() {}
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
        handle() {},
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
    on() {},
    once() {},
    removeListener() {},
    getContentSize: () => [1200, 800],
    contentView: { addChildView() {}, removeChildView() {} },
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

describe('ProfileViewManager sender attribution wiring', () => {
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

  it('dispose clears all attribution including the root window', () => {
    const { win, pvm } = build([LEGACY, PROFILE_A]);
    const profileView = createdViews[0];
    const profileWc = profileView.webContents;
    pvm.dispose();
    assert.strictEqual(pvm.resolveProfileId(win.webContents), null);
    assert.strictEqual(pvm.resolveProfileId(profileWc), null);
  });
});
