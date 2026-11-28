'use strict';

const { shared } = require('./contract');

const CALLER_FIELDS = shared.caller.fields.map(({ name }) => name);

/**
 * The caller of a ringing call as the contract declares it: only the declared
 * fields, and only values of type string, number or boolean. Anything else the
 * Teams page sends (a nested object, the caller's picture) is dropped. Returns
 * null when nothing is left. Both transports use it, so they cannot differ.
 */
function sanitizeCaller(details) {
	if (!details || typeof details !== 'object' || Array.isArray(details)) return null;
	const caller = {};
	for (const key of CALLER_FIELDS) {
		const value = details[key];
		if (['string', 'number', 'boolean'].includes(typeof value)) caller[key] = value;
	}
	return Object.keys(caller).length ? caller : null;
}

module.exports = { sanitizeCaller };
