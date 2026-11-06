'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');

const electronPath = require.resolve('electron');
const profilesManagerPath = require.resolve('../../app/profilesManager');

// ProfilesManager pulls `ipcMain` from electron at module scope; stub it so
// the pin-cap logic is testable under plain `node --test` (same pattern as
// downloadManager.test.js).
function installElectronMock() {
  require.cache[electronPath] = {
    id: electronPath,
    filename: electronPath,
    loaded: true,
    exports: {
      ipcMain: { handle: () => {}, on: () => {} },
    },
  };
}

function makeStore() {
  const data = new Map();
  return {
    get: (key) => data.get(key),
    set: (key, value) => data.set(key, value),
  };
}

let ProfilesManager;

beforeEach(() => {
  installElectronMock();
  delete require.cache[profilesManagerPath];
  ProfilesManager = require(profilesManagerPath);
});

afterEach(() => {
  delete require.cache[profilesManagerPath];
  delete require.cache[electronPath];
});

// A profile URL loads with the full preload on every start, so only https is
// accepted, on both mutation paths (GHSA-58j7-22f8-6xqp).
describe('ProfilesManager url validation', () => {
  it('accepts an https URL on add() and update()', () => {
    const pm = new ProfilesManager(makeStore());
    const p = pm.add({ name: 'Work', url: 'https://teams.cloud.microsoft' });
    assert.strictEqual(p.url, 'https://teams.cloud.microsoft');
    assert.strictEqual(pm.update(p.id, { url: 'https://teams.microsoft.us' }).url, 'https://teams.microsoft.us');
  });

  it('rejects non-https and malformed URLs on add()', () => {
    const pm = new ProfilesManager(makeStore());
    assert.throws(() => pm.add({ name: 'A', url: 'http://example.com' }), /must use https/);
    assert.throws(() => pm.add({ name: 'B', url: 'file:///etc/passwd' }), /must use https/);
    assert.throws(() => pm.add({ name: 'C', url: 'javascript:alert(1)' }), /must use https/);
    assert.throws(() => pm.add({ name: 'D', url: 'not a url' }), /not a valid URL/);
  });

  it('rejects non-https URLs on update() and keeps the old one', () => {
    const pm = new ProfilesManager(makeStore());
    const p = pm.add({ name: 'Work', url: 'https://teams.cloud.microsoft' });
    assert.throws(() => pm.update(p.id, { url: 'http://example.com' }), /must use https/);
    assert.strictEqual(pm.list().find((x) => x.id === p.id).url, 'https://teams.cloud.microsoft');
  });

  it('still allows clearing the URL', () => {
    const pm = new ProfilesManager(makeStore());
    const p = pm.add({ name: 'Work', url: 'https://teams.cloud.microsoft' });
    assert.strictEqual(pm.update(p.id, { url: '' }).url, undefined);
  });
});

// ADR-020 Phase 1c.2: at most 5 profiles can be pinned (the Ctrl+Alt+1…5
// shortcut slots). The cap must hold on BOTH mutation paths — update() and
// add() — since `pinned` arrives over IPC on each.
describe('ProfilesManager pin cap', () => {
  it('rejects pinning a 6th profile via update()', () => {
    const pm = new ProfilesManager(makeStore());
    const ids = [];
    for (let i = 1; i <= 6; i++) {
      ids.push(pm.add({ name: `P${i}` }).id);
    }
    for (let i = 0; i < 5; i++) {
      assert.strictEqual(pm.update(ids[i], { pinned: true }).pinned, true);
    }
    assert.throws(
      () => pm.update(ids[5], { pinned: true }),
      /at most 5/i
    );
  });

  it('rejects creating a 6th pinned profile via add()', () => {
    const pm = new ProfilesManager(makeStore());
    for (let i = 1; i <= 5; i++) {
      assert.strictEqual(pm.add({ name: `P${i}`, pinned: true }).pinned, true);
    }
    assert.throws(() => pm.add({ name: 'P6', pinned: true }), /at most 5/i);
    // An unpinned 6th add is still fine.
    assert.strictEqual(pm.add({ name: 'P6' }).pinned, false);
  });

  it('re-pinning an already-pinned profile is a no-op that never trips the cap', () => {
    const pm = new ProfilesManager(makeStore());
    const ids = [];
    for (let i = 1; i <= 5; i++) {
      ids.push(pm.add({ name: `P${i}`, pinned: true }).id);
    }
    assert.strictEqual(pm.update(ids[0], { pinned: true }).pinned, true);
  });

  it('unpinning frees a slot for another profile', () => {
    const pm = new ProfilesManager(makeStore());
    const ids = [];
    for (let i = 1; i <= 5; i++) {
      ids.push(pm.add({ name: `P${i}`, pinned: true }).id);
    }
    const sixth = pm.add({ name: 'P6' }).id;
    assert.throws(() => pm.update(sixth, { pinned: true }), /at most 5/i);
    assert.strictEqual(pm.update(ids[0], { pinned: false }).pinned, false);
    assert.strictEqual(pm.update(sixth, { pinned: true }).pinned, true);
  });
});

// Phase 2 foundation: SenderProfileMap resolves the root window through this
// accessor, so it must be null before bootstrap and the Profile 0 record after.
describe('ProfilesManager getLegacyProfile', () => {
  it('returns null before the legacy profile is bootstrapped', () => {
    const pm = new ProfilesManager(makeStore());
    pm.add({ name: 'Regular' });
    assert.strictEqual(pm.getLegacyProfile(), null);
  });

  it('returns the bootstrapped Profile 0 record', () => {
    const pm = new ProfilesManager(makeStore());
    const bootstrapped = pm.bootstrapLegacyProfile('My account');
    const legacy = pm.getLegacyProfile();
    assert.strictEqual(legacy.id, bootstrapped.id);
    assert.strictEqual(legacy.partition, 'persist:teams-4-linux');
  });

  it('does not confuse regular partitions with the legacy one', () => {
    const pm = new ProfilesManager(makeStore());
    pm.add({ name: 'Regular' });
    pm.bootstrapLegacyProfile('My account');
    assert.strictEqual(pm.getLegacyProfile().name, 'My account');
  });

  it('returns null again after Profile 0 is removed', () => {
    const pm = new ProfilesManager(makeStore());
    const bootstrapped = pm.bootstrapLegacyProfile('My account');
    pm.add({ name: 'Regular' });
    pm.remove(bootstrapped.id);
    assert.strictEqual(pm.getLegacyProfile(), null);
  });
});
