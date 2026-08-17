"use strict";

const { session } = require("electron");

/**
 * Collects every session partition a "clear storage" action should clear.
 *
 * Before multi-account (ADR-020) there was exactly one partition, so both
 * clear paths resolved `startupConfig.partition` and were done. Profiles each
 * own a `persist:teams-profile-{uuid}` partition, and Profile 0 reuses the
 * legacy one, so the startup partition and the profile list overlap. Deduping
 * through a Set keeps that overlap from clearing the same session twice
 * (#2862, #2866).
 *
 * With no profiles stored, `list()` returns an empty array and the result is
 * just the startup partition, which is the pre-multi-account behaviour
 * unchanged. `profilesManager` is optional so the callers that build without
 * one keep working.
 *
 * Deliberately not gated on `multiAccount.enabled`. Profiles outlive the flag:
 * a user can disable it after creating them, and `app/index.js` force-disables
 * multi-account when `auth.intune.enabled` is on, both of which leave profile
 * partitions holding tenant cookies and tokens on disk. The clear promises to
 * remove the storage, so it clears what is actually there rather than what the
 * current flag says should be there. `ProfilesManager.list()` reads the
 * settings store directly and does not depend on `initialize()`, which is
 * itself flag-gated, so the list is readable either way. Reading it is the
 * only behavioural difference when the flag is off, and with no profiles
 * stored there is none.
 *
 * @param {string} [startupPartition] - `startupConfig.partition`
 * @param {{list?: () => Array<{partition?: string}>}} [profilesManager]
 * @returns {string[]} partition strings, in the order they should be cleared
 */
function collectPartitionsToClear(startupPartition, profilesManager) {
  const partitions = new Set();

  if (startupPartition) {
    partitions.add(startupPartition);
  }

  for (const profile of profilesManager?.list?.() ?? []) {
    // Type-checked, not just truthy: these come from the settings file, and
    // `session.fromPartition` throws on a non-string.
    if (typeof profile?.partition === "string" && profile.partition) {
      partitions.add(profile.partition);
    }
  }

  return [...partitions];
}

/**
 * Clears the given partitions, never rejecting.
 *
 * Both callers are in a path where a rejection does real damage: the menu item
 * is fire-and-forget and would skip `window.close()`, and the startup clear
 * would take the main window down with it. A single corrupted profile record
 * must not cost the user either, so failures are logged and counted instead.
 *
 * @param {string[]} partitions - from `collectPartitionsToClear`
 * @param {Electron.ClearStorageDataOptions} [clearOptions] - omit to clear all
 * @param {string} when - short log context, e.g. "on quit"
 * @returns {Promise<{total: number, failed: number}>}
 */
async function clearStorageForPartitions(partitions, clearOptions, when) {
  // Log the storage names and a partition count only. The storages are a fixed
  // Electron enum, unlike the sibling `origin`, which is a URL, so naming them
  // makes a typo visible: Electron ignores an unknown storage silently and the
  // clear would then quietly keep data the user expected to lose. The
  // partition strings themselves carry profile UUIDs and stay out of the log.
  console.debug(`Clearing storage data ${when}`, {
    partitions: partitions.length,
    storages: clearOptions?.storages ?? "all",
  });

  // Started together rather than in sequence: the profile views can already be
  // live, so a partition cleared early is exposed until the last one finishes
  // and its renderer can write fresh auth cookies back in the meantime.
  // Overlapping the clears keeps that window from growing with the number of
  // profiles.
  const results = await Promise.allSettled(
    partitions.map(async (partition) => {
      // `async` so that a synchronous throw from `fromPartition` becomes a
      // rejection this settles over rather than escaping the whole call.
      const partitionSession = session.fromPartition(partition);
      return clearOptions
        ? partitionSession.clearStorageData(clearOptions)
        : partitionSession.clearStorageData();
    })
  );

  const failures = results.filter((r) => r.status === "rejected");
  for (const failure of failures) {
    console.error("Failed to clear storage data for a partition", {
      error: failure.reason?.message,
    });
  }
  if (failures.length > 0) {
    // The user asked for the storage to be removed, so a swallowed failure
    // must not read as success in the log.
    console.error(`Storage data was not fully cleared ${when}`, {
      failed: failures.length,
      of: partitions.length,
    });
  }

  return { total: partitions.length, failed: failures.length };
}

module.exports = { collectPartitionsToClear, clearStorageForPartitions };
