'use strict';

const { beforeEach, afterEach } = require('node:test');

const LEVELS = ['debug', 'info', 'warn', 'error'];

/**
 * Replaces console.debug, info, warn and error for every test in the calling
 * file, and restores them afterwards. Returns the array the calls are recorded
 * in, as `{ level, args }` entries; it is emptied before each test.
 */
function captureConsole() {
	const logs = [];
	const originals = {};

	beforeEach(() => {
		logs.length = 0;
		for (const level of LEVELS) {
			originals[level] = console[level];
			console[level] = (...args) => logs.push({ level, args });
		}
	});

	afterEach(() => {
		for (const level of LEVELS) console[level] = originals[level];
	});

	return logs;
}

module.exports = { captureConsole };
