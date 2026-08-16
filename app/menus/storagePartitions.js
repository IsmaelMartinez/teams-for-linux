"use strict";

/**
 * Collects every session partition that "Quit (Clear Storage)" should clear.
 *
 * Before multi-account (ADR-020) there was exactly one partition, so the menu
 * item resolved `startupConfig.partition` and was done. Profiles each own a
 * `persist:teams-profile-{uuid}` partition, and Profile 0 reuses the legacy
 * one, so the startup partition and the profile list overlap. Deduping through
 * a Set keeps that overlap from clearing the same session twice (#2862).
 *
 * With no profiles stored, `list()` returns an empty array and the result is
 * just the startup partition, which is the pre-multi-account behaviour
 * unchanged. `profilesManager` is optional so the menu keeps working for the
 * call sites that build it without one.
 *
 * Deliberately not gated on `multiAccount.enabled`. Profiles outlive the flag:
 * a user can disable it after creating them, and `app/index.js` force-disables
 * multi-account when `auth.intune.enabled` is on, both of which leave profile
 * partitions holding tenant cookies and tokens on disk. The menu item promises
 * to clear the storage, so it clears what is actually there rather than what
 * the current flag says should be there. Reading the stored list is the only
 * behavioural difference when the flag is off, and with no profiles stored
 * there is none.
 *
 * @param {string} startupPartition - `startupConfig.partition`
 * @param {{list?: () => Array<{partition?: string}>}} [profilesManager]
 * @returns {string[]} partition strings, in the order they should be cleared
 */
function collectPartitionsToClear(startupPartition, profilesManager) {
  const partitions = new Set();

  if (startupPartition) {
    partitions.add(startupPartition);
  }

  for (const profile of profilesManager?.list?.() ?? []) {
    if (profile?.partition) {
      partitions.add(profile.partition);
    }
  }

  return [...partitions];
}

module.exports = collectPartitionsToClear;
