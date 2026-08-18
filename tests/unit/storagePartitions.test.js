const { test, describe, beforeEach, after } = require("node:test");
const assert = require("node:assert");

// #2862 / #2866: both clear-storage paths resolved a single session, so every
// profile's cookies survived a clear the app promised would remove them. The
// module binds `session` at module scope, so stub it as profilesManager.test.js
// does.
const electronPath = require.resolve("electron");
const sessions = new Map();
let fromPartitionCalls = [];
let fromPartitionThrowsFor = null;

require.cache[electronPath] = {
  id: electronPath,
  filename: electronPath,
  loaded: true,
  exports: {
    session: {
      fromPartition: (name) => {
        fromPartitionCalls.push(name);
        if (name === fromPartitionThrowsFor) {
          throw new TypeError("Error processing argument at index 0");
        }
        if (!sessions.has(name)) {
          sessions.set(name, {
            cleared: [],
            // Rest params, so a no-argument call is distinguishable from one
            // passing an explicit undefined.
            clearStorageData(...args) {
              if (name === "persist:fails") {
                return Promise.reject(new Error("clear failed"));
              }
              this.cleared.push(args);
              return Promise.resolve();
            },
          });
        }
        return sessions.get(name);
      },
    },
  },
};

const modulePath = require.resolve("../../app/utils/storagePartitions");
const {
  collectPartitionsToClear,
  clearStorageForPartitions,
} = require(modulePath);

// The stub must outlive every test here, so drop it only at the end.
after(() => {
  delete require.cache[modulePath];
  delete require.cache[electronPath];
});

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

  // The list comes off disk, so a corrupted record can hold a non-string, and
  // session.fromPartition throws on those.
  test("skips profile records whose partition is not a string", () => {
    const partitions = collectPartitionsToClear(LEGACY, {
      list: () => [
        { id: "a", partition: 42 },
        { id: "b", partition: { toString: () => "persist:nope" } },
        { id: "c", partition: ["persist:nope"] },
      ],
    });

    assert.deepStrictEqual(partitions, [LEGACY]);
  });

  // Deliberate, and the only behavioural difference when the flag is off.
  // Profiles outlive it, and their partitions still hold tenant cookies.
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

describe("clearStorageForPartitions", () => {
  beforeEach(() => {
    sessions.clear();
    fromPartitionCalls = [];
    fromPartitionThrowsFor = null;
  });

  test("clears every partition it is given, passing the options through", async () => {
    const options = { storages: ["cookies"] };
    const result = await clearStorageForPartitions(
      [LEGACY, "persist:teams-profile-aaa"],
      options,
      "on quit"
    );

    assert.deepStrictEqual(fromPartitionCalls, [
      LEGACY,
      "persist:teams-profile-aaa",
    ]);
    assert.deepStrictEqual(sessions.get(LEGACY).cleared, [[options]]);
    assert.deepStrictEqual(
      sessions.get("persist:teams-profile-aaa").cleared,
      [[options]]
    );
    assert.deepStrictEqual(result, { total: 2, failed: 0 });
  });

  // Electron treats an explicit undefined differently from an absent argument,
  // so an unset clearStorageData must call through with no argument at all.
  test("clears everything when no options are configured", async () => {
    await clearStorageForPartitions([LEGACY], undefined, "on startup");

    assert.deepStrictEqual(sessions.get(LEGACY).cleared, [[]]);
  });

  // The `true` flag form must reach Electron as a no-argument call, not as a
  // bare boolean where an options object is documented.
  test("treats the boolean flag form as clear everything", async () => {
    await clearStorageForPartitions([LEGACY], true, "on startup");

    assert.deepStrictEqual(sessions.get(LEGACY).cleared, [[]]);
  });

  test("does not reject when a partition fails to clear", async () => {
    const result = await clearStorageForPartitions(
      [LEGACY, "persist:fails"],
      undefined,
      "on quit"
    );

    assert.deepStrictEqual(result, { total: 2, failed: 1 });
    // The healthy partition is still cleared rather than abandoned.
    assert.strictEqual(sessions.get(LEGACY).cleared.length, 1);
  });

  // fromPartition throws synchronously, which would escape Promise.allSettled
  // if the mapped callback were not async.
  test("does not reject when fromPartition throws synchronously", async () => {
    fromPartitionThrowsFor = "persist:bad";

    const result = await clearStorageForPartitions(
      ["persist:bad", LEGACY],
      undefined,
      "on startup"
    );

    assert.deepStrictEqual(result, { total: 2, failed: 1 });
    assert.strictEqual(sessions.get(LEGACY).cleared.length, 1);
  });

  test("is a no-op with an empty partition list", async () => {
    const result = await clearStorageForPartitions([], undefined, "on quit");

    assert.deepStrictEqual(result, { total: 0, failed: 0 });
    assert.deepStrictEqual(fromPartitionCalls, []);
  });
});
