'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
	RENAMES,
	readPath,
	applyRenamedOptions,
	isOptionSetByUser,
	readStoredOption,
	writeStoredOption,
	toNestedConfigFile,
} = require('../../app/config/renames');
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
			// replaceAll, not replace: a target such as
			// idleDetection.checkInterval.detectIdle has more than one dot, and an
			// unescaped one would match any character.
			assert.match(String(options[flat].deprecated), new RegExp(nested.replaceAll('.', '\\.')));
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

	it('leaves the flat value alone when the config file has no nested key', () => {
		const config = { globalShortcuts: ['Ctrl+1'], shortcuts: { global: [] } };
		applyRenamedOptions(config, { globalShortcuts: ['Ctrl+1'] }, table);
		assert.deepStrictEqual(config.globalShortcuts, ['Ctrl+1']);
	});

	it('projects the nested value onto the flat key when the user supplied it', () => {
		const config = { globalShortcuts: [] };
		applyRenamedOptions(config, { shortcuts: { global: ['Ctrl+2'] } }, table);
		assert.deepStrictEqual(config.globalShortcuts, ['Ctrl+2']);
	});

	it('lets the nested name win when both are supplied', () => {
		const config = { globalShortcuts: ['old'] };
		applyRenamedOptions(
			config,
			{ globalShortcuts: ['old'], shortcuts: { global: ['new'] } },
			table
		);
		assert.deepStrictEqual(config.globalShortcuts, ['new']);
	});

	it('keeps the flat value for a sibling leaf the user did not set', () => {
		const config = { globalShortcuts: ['Ctrl+1'], clearStorageData: true };
		applyRenamedOptions(config, { shortcuts: { global: ['Ctrl+2'] } }, table);
		assert.deepStrictEqual(config.globalShortcuts, ['Ctrl+2']);
		assert.strictEqual(config.clearStorageData, true);
	});

	// Presence must come from the config file, not from the resolved config.
	// Reading the resolved config would only work while yargs replaces object
	// options wholesale; once defaults deep merge (gate A in #2842) every unset
	// leaf would resolve to its default and overwrite what the user set.
	it('ignores a nested default present only in the resolved config', () => {
		const config = { globalShortcuts: ['Ctrl+1'], shortcuts: { global: [] } };
		applyRenamedOptions(config, { globalShortcuts: ['Ctrl+1'] }, table);
		assert.deepStrictEqual(config.globalShortcuts, ['Ctrl+1']);
	});

	it('negates an inverted rename rather than copying it', () => {
		const inverted = [
			{ flat: 'disableNotifications', nested: 'notifications.enabled', inverted: true },
		];
		const config = { disableNotifications: false };
		applyRenamedOptions(config, { notifications: { enabled: false } }, inverted);
		assert.strictEqual(config.disableNotifications, true);
	});

	// Nested leaves are not yargs options, so they miss the array coercion the
	// flat names get. Without this a scalar would reach Array.isArray checks and
	// for..of loops that expect a list.
	it('wraps a scalar into an array for array-typed renames', () => {
		const arrayTable = [{ flat: 'globalShortcuts', nested: 'shortcuts.global', type: 'array' }];
		const config = { globalShortcuts: [] };
		applyRenamedOptions(config, { shortcuts: { global: 'Control+Shift+M' } }, arrayTable);
		assert.deepStrictEqual(config.globalShortcuts, ['Control+Shift+M']);
	});

	it('leaves an array untouched for array-typed renames', () => {
		const arrayTable = [{ flat: 'globalShortcuts', nested: 'shortcuts.global', type: 'array' }];
		const config = { globalShortcuts: [] };
		applyRenamedOptions(config, { shortcuts: { global: ['A', 'B'] } }, arrayTable);
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
		const config = { clearStorageData: true };
		applyRenamedOptions(config, { storage: { clearData: false } }, table);
		assert.strictEqual(config.clearStorageData, false);
	});

	it('tolerates a missing config file and a bad config', () => {
		const config = { globalShortcuts: ['Ctrl+1'] };
		applyRenamedOptions(config, undefined, table);
		assert.deepStrictEqual(config.globalShortcuts, ['Ctrl+1']);
		assert.doesNotThrow(() => applyRenamedOptions(null, {}, table));
	});
});

