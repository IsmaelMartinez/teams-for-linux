'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  createProfileActivator,
  registerWebNotificationClick,
} = require('../../app/profileActivation');

// ADR-020 Phase 2: a notification click brings forward the profile that
// raised it, resolved from the raising renderer.

function wc(id, destroyed = false) {
  return { id, isDestroyed: () => destroyed };
}

function setup({ owners = {}, activeId = 'p-0', switchThrows = false } = {}) {
  const switches = [];
  const profilesManager = {
    getActive: () => ({ id: activeId }),
    switch(id) {
      if (switchThrows) throw new Error('profile vanished');
      switches.push(id);
      activeId = id;
      return { id };
    },
  };
  const viewManager = { resolveProfileId: (w) => owners[w.id] ?? null };
  return { activate: createProfileActivator({ viewManager, profilesManager }), switches };
}

describe('createProfileActivator', () => {
  it("switches to the raising renderer's profile", () => {
    const { activate, switches } = setup({ owners: { 5: 'p-work' } });
    assert.strictEqual(activate(wc(5)), true);
    assert.deepStrictEqual(switches, ['p-work']);
  });

  it('does nothing when that profile is already active', () => {
    const { activate, switches } = setup({ owners: { 5: 'p-0' } });
    assert.strictEqual(activate(wc(5)), false);
    assert.deepStrictEqual(switches, []);
  });

  it('ignores unattributed, destroyed or missing senders', () => {
    const { activate, switches } = setup({ owners: { 5: 'p-work' } });
    assert.strictEqual(activate(wc(9)), false);
    assert.strictEqual(activate(wc(5, true)), false);
    assert.strictEqual(activate(null), false);
    assert.deepStrictEqual(switches, []);
  });

  it('a failed switch never throws out of a notification callback', () => {
    const { activate } = setup({ owners: { 5: 'p-work' }, switchThrows: true });
    const warn = console.warn;
    console.warn = () => {};
    try {
      assert.strictEqual(activate(wc(5)), false);
    } finally {
      console.warn = warn;
    }
  });
});

describe('registerWebNotificationClick', () => {
  it("activates the sender's own profile, never one the page names", () => {
    const handlers = new Map();
    const activated = [];
    registerWebNotificationClick({
      ipcMain: { on: (channel, fn) => handlers.set(channel, fn) },
      activate: (sender) => activated.push(sender),
    });
    const sender = wc(5);
    handlers.get('notification-web-clicked')({ sender }, 'p-someone-else');
    assert.deepStrictEqual(activated, [sender]);
  });
});
