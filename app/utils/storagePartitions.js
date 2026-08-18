"use strict";

const { session } = require("electron");

/**
 * Collects every session partition a "clear storage" action should clear.
 *
 * Profile 0 reuses the legacy partition, so the startup partition and the
 * profile list overlap; the Set stops that clearing one session twice.
 *
 * Deliberately not gated on `multiAccount.enabled`. Profiles outlive the flag
 * (it can be turned off after they are created, and `app/index.js`
 * force-disables multi-account under `auth.intune.enabled`), and their
 * partitions still hold tenant cookies either way. `ProfilesManager.list()`
 * reads the settings store directly, so it works whether or not the
 * flag-gated `initialize()` ran.
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
    // Type-checked, not just truthy: these come off disk, and
    // `session.fromPartition` throws on a non-string.
    if (typeof profile?.partition === "string" && profile.partition) {
      partitions.add(profile.partition);
    }
  }

  return [...partitions];
}

/**
 * Clears the given partitions, never rejecting: the menu item is
 * fire-and-forget and a rejection would skip `window.close()`, and the startup
 * clear would take the main window down with it.
 *
 * @param {string[]} partitions - from `collectPartitionsToClear`
 * @param {Electron.ClearStorageDataOptions|boolean} [clearOptions] - the
 *   configured `storage.clearData`; `true` or omitted clears everything
 * @param {string} when - short log context, e.g. "on quit"
 * @returns {Promise<{total: number, failed: number}>}
 */
async function clearStorageForPartitions(partitions, clearOptions, when) {
  // Count and storage names only. Partition strings carry profile UUIDs, and
  // the sibling `origin` is a URL; naming the storages still makes a typo
  // visible, since Electron ignores an unknown one silently.
  console.debug(`Clearing storage data ${when}`, {
    partitions: partitions.length,
    storages: clearOptions?.storages ?? "all",
  });

  // Overlapped rather than sequential: profile views can already be live, so a
  // partition cleared early stays exposed until the last one finishes.
  const results = await Promise.allSettled(
    partitions.map(async (partition) => {
      // `async` so a synchronous throw from `fromPartition` becomes a rejection
      // rather than escaping the whole call.
      const partitionSession = session.fromPartition(partition);
      // `storage.clearData` is an options object or `true` for "clear
      // everything"; Electron documents an object or no argument, so the flag
      // form maps to the no-argument call.
      return typeof clearOptions === "object" && clearOptions !== null
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
    // A swallowed failure must not read as success: the user asked for removal.
    console.error(`Storage data was not fully cleared ${when}`, {
      failed: failures.length,
      of: partitions.length,
    });
  }

  return { total: partitions.length, failed: failures.length };
}

module.exports = { collectPartitionsToClear, clearStorageForPartitions };
