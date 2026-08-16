const { test, describe } = require("node:test");
const assert = require("node:assert");
const collectPartitionsToClear = require("../../app/menus/storagePartitions");

// #2862: "Quit (Clear Storage)" resolved a single session from
// startupConfig.partition, so with multiAccount.enabled every profile's
// cookies and tokens survived a clear the dialog promised would remove them.
// The collector is pure (no Electron imports), so it is unit-testable the same
// way buildProfilesMenu is.

const LEGACY = "persist:teams-4-linux";

describe("collectPartitionsToClear", () => {
  test("returns just the startup partition when there are no profiles", () => {
    assert.deepStrictEqual(collectPartitionsToClear(LEGACY, { list: () => [] }), [
      LEGACY,
    ]);
  });

  test("returns just the startup partition when there is no profiles manager", () => {
    assert.deepStrictEqual(collectPartitionsToClear(LEGACY), [LEGACY]);
    assert.deepStrictEqual(collectPartitionsToClear(LEGACY, null), [LEGACY]);
  });

  test("includes every profile partition alongside the startup one", () => {
    const partitions = collectPartitionsToClear(LEGACY, {
      list: () => [
        { id: "a", partition: "persist:teams-profile-aaa" },
        { id: "b", partition: "persist:teams-profile-bbb" },
      ],
    });

    assert.deepStrictEqual(partitions, [
      LEGACY,
      "persist:teams-profile-aaa",
      "persist:teams-profile-bbb",
    ]);
  });

  // Profile 0 is bootstrapped against the legacy partition rather than a fresh
  // UUID one, so it always collides with the startup partition.
  test("clears a partition once when Profile 0 reuses the legacy partition", () => {
    const partitions = collectPartitionsToClear(LEGACY, {
      list: () => [
        { id: "zero", partition: LEGACY },
        { id: "b", partition: "persist:teams-profile-bbb" },
      ],
    });

    assert.deepStrictEqual(partitions, [LEGACY, "persist:teams-profile-bbb"]);
    assert.strictEqual(partitions.filter((p) => p === LEGACY).length, 1);
  });

  test("skips profile records with no partition", () => {
    const partitions = collectPartitionsToClear(LEGACY, {
      list: () => [{ id: "a" }, { id: "b", partition: "" }, { id: "c", partition: null }],
    });

    assert.deepStrictEqual(partitions, [LEGACY]);
  });

  // Deliberate, and the one behavioural difference when multiAccount.enabled is
  // false. Profiles outlive the flag: it can be turned off after they are
  // created, and app/index.js force-disables multi-account under
  // auth.intune.enabled. Their partitions still hold tenant cookies and tokens,
  // and the menu item promises to clear the storage, so the stored list is read
  // regardless of the flag. With no profiles stored there is no difference.
  test("clears stored profile partitions regardless of the multiAccount flag", () => {
    const partitions = collectPartitionsToClear(LEGACY, {
      list: () => [{ id: "a", partition: "persist:teams-profile-aaa" }],
    });

    assert.ok(partitions.includes("persist:teams-profile-aaa"));
  });

  test("still clears profile partitions when the startup partition is unset", () => {
    const partitions = collectPartitionsToClear(undefined, {
      list: () => [{ id: "a", partition: "persist:teams-profile-aaa" }],
    });

    assert.deepStrictEqual(partitions, ["persist:teams-profile-aaa"]);
  });
});
