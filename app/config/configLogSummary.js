const OTHER_KEYS = "[other keys]";

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// The names an option declares: the keys of its default, plus every dot-path
// in its `fields` metadata. Some supported settings exist only in `fields`
// (their default leaves the parent empty or null), so the default alone would
// hide them. The result is a tree whose keys are declared names; leaves are
// irrelevant, only which keys exist matters.
function declaredShape(definition) {
  const fromDefault = (value) => {
    if (!isPlainObject(value)) return null;
    const shape = {};
    for (const key of Object.keys(value)) shape[key] = fromDefault(value[key]);
    return shape;
  };

  let shape = fromDefault(definition?.default);
  if (!isPlainObject(definition?.fields)) return shape;

  shape ??= {};
  for (const fieldPath of Object.keys(definition.fields)) {
    let node = shape;
    for (const part of fieldPath.split(".")) {
      if (!isPlainObject(node[part])) node[part] = {};
      node = node[part];
    }
  }
  return shape;
}

// A key is named only when `shape` has it too, so the names in the log are
// always ones the application declares; anything else in the file is counted,
// not shown. A declared leaf has an empty shape, so an object placed there is
// reported by type rather than walked.
function summarize(value, shape) {
  if (Array.isArray(value)) return `[array of ${value.length}]`;
  if (isPlainObject(value)) {
    if (!isPlainObject(shape) || Object.keys(shape).length === 0) return "[object]";
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
 * @param {Record<string, { default?: unknown, fields?: object }>} options - option definitions (./options.js)
 * @returns {unknown}
 */
function summarizeConfigForLog(configFile, options) {
  if (!isPlainObject(configFile)) return summarize(configFile, null);
  const summary = {};
  let others = 0;
  for (const name of Object.keys(configFile)) {
    if (isPlainObject(options) && Object.hasOwn(options, name)) {
      summary[name] = summarize(configFile[name], declaredShape(options[name]));
    } else {
      others += 1;
    }
  }
  if (others > 0) summary[OTHER_KEYS] = others;
  return summary;
}

module.exports = { summarizeConfigForLog };
