const log = require("electron-log/main");
const _ = require("lodash");
const { sanitize } = require("../utils/logSanitizer");

/**
 * Recursively sanitizes string values within an object
 * Preserves object structure while removing PII from string properties
 */
function sanitizeObject(obj, seen = new WeakSet()) {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  // Handle circular references
  if (seen.has(obj)) {
    return "[Circular]";
  }

  // Skip Error objects - preserve their structure
  if (obj instanceof Error) {
    const sanitizedError = new Error(sanitize(obj.message));
    sanitizedError.name = obj.name;
    if (obj.stack) {
      sanitizedError.stack = sanitize(obj.stack);
    }
    return sanitizedError;
  }

  seen.add(obj);

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map((item) => {
      if (typeof item === "string") {
        return sanitize(item);
      }
      if (typeof item === "object" && item !== null) {
        return sanitizeObject(item, seen);
      }
      return item;
    });
  }

  // Handle plain objects
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      result[key] = sanitize(value);
    } else if (typeof value === "object" && value !== null) {
      result[key] = sanitizeObject(value, seen);
    } else {
      result[key] = value;
    }
  }
  return result;
}

exports.init = function (config) {
  if (config) {
    if (config == "console") {
      console.debug("Initialising logger the default console");
      return;
    } else {
      console.debug(
        `Initialising logger with config: ${JSON.stringify(config)}`,
      );
      _.mergeWith(log, config, (obj, src) =>
        typeof obj === "function" ? Object.assign(obj, src) : undefined,
      );
      log.initialize();

      // Add PII sanitization hook to all log transports
      log.hooks.push((message) => {
        message.data = message.data.map((item) => {
          if (typeof item === "string") {
            return sanitize(item);
          }
          if (typeof item === "object" && item !== null) {
            return sanitizeObject(item);
          }
          return item;
        });
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
    console.log("Overwriting the console functions to disable the logs");
    console.log = function () {};
    console.info = function () {};
    console.debug = function () {};
    console.warn = function () {};
    console.error = function () {};
  }
};
