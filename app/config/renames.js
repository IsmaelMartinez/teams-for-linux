// Flat-to-nested option renames from ADR-025, applied during the deprecation
// window. Pure data module, no Electron imports, mirroring validator.js and
// borrowing its isPlainObject rather than keeping a fourth copy of it.
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

// `type: "array"` restores the coercion the flat name gets for free. Nested
// leaves are not yargs options, so yargs never wraps a scalar into an array
// for them: `globalShortcuts: "Control+Shift+M"` arrives as ["Control+Shift+M"]
// while `shortcuts.global: "Control+Shift+M"` would arrive as a bare string,
// which fails the Array.isArray check in app/globalShortcuts/index.js and makes
// a for..of over disableGlobalShortcuts iterate characters or throw.
const { isPlainObject } = require("./validator");

/** @type {{flat: string, nested: string, inverted?: boolean, type?: string}[]} */
const RENAMES = [
  // Batch 1 (2.17.0)
  { flat: "globalShortcuts", nested: "shortcuts.global", type: "array" },
  {
    flat: "disableGlobalShortcuts",
    nested: "shortcuts.disableWhileFocused",
    type: "array",
  },
  { flat: "clearStorageData", nested: "storage.clearData" },
];

// Reads a dotted path, tolerating a missing intermediate object.
function readPath(source, path) {
  let node = source;
  for (const part of path.split(".")) {
    if (node === null || typeof node !== "object") return undefined;
    node = node[part];
  }
  return node;
}

// yargs turns the strings "true" and "false" into booleans for a declared
// boolean option, so negating the raw value would invert the wrong thing:
// "false" is truthy, and !"false" is false, the opposite of what the user
// wrote. A boolean leaf carrying a boolean raises no validator warning either,
// so this would be a silent flip rather than a reported type mismatch.
function toBoolean(value) {
  if (value === "false") return false;
  if (value === "true") return true;
  return Boolean(value);
}

// Mirrors the coercion yargs would have applied to the flat option: an array
// option given a scalar is wrapped, and an inverted boolean is negated.
function coerce(value, inverted, type) {
  if (inverted) return !toBoolean(value);
  if (type === "array" && !Array.isArray(value)) return [value];
  return value;
}

/**
 * Projects nested values onto their flat counterparts, in place.
 *
 * Presence is decided against the raw config file rather than the resolved
 * config. Asking the resolved config whether a leaf is `undefined` would only
 * work by accident: it relies on yargs replacing object options wholesale
 * instead of deep merging their defaults. Once that is fixed (gate A in
 * issue #2842) every unset leaf would resolve to its declared default, stop
 * being undefined, and be projected over the value the user actually set.
 *
 * @param {Record<string, unknown>} config the parsed yargs config, mutated.
 * @param {Record<string, unknown>} configFile the merged system and user
 *   config file contents; a nested path present here was set by the user.
 * @param {typeof RENAMES} renames override for tests.
 */
function applyRenamedOptions(config, configFile, renames = RENAMES) {
  if (!config || typeof config !== "object") return;

  for (const { flat, nested, inverted, type } of renames) {
    const value = readPath(configFile, nested);
    if (value === undefined) continue;

    // The new name wins when both are supplied; it is the canonical one.
    config[flat] = coerce(value, inverted, type);
  }
}

/**
 * Rewrites a config file's flat keys onto their nested targets, the inverse of
 * applyRenamedOptions. Never mutates the input.
 *
 * `coerce` serves both directions: negation is symmetric, and an array-typed
 * option needs wrapping on the way out for the same reason as on the way in.
 * Where both spellings are present the nested one is kept, matching runtime
 * precedence.
 *
 * Values otherwise move verbatim, which is not what yargs does. A flat option
 * declares a type, so yargs turns `"clearStorageData": "false"` into boolean
 * `false`; the nested leaf is undeclared and stays the truthy string. Callers
 * should run the result through validator.js, which reports type mismatches,
 * rather than assume the two files resolve alike.
 *
 * @param {Record<string, unknown>} configFile the USER config file, not the
 *   system-and-user merge from index.js: migrating that and writing it back as
 *   the user file would copy /etc values in, turning per-key admin policy into
 *   a whole-namespace user override.
 * @param {typeof RENAMES} renames override for tests.
 * @returns {Record<string, unknown>} a new config file object.
 */
function toNestedConfigFile(configFile, renames = RENAMES) {
  if (!isPlainObject(configFile)) return {};

  const result = structuredClone(configFile);

  for (const { flat, nested, inverted, type } of renames) {
    // Object.hasOwn, matching validator.js, so an inherited key cannot match.
    if (!Object.hasOwn(result, flat)) continue;

    const parts = nested.split(".");
    const leaf = parts.pop();

    let node = result;
    let reachable = true;
    for (const part of parts) {
      if (!Object.hasOwn(node, part)) node[part] = {};
      else if (!isPlainObject(node[part])) {
        reachable = false;
        break;
      }
      node = node[part];
    }

    // A namespace occupied by a non-object is the user's to fix; leave the
    // flat key rather than clobber it.
    if (!reachable) continue;

    if (!Object.hasOwn(node, leaf)) {
      node[leaf] = coerce(result[flat], inverted, type);
    }
    delete result[flat];
  }

  return result;
}

module.exports = { RENAMES, applyRenamedOptions, toNestedConfigFile };