describe('toNestedConfigFile', () => {
	const table = [
		{ flat: 'globalShortcuts', nested: 'shortcuts.global', type: 'array' },
		{ flat: 'clearStorageData', nested: 'storage.clearData' },
		{ flat: 'disableNotifications', nested: 'notifications.enabled', inverted: true },
	];

	it('moves a flat key onto its nested target and drops the old name', () => {
		const migrated = toNestedConfigFile({ clearStorageData: true }, table);
		assert.deepStrictEqual(migrated, { storage: { clearData: true } });
	});

	it('does not mutate the config it was given', () => {
		const original = { clearStorageData: true };
		toNestedConfigFile(original, table);
		assert.deepStrictEqual(original, { clearStorageData: true });
	});

	it('passes keys outside the table through untouched', () => {
		const migrated = toNestedConfigFile({ appTitle: 'Teams', mqtt: { enabled: true } }, table);
		assert.deepStrictEqual(migrated, { appTitle: 'Teams', mqtt: { enabled: true } });
	});

	it('negates an inverted boolean rather than copying it', () => {
		const migrated = toNestedConfigFile({ disableNotifications: true }, table);
		assert.deepStrictEqual(migrated, { notifications: { enabled: false } });
	});

	it('wraps a scalar for an array-typed rename, as yargs would have', () => {
		const migrated = toNestedConfigFile({ globalShortcuts: 'Ctrl+1' }, table);
		assert.deepStrictEqual(migrated, { shortcuts: { global: ['Ctrl+1'] } });
	});

	it('merges into a namespace the config already uses', () => {
		const migrated = toNestedConfigFile(
			{ clearStorageData: true, storage: { cacheManagement: { enabled: true } } },
			table,
		);
		assert.deepStrictEqual(migrated, {
			storage: { cacheManagement: { enabled: true }, clearData: true },
		});
	});

	// Matches the precedence applyRenamedOptions applies at runtime, so the
	// migrated file resolves to the same settings as the file it came from.
	it('keeps the nested value and drops the flat one when both are set', () => {
		const migrated = toNestedConfigFile(
			{ clearStorageData: true, storage: { clearData: false } },
			table,
		);
		assert.deepStrictEqual(migrated, { storage: { clearData: false } });
	});

	it('leaves the flat key alone when its namespace is occupied by a non-object', () => {
		const migrated = toNestedConfigFile({ clearStorageData: true, storage: 'nonsense' }, table);
		assert.deepStrictEqual(migrated, { clearStorageData: true, storage: 'nonsense' });
	});

	it('tolerates a missing or non-object config file', () => {
		assert.deepStrictEqual(toNestedConfigFile(undefined, table), {});
		assert.deepStrictEqual(toNestedConfigFile(null, table), {});
		assert.deepStrictEqual(toNestedConfigFile('nonsense', table), {});
	});

	// The contract that makes the generated file safe to adopt.
	it('round-trips through applyRenamedOptions to the same flat values', () => {
		const original = {
			globalShortcuts: ['Ctrl+1'],
			clearStorageData: true,
			disableNotifications: true,
		};
		const migrated = toNestedConfigFile(original, table);

		// Resolved from nothing but the migrated file, so the projection has to
		// rebuild every flat value on its own. Seeding this from `original`
		// would pass even for a migration that did nothing at all.
		const resolved = {};
		applyRenamedOptions(resolved, migrated, table);

		assert.deepStrictEqual(resolved, original);
	});

	// A flat name that is also someone's namespace makes migration depend on
	// table order: whichever entry runs second finds the namespace occupied by
	// a non-object and is skipped. No collision exists today; this keeps it so.
	it('has no flat name that is also a namespace segment', () => {
		const flatNames = new Set(RENAMES.map(({ flat }) => flat));
		for (const { nested } of RENAMES) {
			for (const segment of nested.split('.').slice(0, -1)) {
				assert.ok(
					!flatNames.has(segment),
					`"${segment}" is both a flat option and a namespace in ${nested}`,
				);
			}
		}
	});

	it('migrates away every flat name in the real table', () => {
		const flatOnly = Object.fromEntries(RENAMES.map(({ flat }) => [flat, 'x']));
		const migrated = toNestedConfigFile(flatOnly);
		for (const { flat } of RENAMES) {
			assert.ok(!Object.hasOwn(migrated, flat), `${flat} should have been migrated away`);
		}
	});
});

