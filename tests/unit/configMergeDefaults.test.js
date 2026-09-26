'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
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
		const config = { network: { disableQuic: 'false' } };
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
