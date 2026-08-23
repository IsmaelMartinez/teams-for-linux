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

  // Batch 2 (2.18.0). Every remaining rename whose target namespace is
  // brand new, taken in one pass because they share the batch 1 mechanics
  // exactly. The 18 renames that land in the already-shipped network, auth,
  // idleDetection and notifications namespaces are deliberately NOT here:
  // yargs replaces an object option wholesale rather than deep merging it,
  // so a user moving one leaf into an existing namespace loses the declared
  // defaults of its siblings. That is gate A in issue #2842 and must land
  // first.
  //
  // customBackground
  { flat: "isCustomBackgroundEnabled", nested: "customBackground.enabled" },
  { flat: "customBGServiceBaseUrl", nested: "customBackground.serviceBaseUrl" },
  {
    flat: "customBGServiceConfigFetchInterval",
    nested: "customBackground.configFetchInterval",
  },
  // urlHandling
  { flat: "defaultURLHandler", nested: "urlHandling.defaultHandler" },
  { flat: "meetupJoinRegEx", nested: "urlHandling.meetupJoinRegEx" },
  {
    flat: "onNewWindowOpenMeetupJoinUrlInApp",
    nested: "urlHandling.openMeetupJoinInApp",
  },
  // incomingCalls
  { flat: "enableIncomingCallToast", nested: "incomingCalls.toast" },
  { flat: "incomingCallCommand", nested: "incomingCalls.command" },
  {
    flat: "incomingCallCommandArgs",
    nested: "incomingCalls.commandArgs",
    type: "array",
  },
  // appearance
  { flat: "customCSSName", nested: "appearance.cssName" },
  { flat: "customCSSLocation", nested: "appearance.cssLocation" },
  { flat: "followSystemTheme", nested: "appearance.followSystemTheme" },
  // platform
  { flat: "chromeUserAgent", nested: "platform.chromeUserAgent" },
  {
    flat: "emulateWinChromiumPlatform",
    nested: "platform.emulateWindowsChromium",
  },
  {
    flat: "spellCheckerLanguages",
    nested: "platform.spellCheckerLanguages",
    type: "array",
  },
  { flat: "disableTimestampOnCopy", nested: "platform.disableTimestampOnCopy" },
  // app
  { flat: "appTitle", nested: "app.title" },
  { flat: "url", nested: "app.url" },
  { flat: "partition", nested: "app.partition" },
  // window
  { flat: "frame", nested: "window.frame" },
  { flat: "menubar", nested: "window.menubar" },
  { flat: "minimized", nested: "window.minimized" },
  { flat: "closeAppOnCross", nested: "window.closeOnCross" },
  { flat: "minimizeOnClose", nested: "window.minimizeOnClose" },
  { flat: "alwaysOnTop", nested: "window.alwaysOnTop" },
  { flat: "class", nested: "window.class" },
  // tray
  { flat: "trayIconEnabled", nested: "tray.enabled" },
  { flat: "appIcon", nested: "tray.icon" },
  { flat: "appIconType", nested: "tray.iconType" },
  { flat: "useMutationTitleLogic", nested: "tray.useMutationTitleLogic" },
  // performance
  { flat: "disableGpu", nested: "performance.disableGpu" },
  {
    flat: "electronCLIFlags",
    nested: "performance.electronCLIFlags",
    type: "array",
  },
  // development
  { flat: "webDebug", nested: "development.webDebug" },
  { flat: "watchConfigFile", nested: "development.watchConfigFile" },
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
 * Whether the user supplied an option, under either spelling and by whichever
 * route that spelling actually works.
 *
 * Only needed where behaviour turns on an option being *set* rather than on its
 * value, which today is `disableGpu` alone: app/startup/commandLine.js
 * force-disables the GPU on Wayland unless the user has said otherwise, so
 * someone opting back in through the new `performance.disableGpu` name has to
 * count as having spoken. Reading the resolved config cannot answer this, since
 * a declared default is indistinguishable from a user-supplied value there.
 *
 * The scopes differ on purpose and match applyRenamedOptions. In the config file
 * both names work, so both count. On the command line only the flat name works,
 * because the projection above never looks at argv; counting `--performance.
 * disableGpu` there would report the user as having spoken while their value
 * stayed unprojected, leaving the Wayland branch to respect a default it
 * mistook for a choice.
 *
 * @param {Record<string, unknown>} configFile the merged system and user config
 *   file contents.
 * @param {string[]} argv process.argv, for the command line form of the flat
 *   name.
 * @param {string} flat the flat option name.
 * @returns {boolean}
 */
function isOptionSetByUser(configFile, argv, flat) {
  const rename = RENAMES.find((entry) => entry.flat === flat);
  const fileNames = rename ? [flat, rename.nested] : [flat];

  if (fileNames.some((name) => readPath(configFile, name) !== undefined)) {
    return true;
  }

  // startsWith rather than an exact match so `--disableGpu` and
  // `--disableGpu=false` both count, matching the check this replaced.
  return Array.isArray(argv) && argv.some((arg) => arg.startsWith(`--${flat}`));
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

module.exports = {
  RENAMES,
  applyRenamedOptions,
  isOptionSetByUser,
  toNestedConfigFile,
};
