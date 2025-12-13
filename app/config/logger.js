import log from "electron-log/main.js";
import _ from "lodash";

export function init(config) {
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
}
