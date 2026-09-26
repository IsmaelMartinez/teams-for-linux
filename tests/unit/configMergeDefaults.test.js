'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { deepMerge, applyObjectDefaults } = require('../../app/config/mergeDefaults');
const options = require('../../app/config/options');

describe('config mergeDefaults - deepMerge', () => {
	it('merges plain objects recursively with the override winning', () => {
		const base = { a: 1, nested: { x: 1, y: 2 } };
		const result = deepMerge(base, { nested: { y: 3 } });
		assert.deepStrictEqual(result, { a: 1, nested: { x: 1, y: 3 } });
	});

	it('replaces arrays instead of concatenating them', () => {
		assert.deepStrictEqual(deepMerge({ list: [1, 2] }, { list: [3] }), { list: [3] });
	});

	it('lets an explicit false or null override a truthy default', () => {
		assert.deepStrictEqual(
			deepMerge({ on: true, value: 'x' }, { on: false, value: null }),
			{ on: false, value: null },
		);
	});

	it('ignores a __proto__ key instead of swapping the prototype', () => {
		const result = deepMerge({ a: 1 }, JSON.parse('{"__proto__":{"polluted":true}}'));
		assert.strictEqual(Object.getPrototypeOf(result), Object.prototype);
		assert.strictEqual(result.polluted, undefined);
	});

	it('returns a non-object override as is', () => {
		assert.strictEqual(deepMerge({ a: 1 }, 'oops'), 'oops');
	});

	it('does not mutate either input', () => {
		const base = { nested: { x: 1 } };
		const override = { nested: { y: 2 } };
		const result = deepMerge(base, override);
		result.nested.x = 99;
		assert.deepStrictEqual(base, { nested: { x: 1 } });
		assert.deepStrictEqual(override, { nested: { y: 2 } });
	});
});

describe('config mergeDefaults - applyObjectDefaults', () => {
	it('keeps network.disableQuic when only webRTCIPHandlingPolicy is set', () => {
		const config = { network: { webRTCIPHandlingPolicy: 'default_public_interface_only' } };
		applyObjectDefaults(config, options);
		assert.strictEqual(config.network.disableQuic, true);
	});

	it('fills mqtt topic defaults for a partial mqtt block', () => {
		const config = { mqtt: { enabled: true, brokerUrl: 'mqtt://x' } };
		applyObjectDefaults(config, options);
		assert.strictEqual(config.mqtt.topicPrefix, 'teams');
		assert.strictEqual(config.mqtt.statusTopic, 'status');
		assert.strictEqual(config.mqtt.brokerUrl, 'mqtt://x');
	});

	it('keeps msTeamsProtocols.v2 when only v1 is set', () => {
		const config = { msTeamsProtocols: { v1: '^msteams:/l/' } };
		applyObjectDefaults(config, options);
		assert.strictEqual(config.msTeamsProtocols.v1, '^msteams:/l/');
		assert.strictEqual(config.msTeamsProtocols.v2, options.msTeamsProtocols.default.v2);
	});

	it('coerces a dotted CLI boolean string against a boolean default', () => {
		// Parsed like the CLI value, so the fixture carries no static type.
		const config = JSON.parse('{"network":{"disableQuic":"false"}}');
		applyObjectDefaults(config, options);
		assert.strictEqual(config.network.disableQuic, false);
	});

	it('leaves a string default alone when the value is "false"', () => {
		const config = { mqtt: { topicPrefix: 'false' } };
		applyObjectDefaults(config, options);
		assert.strictEqual(config.mqtt.topicPrefix, 'false');
	});

	it('updates the kebab-case alias yargs creates alongside the option', () => {
		const partial = { enabled: true };
		const config = { cacheManagement: partial, 'cache-management': partial };
		applyObjectDefaults(config, options);
		assert.strictEqual(config['cache-management'], config.cacheManagement);
		assert.strictEqual(config.cacheManagement.maxCacheSizeMB, 600);
	});

	it('does not touch an option whose value is not a plain object', () => {
		const config = { mqtt: 'oops' };
		applyObjectDefaults(config, options);
		assert.strictEqual(config.mqtt, 'oops');
	});
});

// Drives the real loader so dropping the applyObjectDefaults or deepMerge
// wiring in app/config/index.js fails here, not just the helper tests above.
describe('config loader - object defaults', () => {
	const electronPath = require.resolve('electron');
	const loggerPath = require.resolve('../../app/config/logger');
	const loaderPath = require.resolve('../../app/config');
	let configDir;
	let argv;

	before(() => {
		require.cache[electronPath] = {
			id: electronPath, filename: electronPath, loaded: true,
			exports: { ipcMain: { emit: () => {} } },
		};
		require.cache[loggerPath] = {
			id: loggerPath, filename: loggerPath, loaded: true,
			exports: { init: () => {} },
		};
		delete require.cache[loaderPath];
		argv = require('../../app/config');
		configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tfl-config-'));
		fs.writeFileSync(
			path.join(configDir, 'config.json'),
			JSON.stringify({ network: { webRTCIPHandlingPolicy: 'default_public_interface_only' } }),
		);
	});

	after(() => {
		delete require.cache[electronPath];
		delete require.cache[loggerPath];
		delete require.cache[loaderPath];
		fs.rmSync(configDir, { recursive: true, force: true });
	});

	it('keeps network.disableQuic when config.json sets only another network leaf', () => {
		const config = argv(configDir, '0.0.0');
		assert.strictEqual(config.network.webRTCIPHandlingPolicy, 'default_public_interface_only');
		assert.strictEqual(config.network.disableQuic, true);
	});
});
