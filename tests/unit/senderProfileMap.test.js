'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const SenderProfileMap = require('../../app/mainAppWindow/senderProfileMap');

// ADR-020 Phase 2 foundation: webContents → profile attribution. The module
// is pure (no Electron imports), so the mapping logic is tested directly.
// Root resolution is push-based (setRootProfileId, driven by the owner's
// ProfilesManager event subscriptions) — lookups must be pure map reads.

function fakeProfilesManager(profiles) {
  return { list: () => profiles };
}

describe('SenderProfileMap', () => {
  it('resolves a registered profile view to its profile id', () => {
    const reg = new SenderProfileMap(fakeProfilesManager([]));
    reg.register(42, 'profile-a');
    assert.strictEqual(reg.resolveProfileId(42), 'profile-a');
  });

  it('returns null for unknown senders (pill, dialogs)', () => {
    const reg = new SenderProfileMap(fakeProfilesManager([]));
    reg.register(42, 'profile-a');
    assert.strictEqual(reg.resolveProfileId(99), null);
  });

  it('resolves the root window to the pushed root profile id', () => {
    const reg = new SenderProfileMap(fakeProfilesManager([]));
    reg.setRootWebContentsId(7);
    reg.setRootProfileId('profile-0');
    assert.strictEqual(reg.resolveProfileId(7), 'profile-0');
  });

  it('resolves the root window to null before the root profile is pushed, then to it after', () => {
    const reg = new SenderProfileMap(fakeProfilesManager([]));
    reg.setRootWebContentsId(7);
    assert.strictEqual(reg.resolveProfileId(7), null);
    reg.setRootProfileId('profile-0');
    assert.strictEqual(reg.resolveProfileId(7), 'profile-0');
  });

  it('resolves the root window back to null after the root profile is cleared (Profile 0 removed)', () => {
    const reg = new SenderProfileMap(fakeProfilesManager([]));
    reg.setRootWebContentsId(7);
    reg.setRootProfileId('profile-0');
    reg.setRootProfileId(null);
    assert.strictEqual(reg.resolveProfileId(7), null);
  });

  it('does not leak the root fallback to unrelated senders', () => {
    const reg = new SenderProfileMap(fakeProfilesManager([]));
    reg.setRootWebContentsId(7);
    reg.setRootProfileId('profile-0');
    // Sanity: the root itself still resolves, so this test cannot pass vacuously.
    assert.strictEqual(reg.resolveProfileId(7), 'profile-0');
    // The contract: a non-profile surface (pill, dialog, devtools) is NOT Profile 0.
    assert.strictEqual(reg.resolveProfileId(8), null);
  });

  it('a registered view wins over the root fallback for its own id', () => {
    const reg = new SenderProfileMap(fakeProfilesManager([]));
    reg.setRootWebContentsId(7);
    reg.setRootProfileId('profile-0');
    reg.register(7, 'profile-b'); // pathological, but explicit wins
    assert.strictEqual(reg.resolveProfileId(7), 'profile-b');
  });

  it('unregister removes the mapping and is idempotent', () => {
    const reg = new SenderProfileMap(fakeProfilesManager([]));
    reg.register(42, 'profile-a');
    reg.unregister(42);
    reg.unregister(42);
    assert.strictEqual(reg.resolveProfileId(42), null);
  });

  it('clear drops all mappings including the root id and root profile', () => {
    const reg = new SenderProfileMap(fakeProfilesManager([]));
    reg.setRootWebContentsId(7);
    reg.setRootProfileId('profile-0');
    reg.register(42, 'profile-a');
    reg.clear();
    assert.strictEqual(reg.resolveProfileId(42), null);
    assert.strictEqual(reg.resolveProfileId(7), null);
    // A stale root profile must not survive clear + a new root id.
    reg.setRootWebContentsId(7);
    assert.strictEqual(reg.resolveProfileId(7), null);
  });

  describe('getProfileFor', () => {
    const profileA = { id: 'profile-a', name: 'A' };
    const profileZero = { id: 'profile-0', name: 'My account' };

    it('returns the full profile record for a registered sender', () => {
      const reg = new SenderProfileMap(fakeProfilesManager([profileA]));
      reg.register(42, 'profile-a');
      assert.deepStrictEqual(
        reg.getProfileFor({ sender: { id: 42 } }),
        profileA
      );
    });

    it('returns the full Profile 0 record for the root window sender', () => {
      const reg = new SenderProfileMap(
        fakeProfilesManager([profileZero, profileA])
      );
      reg.setRootWebContentsId(7);
      reg.setRootProfileId('profile-0');
      assert.deepStrictEqual(
        reg.getProfileFor({ sender: { id: 7 } }),
        profileZero
      );
    });

    it('returns null for the root window before Profile 0 exists, then the record after', () => {
      const profiles = [profileA];
      const reg = new SenderProfileMap(fakeProfilesManager(profiles));
      reg.setRootWebContentsId(7);
      assert.strictEqual(reg.getProfileFor({ sender: { id: 7 } }), null);
      profiles.push(profileZero);
      reg.setRootProfileId('profile-0');
      assert.deepStrictEqual(
        reg.getProfileFor({ sender: { id: 7 } }),
        profileZero
      );
    });

    it('returns null for non-profile senders and malformed events', () => {
      const reg = new SenderProfileMap(fakeProfilesManager([profileA]));
      reg.register(42, 'profile-a');
      assert.strictEqual(reg.getProfileFor({ sender: { id: 99 } }), null);
      assert.strictEqual(reg.getProfileFor({}), null);
      assert.strictEqual(reg.getProfileFor(null), null);
      assert.strictEqual(reg.getProfileFor({ sender: {} }), null);
    });

    it('returns null when the mapped profile record no longer exists', () => {
      // Mapping outlives the record only transiently (destroyView unregisters
      // on remove), but the lookup must not throw in that window.
      const reg = new SenderProfileMap(fakeProfilesManager([]));
      reg.register(42, 'profile-gone');
      assert.strictEqual(reg.getProfileFor({ sender: { id: 42 } }), null);
    });
  });
});