describe('toNestedConfigFile - inverted booleans', () => {
	const table = [
		{ flat: 'disableNotifications', nested: 'notifications.enabled', inverted: true },
	];

	it('negates a real boolean', () => {
		assert.deepStrictEqual(
			toNestedConfigFile({ disableNotifications: true }, table),
			{ notifications: { enabled: false } },
		);
	});

	// yargs turns "false" into boolean false for a declared boolean option, so
	// the flat name leaves notifications ON. Negating the raw string would
	// produce `enabled: false` and silently turn them off, and a boolean at a
	// boolean leaf raises no validator warning to catch it.
	it('reads the strings yargs would have coerced before negating', () => {
		assert.deepStrictEqual(
			toNestedConfigFile({ disableNotifications: 'false' }, table),
			{ notifications: { enabled: true } },
		);
		assert.deepStrictEqual(
			toNestedConfigFile({ disableNotifications: 'true' }, table),
			{ notifications: { enabled: false } },
		);
	});
});

// Every rename must default to the same behaviour under either name, so a
// config that sets neither resolves alike once modules read the nested leaf.
// The inverted ones are the trap: `disableNotifications: false` must pair with
// `notifications.enabled: true`, not a copied `false`.
describe('config renames - default parity', () => {
	it('every nested default matches its flat default, negated where inverted', () => {
		for (const { flat, nested, inverted } of RENAMES) {
			const [namespace, ...rest] = nested.split('.');
			const nestedDefault = readPath(options[namespace].default, rest.join('.'));
			const expected = inverted ? !options[flat].default : options[flat].default;
			assert.deepStrictEqual(nestedDefault, expected, `${flat} -> ${nested}`);
		}
	});
});

// A stand-in for electron-store, which resolves dotted keys as nested paths.
function fakeStore(data) {
	const parentOf = (key) => {
		const parts = key.split('.');
		const leaf = parts.pop();
		let node = data;
		for (const part of parts) node = node[part] ??= {};
		return { node, leaf };
	};
	return {
		data,
		has: (key) => readPath(data, key) !== undefined,
		get: (key) => readPath(data, key),
		set: (key, value) => {
			const { node, leaf } = parentOf(key);
			node[leaf] = value;
		},
		delete: (key) => {
			const { node, leaf } = parentOf(key);
			delete node[leaf];
		},
	};
}

// Menu toggles persist to the user's config.json through electron-store, and
// app/index.js re-applies them after the loader has projected the nested
// names. Both sides have to agree on which spelling wins.
describe('readStoredOption and writeStoredOption', () => {
	it('reads the nested spelling over the flat one, back in flat polarity', () => {
		const store = fakeStore({ disableNotifications: false, notifications: { enabled: false } });
		assert.strictEqual(readStoredOption(store, 'disableNotifications'), true);
	});

	it('falls back to the flat spelling, then to undefined', () => {
		assert.strictEqual(readStoredOption(fakeStore({ disableBadgeCount: true }), 'disableBadgeCount'), true);
		assert.strictEqual(readStoredOption(fakeStore({}), 'disableBadgeCount'), undefined);
	});

	it('writes a toggle under the nested name, negated, and drops the flat key', () => {
		const store = fakeStore({ disableNotifications: false, notifications: { enabled: true, timeoutType: 'never' } });
		writeStoredOption(store, 'disableNotifications', true);
		assert.deepStrictEqual(store.data, { notifications: { enabled: false, timeoutType: 'never' } });
	});

	it('round-trips a toggle so the next start reads what the menu wrote', () => {
		for (const [flat, value] of [['disableNotificationSound', true], ['defaultNotificationUrgency', 'critical'], ['appIcon', '/x.png']]) {
			const store = fakeStore({});
			writeStoredOption(store, flat, value);
			assert.strictEqual(readStoredOption(store, flat), value, flat);
			// The loader reads the same file, so its projection agrees too.
			const config = {};
			applyRenamedOptions(config, store.data);
			assert.strictEqual(config[flat], value, flat);
		}
	});

	it('writes an option outside the table under its own name', () => {
		const store = fakeStore({});
		writeStoredOption(store, 'notARenamedOption', 1);
		assert.deepStrictEqual(store.data, { notARenamedOption: 1 });
	});
});

