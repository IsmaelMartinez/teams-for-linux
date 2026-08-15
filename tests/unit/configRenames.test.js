'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { RENAMES, applyRenamedOptions } = require('../../app/config/renames');
const options = require('../../app/config/options');

// Reads a dotted path against the options schema, walking `fields` maps.
function schemaHas(path) {
	const [namespace, ...rest] = path.split('.');
	const def = options[namespace];
	if (!def) return false;
	if (rest.length === 0) return true;
	return Object.hasOwn(def.fields ?? {}, rest.join('.'));
}

describe('config renames - table integrity', () => {
	// Pins the table against options.js so the two cannot drift: every rename
	// must name a real deprecated flat option and a real nested target.
	it('every flat name is a declared option marked deprecated', () => {
		for (const { flat } of RENAMES) {
			assert.ok(options[flat], `${flat} is not a declared option`);
			assert.ok(options[flat].deprecated, `${flat} is not marked deprecated`);
		}
	});

	it('every deprecation message names its nested replacement', () => {
		for (const { flat, nested } of RENAMES) {
			assert.match(String(options[flat].deprecated), new RegExp(nested.replace('.', '\\.')));
		}
	});

	it('every nested target exists in the schema', () => {
		for (const { nested } of RENAMES) {
			assert.ok(schemaHas(nested), `${nested} is missing from options.js`);
		}
	});

	it('has no duplicate flat or nested names', () => {
		assert.strictEqual(new Set(RENAMES.map((r) => r.flat)).size, RENAMES.length);
		assert.strictEqual(new Set(RENAMES.map((r) => r.nested)).size, RENAMES.length);
	});
});

describe('applyRenamedOptions - precedence', () => {
	const table = [
		{ flat: 'globalShortcuts', nested: 'shortcuts.global' },
		{ flat: 'clearStorageData', nested: 'storage.clearData' },
	];

	it('leaves the flat value alone when the namespace was not supplied', () => {
		const config = { globalShortcuts: ['Ctrl+1'], shortcuts: { global: [] } };
		// `shortcuts` fell back to its default, so the user did not set it.
		const applied = applyRenamedOptions(config, { shortcuts: true }, table);
		assert.deepStrictEqual(config.globalShortcuts, ['Ctrl+1']);
		assert.deepStrictEqual(applied, []);
	});

	it('projects the nested value onto the flat key when the user supplied it', () => {
		const config = { globalShortcuts: [], shortcuts: { global: ['Ctrl+2'] } };
		const applied = applyRenamedOptions(config, {}, table);
		assert.deepStrictEqual(config.globalShortcuts, ['Ctrl+2']);
		assert.deepStrictEqual(applied, ['globalShortcuts']);
	});

	it('lets the nested name win when both are supplied', () => {
		const config = { globalShortcuts: ['old'], shortcuts: { global: ['new'] } };
		applyRenamedOptions(config, {}, table);
		assert.deepStrictEqual(config.globalShortcuts, ['new']);
	});

	// yargs replaces object options wholesale, so setting one leaf leaves its
	// siblings undefined; those must fall back to the flat value, not clobber it.
	it('keeps the flat value when a sibling leaf was dropped by wholesale replacement', () => {
		const config = {
			globalShortcuts: ['Ctrl+1'],
			clearStorageData: true,
			shortcuts: { global: ['Ctrl+2'] },
			storage: {},
		};
		applyRenamedOptions(config, {}, table);
		assert.deepStrictEqual(config.globalShortcuts, ['Ctrl+2']);
		assert.strictEqual(config.clearStorageData, true);
	});

	it('negates an inverted rename rather than copying it', () => {
		const inverted = [
			{ flat: 'disableNotifications', nested: 'notifications.enabled', inverted: true },
		];
		const config = { disableNotifications: false, notifications: { enabled: false } };
		applyRenamedOptions(config, {}, inverted);
		assert.strictEqual(config.disableNotifications, true);
	});

	// Nested leaves are not yargs options, so they miss the array coercion the
	// flat names get. Without this a scalar would reach Array.isArray checks and
	// for..of loops that expect a list.
	it('wraps a scalar into an array for array-typed renames', () => {
		const arrayTable = [{ flat: 'globalShortcuts', nested: 'shortcuts.global', type: 'array' }];
		const config = { globalShortcuts: [], shortcuts: { global: 'Control+Shift+M' } };
		applyRenamedOptions(config, {}, arrayTable);
		assert.deepStrictEqual(config.globalShortcuts, ['Control+Shift+M']);
	});

	it('leaves an array untouched for array-typed renames', () => {
		const arrayTable = [{ flat: 'globalShortcuts', nested: 'shortcuts.global', type: 'array' }];
		const config = { globalShortcuts: [], shortcuts: { global: ['A', 'B'] } };
		applyRenamedOptions(config, {}, arrayTable);
		assert.deepStrictEqual(config.globalShortcuts, ['A', 'B']);
	});

	it('every array-typed option in the real table declares type: array', () => {
		for (const { flat, type } of RENAMES) {
			if (options[flat]?.type === 'array') {
				assert.strictEqual(type, 'array', `${flat} must declare type: "array" to keep coercion`);
			}
		}
	});

	it('projects falsy nested values rather than skipping them', () => {
		const config = { clearStorageData: true, storage: { clearData: false } };
		applyRenamedOptions(config, {}, table);
		assert.strictEqual(config.clearStorageData, false);
	});

	it('tolerates a missing namespace, a missing defaulted map and a bad config', () => {
		const config = { globalShortcuts: ['Ctrl+1'] };
		assert.deepStrictEqual(applyRenamedOptions(config, undefined, table), []);
		assert.deepStrictEqual(config.globalShortcuts, ['Ctrl+1']);
		assert.deepStrictEqual(applyRenamedOptions(null, {}, table), []);
	});
});
