// Flat-to-nested option renames from ADR-025, applied during the deprecation
// window. Pure data module, no Electron imports, mirroring validator.js.
//
// Both names work while a rename is in its window. The FLAT name stays the one
// every module reads, so no feature code is swept; a nested value is projected
// onto the flat key only when the user actually supplied it. The flat
// declarations, this table and the projection are deleted together at the end
// of the window (2.30.0, see issue #2842).
//
// `inverted` marks a rename that flips a boolean's polarity, for example
// `disableNotifications: true` becoming `notifications.enabled: false`. A plain
// copy would silently reverse user intent, so those must be negated.

/** @type {{flat: string, nested: string, inverted?: boolean}[]} */
const RENAMES = [
  // Batch 1 (2.17.0)
  { flat: "globalShortcuts", nested: "shortcuts.global" },
  { flat: "disableGlobalShortcuts", nested: "shortcuts.disableWhileFocused" },
  { flat: "clearStorageData", nested: "storage.clearData" },
];

// Reads a dotted path, tolerating a missing intermediate object. yargs replaces
// object options wholesale rather than deep merging, so a user who sets one
// leaf of a namespace leaves its siblings undefined; those correctly read as
// "not supplied" and fall back to the flat default.
function readPath(source, path) {
  let node = source;
  for (const part of path.split(".")) {
    if (node === null || typeof node !== "object") return undefined;
    node = node[part];
  }
  return node;
}

/**
 * Projects nested values onto their flat counterparts, in place.
 *
 * @param {Record<string, unknown>} config the parsed yargs config.
 * @param {Record<string, boolean>} defaulted yargs `parsed.defaulted`, listing
 *   the top-level options that fell back to their declared default. A
 *   namespace in here was not supplied by the user, so the flat value stands.
 * @param {typeof RENAMES} renames override for tests.
 * @returns {string[]} the flat keys that were overwritten from a nested value.
 */
function applyRenamedOptions(config, defaulted, renames = RENAMES) {
  const applied = [];
  if (!config || typeof config !== "object") return applied;

  for (const { flat, nested, inverted } of renames) {
    const namespace = nested.split(".")[0];
    if (defaulted && Object.hasOwn(defaulted, namespace)) continue;

    const value = readPath(config, nested);
    if (value === undefined) continue;

    // The new name wins when both are supplied; it is the canonical one.
    config[flat] = inverted ? !value : value;
    applied.push(flat);
  }

  return applied;
}

module.exports = { RENAMES, applyRenamedOptions };
