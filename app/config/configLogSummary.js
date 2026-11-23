const OTHER_KEYS = "[other keys]";

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// `shape` is the default for the same position in the config. A key is named
// only when the default has it too, so the names in the log are always ones
// the application declares; anything else in the file is counted, not shown.
function summarize(value, shape) {
  if (Array.isArray(value)) return `[array of ${value.length}]`;
  if (isPlainObject(value)) {
    if (!isPlainObject(shape)) return "[object]";
    const summary = {};
    let others = 0;
    for (const key of Object.keys(value)) {
      if (Object.hasOwn(shape, key)) {
        summary[key] = summarize(value[key], shape[key]);
      } else {
        others += 1;
      }
    }
    if (others > 0) summary[OTHER_KEYS] = others;
    return summary;
  }
  if (typeof value === "string") return value === "" ? "" : "[string]";
  if (typeof value === "number") return "[number]";
  return value;
}

/**
 * The config file as it may appear in a log: the names of the options it
 * sets, with booleans and null kept, and every other value replaced by a
 * placeholder for its type.
 *
 * The file's values are where the personal details live (broker and service
 * URLs, user names, commands, host lists), and a debug log is what users paste
 * into issues. Numbers are hidden as well: validation only warns, so a
 * password or user name written without quotes is a number here. Key names
 * are shown only where the option definitions declare them, so an object put
 * where a string belongs cannot leak through its keys. The declared names and
 * the on/off values are what triage needs: they show that the file was read
 * and which options it sets.
 *
 * @param {unknown} configFile - the parsed config file
 * @param {Record<string, { default?: unknown }>} options - option definitions (./options.js)
 * @returns {unknown}
 */
function summarizeConfigForLog(configFile, options) {
  const shape = {};
  for (const name of Object.keys(options ?? {})) {
    shape[name] = options[name]?.default;
  }
  return summarize(configFile, shape);
}

module.exports = { summarizeConfigForLog };
