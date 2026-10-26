// Flat-to-nested option renames from ADR-025, applied during the deprecation
// window. No Electron imports, mirroring validator.js and borrowing its
// isPlainObject rather than keeping a fourth copy of it.
//
// Both names work while a rename is in its window. The FLAT name stays the one
// every module reads, so no feature code is swept; a nested value is projected
// onto the flat key only when the user actually supplied it. The flat
// declarations, this table and the projection are deleted together at the end
// of the window (2.32.0, see issue #2842).
//
// "Supplied" covers the config file, command-line flags and environment
// variables alike (see readUserSources). Between sources the yargs order
// holds, command line over environment over config file; within one source
// the nested name beats the flat one.
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
const yargs = require("yargs");
const configOptions = require("./options");
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

  // Batch 2 (2.21.0). Every remaining rename whose target namespace is
  // brand new, taken in one pass because they share the batch 1 mechanics
  // exactly. The 18 renames that land in the already-shipped network, auth,
  // idleDetection and notifications namespaces are not here yet: they were
  // held on gate A in issue #2842 (yargs replacing an object option
  // wholesale), which mergeDefaults.js now fixes (#3011).
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

// Chromium command-line switches that yargs also camel-cases onto one of our
// options: `--disable-gpu` lands on disableGpu, and so on. Keyed by switch,
// valued by the flat option each sets today. Our docs tell users to pass
// `--disable-gpu`, and Chromium reads all three itself, so these spellings are
// PERMANENT: they never raise the deprecation warning, and they must keep
// driving the same behaviour after the flat names go. When the flat names are
// removed in 2.32.0, map these to the nested names (performance.disableGpu,
// network.proxyServer, auth.serverWhitelist) instead; chromiumSwitchTarget
// already resolves them through RENAMES where an entry exists. The camelCase
// (`--disableGpu`), `--no-` and environment spellings are ours and still warn.
const CHROMIUM_SWITCH_ALIASES = {
  "disable-gpu": "disableGpu",
  "proxy-server": "proxyServer",
  "auth-server-whitelist": "authServerWhitelist",
};

// The option a Chromium switch alias drives: the nested name once its rename
// exists, otherwise the flat one.
function chromiumSwitchTarget(switchName) {
  if (!Object.hasOwn(CHROMIUM_SWITCH_ALIASES, switchName)) return undefined;
  const flat = CHROMIUM_SWITCH_ALIASES[switchName];
  return RENAMES.find((entry) => entry.flat === flat)?.nested ?? flat;
}

// Whether yargs would take `next` as the value of a `--switch next` pair. A
// boolean only takes a literal true or false; anything else takes the next
// token unless it looks like another flag.
function takesNextToken(flat, next) {
  if (next === undefined) return false;
  if (configOptions[flat]?.type === "boolean") {
    return next === "true" || next === "false";
  }
  return !next.startsWith("-");
}

/**
 * argv with every Chromium switch alias removed, so a parse of the rest shows
 * what the user set through our own spellings alone.
 *
 * Matches the whole token, never a prefix or a pattern: `--disable-gpu` and
 * `--disable-gpu=<v>`, plus the two-token `--proxy-server <v>` that yargs also
 * accepts. `--disable-gpu-compositing` is a different switch and stays. Stops
 * at `--`, after which yargs reads nothing as an option.
 *
 * @param {string[]} argv the arguments yargs parses.
 * @returns {string[]}
 */
function withoutChromiumSwitchAliases(argv) {
  if (!Array.isArray(argv)) return [];
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") {
      rest.push(...argv.slice(i));
      break;
    }
    const eq = arg.indexOf("=");
    const name = (eq === -1 ? arg : arg.slice(0, eq)).slice(2);
    if (!arg.startsWith("--") || !Object.hasOwn(CHROMIUM_SWITCH_ALIASES, name)) {
      rest.push(arg);
      continue;
    }
    if (eq === -1 && takesNextToken(CHROMIUM_SWITCH_ALIASES[name], argv[i + 1])) {
      i++;
    }
  }
  return rest;
}

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

// Precedence between sources, highest first. Matches yargs itself, which lets a
// command-line flag beat an environment variable and both beat the config file.
const SOURCE_ORDER = ["cli", "env", "file"];

