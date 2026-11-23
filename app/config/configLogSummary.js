/**
 * The config file as it may appear in a log: every option name, with booleans,
 * numbers and null kept, and strings and arrays replaced by a placeholder.
 *
 * The file's strings are where the personal details live (broker and service
 * URLs, user names, commands, host lists), and a debug log is what users paste
 * into issues. The names and the on/off values are what triage needs: they
 * show that the file was read and which options it sets.
 *
 * @param {unknown} value
 * @returns {unknown}
 */
function summarizeConfigForLog(value) {
  if (Array.isArray(value)) return `[array of ${value.length}]`;
  if (value && typeof value === "object") {
    const summary = {};
    for (const key of Object.keys(value)) {
      summary[key] = summarizeConfigForLog(value[key]);
    }
    return summary;
  }
  if (typeof value === "string") return value === "" ? "" : "[string]";
  return value;
}

module.exports = { summarizeConfigForLog };
