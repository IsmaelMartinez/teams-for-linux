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