/**
 * What the user supplied, split by where it came from.
 *
 * The resolved config cannot answer "did the user set this?", because a
 * declared default looks the same as a supplied value there. So each source is
 * read on its own: the config file as given, and the command line and the
 * environment through two extra yargs passes that declare types but no
 * defaults, so a key is present only when the user wrote it. Letting yargs do
 * the parsing keeps its spellings (`--disable-gpu`, `--no-disableGpu`,
 * `DISABLE_GPU`, `PERFORMANCE__DISABLE_GPU`) without copying its rules here.
 *
 * Both spellings of every rename are declared with the flat option's type, so
 * `--window.frame=false` or `WINDOW__FRAME=false` reaches the projection as the
 * boolean `false` rather than a truthy string, and an array leaf arrives as an
 * array, exactly as yargs treats the flat name.
 *
 * @param {Record<string, unknown>} configFile the merged system and user
 *   config file contents.
 * @param {string[]} argv the arguments yargs parses (process.argv.slice(1)).
 * @param {typeof RENAMES} renames override for tests.
 * @returns {{cli: object, env: object, file: object}}
 */
function readUserSources(configFile, argv, renames = RENAMES) {
  return {
    cli: userParser(renames).parse(Array.isArray(argv) ? argv : []),
    env: userParser(renames).env(true).parse([]),
    file: isPlainObject(configFile) ? configFile : {},
  };
}

// A yargs parser that declares the types of both spellings of every rename
// but no defaults; see readUserSources. help and version off, so a `--help`
// meant for the main parse cannot print or exit from here.
function userParser(renames) {
  const types = {};
  for (const { flat, nested } of renames) {
    const type = configOptions[flat]?.type;
    types[flat] = { type };
    types[nested] = { type };
  }
  return yargs().options(types).help(false).version(false);
}

/**
 * The sources to judge deprecation against: as readUserSources, except that
 * the command line is read without the Chromium switch aliases, so an option
 * given only as `--disable-gpu` is not reported while `--disableGpu` still is.
 * The projection and isOptionSetByUser keep the full command line, so the
 * value still lands and `--disable-gpu` still counts as an explicit choice.
 *
 * @param {{cli?: object, env?: object, file?: object}} sources from
 *   readUserSources.
 * @param {string[]} argv the same arguments readUserSources parsed.
 * @param {typeof RENAMES} renames override for tests.
 */
function deprecationSources(sources, argv, renames = RENAMES) {
  return {
    ...sources,
    cli: userParser(renames).parse(withoutChromiumSwitchAliases(argv)),
  };
}

// The nested value that should reach the flat key, or undefined to leave the
// flat key as yargs resolved it. Walks the sources from highest precedence and
// stops at the first one naming either spelling: a nested name there wins, and
// a flat name there means yargs already put the right value on the flat key.
function suppliedNestedValue(sources, flat, nested) {
  for (const name of SOURCE_ORDER) {
    const source = sources?.[name];
    const value = readPath(source, nested);
    if (value !== undefined) return value;
    if (readPath(source, flat) !== undefined) return undefined;
  }
  return undefined;
}

/**
 * Projects nested values onto their flat counterparts, in place.
 *
 * Presence is decided against the raw sources rather than the resolved config.
 * Asking the resolved config whether a leaf is `undefined` stopped working once
 * mergeDefaults.js restored object defaults (gate A in issue #2842): every
 * unset leaf resolves to its declared default and would be projected over the
 * value the user actually set.
 *
 * @param {Record<string, unknown>} config the parsed yargs config, mutated.
 * @param {{cli?: object, env?: object, file?: object}} sources what the user
 *   supplied, per source; see readUserSources.
 * @param {typeof RENAMES} renames override for tests.
 */
function applyRenamedOptions(config, sources, renames = RENAMES) {
  if (!config || typeof config !== "object") return;

  for (const { flat, nested, inverted, type } of renames) {
    const value = suppliedNestedValue(sources, flat, nested);
    if (value === undefined) continue;
    config[flat] = coerce(value, inverted, type);
  }
}

/**
 * Whether the user supplied an option, under either spelling and from any
 * source.
 *
 * Only needed where behaviour turns on an option being *set* rather than on its
 * value, which today is `disableGpu` alone: app/startup/commandLine.js
 * force-disables the GPU on Wayland unless the user has said otherwise, so
 * someone opting back in through `performance.disableGpu`, on the command line
 * or in the environment as much as in the file, has to count as having spoken.
 * The sources are the ones applyRenamedOptions projects from, so the two can
 * never disagree about what the user said.
 *
 * @param {{cli?: object, env?: object, file?: object}} sources see
 *   readUserSources.
 * @param {string} flat the flat option name.
 * @returns {boolean}
 */
function isOptionSetByUser(sources, flat) {
  const rename = RENAMES.find((entry) => entry.flat === flat);
  const names = rename ? [flat, rename.nested] : [flat];

  return SOURCE_ORDER.some((source) =>
    names.some((name) => readPath(sources?.[source], name) !== undefined)
  );
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
  CHROMIUM_SWITCH_ALIASES,
  chromiumSwitchTarget,
  withoutChromiumSwitchAliases,
  deprecationSources,
  readPath,
  readUserSources,
  applyRenamedOptions,
  isOptionSetByUser,
  toNestedConfigFile,
};