describe('isOptionSetByUser', () => {
	it('sees the flat name in the config file', () => {
		assert.strictEqual(isOptionSetByUser({ disableGpu: false }, [], 'disableGpu'), true);
	});

	it('sees the nested name in the config file', () => {
		assert.strictEqual(
			isOptionSetByUser({ performance: { disableGpu: false } }, [], 'disableGpu'),
			true
		);
	});

	it('sees the flat name on the command line', () => {
		assert.strictEqual(isOptionSetByUser({}, ['--disableGpu'], 'disableGpu'), true);
		assert.strictEqual(isOptionSetByUser({}, ['--disableGpu=false'], 'disableGpu'), true);
		assert.strictEqual(isOptionSetByUser({}, ['--disableGpu', 'false'], 'disableGpu'), true);
	});

	// Every spelling below was confirmed against yargs to set `disableGpu`:
	// camel-case expansion makes --disable-gpu the same option, and boolean
	// negation adds --no- in front of both forms.
	it('sees the kebab-case and negated spellings yargs also accepts', () => {
		for (const arg of [
			'--no-disableGpu',
			'--disable-gpu',
			'--disable-gpu=false',
			'--no-disable-gpu',
		]) {
			assert.strictEqual(isOptionSetByUser({}, [arg], 'disableGpu'), true, arg);
		}
	});

	// A prefix match would count this, but yargs treats it as its own unknown
	// option and leaves disableGpu at the default, so nothing was ever set.
	it('ignores a longer option that merely starts with the flat name', () => {
		assert.strictEqual(isOptionSetByUser({}, ['--disableGpuFoo'], 'disableGpu'), false);
		assert.strictEqual(
			isOptionSetByUser({}, ['--disableGpuFoo=true'], 'disableGpu'),
			false
		);
	});

	// applyRenamedOptions never reads argv, so a nested name on the command line
	// does not reach the flat key modules read. Counting it as "set" would tell
	// the Wayland branch to respect a value that was never projected.
	it('ignores a nested name on the command line, matching the projection', () => {
		assert.strictEqual(
			isOptionSetByUser({}, ['--performance.disableGpu=true'], 'disableGpu'),
			false
		);
	});

	it('is false when the user said nothing', () => {
		assert.strictEqual(isOptionSetByUser({}, [], 'disableGpu'), false);
		assert.strictEqual(
			isOptionSetByUser({ performance: {} }, ['--webDebug'], 'disableGpu'),
			false
		);
	});

	// A false value still counts as the user having spoken; that is the whole
	// point for disableGpu, where `false` means "keep the GPU on".
	it('counts a falsy value as set', () => {
		assert.strictEqual(
			isOptionSetByUser({ performance: { disableGpu: false } }, [], 'disableGpu'),
			true
		);
	});

	it('checks only the flat name for an option with no rename', () => {
		assert.strictEqual(isOptionSetByUser({ mqtt: { enabled: true } }, [], 'mqtt'), true);
		assert.strictEqual(isOptionSetByUser({}, [], 'mqtt'), false);
	});

	it('tolerates a missing config file and a missing argv', () => {
		assert.doesNotThrow(() => isOptionSetByUser(undefined, undefined, 'disableGpu'));
		assert.strictEqual(isOptionSetByUser(undefined, undefined, 'disableGpu'), false);
	});
});
