'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const ProfileNotificationFlags = require('../../app/browser/notifications/profileNotificationFlags');

// The renderer-side cache of its profile's notification flags (ADR-020
// Phase 2): pulled on load, pushed on update. A push is always newer than a
// pull that was already in flight.

function deferred() {
  let resolve;
  const promise = new Promise((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('ProfileNotificationFlags', () => {
  it('starts with everything on', () => {
    const flags = new ProfileNotificationFlags();
    assert.strictEqual(flags.disableNotifications, false);
    assert.strictEqual(flags.muted, false);
  });

  it('applies a pull and a push, accepting only literal true', async () => {
    const flags = new ProfileNotificationFlags();
    await flags.pull(async () => ({ disableNotifications: true, muted: 'yes' }));
    assert.strictEqual(flags.disableNotifications, true);
    assert.strictEqual(flags.muted, false);
    flags.applyPush({ muted: true });
    assert.strictEqual(flags.disableNotifications, false);
    assert.strictEqual(flags.muted, true);
  });

  it('a pull that resolves after a newer push does not overwrite it', async () => {
    const flags = new ProfileNotificationFlags();
    const response = deferred();
    const pulling = flags.pull(() => response.promise);
    flags.applyPush({ disableNotifications: true, muted: true });
    response.resolve({ disableNotifications: false, muted: false });
    await pulling;
    assert.strictEqual(flags.disableNotifications, true);
    assert.strictEqual(flags.muted, true);
  });

  it('a failed pull leaves the flags as they were and rejects to its caller', async () => {
    const flags = new ProfileNotificationFlags();
    flags.applyPush({ muted: true });
    await assert.rejects(
      flags.pull(async () => {
        throw new Error('no handler');
      })
    );
    assert.strictEqual(flags.muted, true);
  });
});
