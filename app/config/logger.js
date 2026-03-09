const log = require("electron-log/main");
const { sanitizeLogData } = require("../utils/logSanitizer");

function mergeWith(target, source, customizer) {
  for (const key of Object.keys(source)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    const customResult = customizer(target[key], source[key], key);
    if (customResult !== undefined) {
      target[key] = customResult;
    } else if (
      source[key] && typeof source[key] === "object" && !Array.isArray(source[key]) &&
      target[key] && typeof target[key] === "object" && !Array.isArray(target[key])
    ) {
      mergeWith(target[key], source[key], customizer);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

exports.init = function (config) {
  if (config) {
    if (config === "console") {
      console.debug("Initialising logger the default console");
      return;
    } else {
      console.debug(
        `Initialising logger with config: ${JSON.stringify(config)}`,
      );
      mergeWith(log, config, (obj, src) =>
        typeof obj === "function" ? Object.assign(obj, src) : undefined,
      );
      log.initialize();

      // Add PII sanitization hook to all log transports
      log.hooks.push((message) => {
        message.data = sanitizeLogData(message.data);
        return message;
      });

      Object.assign(console, log.functions);
      if (log.transports?.file?.level) {
        console.debug(
          `File logging at ${log.transports.file.getFile().path} with level ${log.transports.file.level}`,
        );
      }
      if (log.transports?.console?.level) {
        console.debug(
          `Console logging enabled with level ${log.transports.console.level}`,
        );
      }
      console.debug("Logger initialised");
    }
  } else {
    console.info("Overwriting the console functions to disable the logs");
    console.log = function () {};
    console.info = function () {};
    console.debug = function () {};
    console.warn = function () {};
    console.error = function () {};
  }
};
