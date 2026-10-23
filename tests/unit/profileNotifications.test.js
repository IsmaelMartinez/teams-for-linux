'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { EventEmitter } = require('node:events');
const {
  registerProfileNotificationFlags,
  flagsOf,
} = require('../../app/profileNotifications');

// ADR-020 Phase 2: renderers pull their own profile's notification flags
// (resolved from the sender) and get a push when that profile is updated.

function fakeWebContents(id, { destroyed = false, sendThrows = false } = {}) {
  return {
    id,
    sent: [],
    isDestroyed: () => destroyed,
    send(channel, payload) {
      if (sendThrows) throw new Error('render frame was disposed');
      this.sent.push({ channel, payload });
    },
  };
}

function setup({ owners = {}, profileFor = () => null, all = [] } = {}) {
  const handlers = new Map();
  const ipcMain = { handle: (channel, fn) => handlers.set(channel, fn) };
  const profilesManager = new EventEmitter();
  const viewManager = {
    getProfileFor: profileFor,
    resolveProfileId: (wc) => owners[wc.id] ?? null,
  };
  registerProfileNotificationFlags({
    ipcMain,
    getAllWebContents: () => all,
    viewManager,
    profilesManager,
  });
  return { handlers, profilesManager };
}

describe('profileNotifications', () => {
  it('flagsOf normalises to two booleans, defaulting to on', () => {
    assert.deepStrictEqual(flagsOf(null), {
      disableNotifications: false,
      muted: false,
    });
    assert.deepStrictEqual(flagsOf({ disableNotifications: 1, muted: 'yes' }), {
      disableNotifications: true,
      muted: true,
    });
  });

  it("answers a renderer with its own sender-resolved profile's flags", () => {
    const work = { id: 'p-work', disableNotifications: true, muted: false };
    const { handlers } = setup({
      profileFor: (event) => (event.sender.id === 7 ? work : null),
    });
    const handler = handlers.get('profile-get-notification-flags');
    assert.deepStrictEqual(handler({ sender: { id: 7 } }), {
      disableNotifications: true,
      muted: false,
    });
    // An unattributed sender (pre-bootstrap root) keeps everything on.
    assert.deepStrictEqual(handler({ sender: { id: 99 } }), {
      disableNotifications: false,
      muted: false,
    });
  });

  it("pushes an update only to that profile's live renderers, popups included", () => {
    const view = fakeWebContents(1);
    const popup = fakeWebContents(2);
    const other = fakeWebContents(3);
    const dead = fakeWebContents(4, { destroyed: true });
    const { profilesManager } = setup({
      owners: { 1: 'p-a', 2: 'p-a', 3: 'p-b', 4: 'p-a' },
      all: [view, popup, other, dead],
    });
    profilesManager.emit('update', { id: 'p-a', muted: true });
    const expected = [
      {
        channel: 'profile-notification-flags',
        payload: { disableNotifications: false, muted: true },
      },
    ];
    assert.deepStrictEqual(view.sent, expected);
    assert.deepStrictEqual(popup.sent, expected);
    assert.deepStrictEqual(other.sent, []);
    assert.deepStrictEqual(dead.sent, []);
  });

  it('a renderer dying mid-push does not stop the others or escape the update', () => {
    const dying = fakeWebContents(1, { sendThrows: true });
    const view = fakeWebContents(2);
    const { profilesManager } = setup({
      owners: { 1: 'p-a', 2: 'p-a' },
      all: [dying, view],
    });
    const warn = console.warn;
    console.warn = () => {};
    try {
      assert.doesNotThrow(() =>
        profilesManager.emit('update', { id: 'p-a', disableNotifications: true })
      );
    } finally {
      console.warn = warn;
    }
    assert.strictEqual(view.sent.length, 1);
  });
});
