'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { validateConfigFile } = require('../../app/config/validator');

// Inline fixtures — deliberately NOT the real app/config/options.js, so these
// tests stay independent of schema edits made elsewhere.
const definitions = {
	appTitle: { default: 'Teams', describe: 'Window title', type: 'string' },
	appActiveCheckInterval: { default: 2, describe: 'Poll interval', type: 'number' },
	closeAppOnCross: { default: false, describe: 'Close on cross', type: 'boolean' },
	customCSSLocation: { default: [], describe: 'CSS paths', type: 'array' },
	logConfig: { default: {}, describe: 'Log config', type: 'object' },
	followSystemTheme: { default: 'auto', describe: 'Theme', type: 'string', choices: ['auto', 'light', 'dark'] },
	untyped: { default: null, describe: 'No declared type' },
};

const definitionsWithFields = {
	mqtt: {
		default: {},
		describe: 'MQTT integration',
		type: 'object',
		fields: {
			enabled: { type: 'boolean', describe: 'Enable MQTT' },
			'homeAssistant.enabled': { type: 'boolean', describe: 'Enable HA discovery' },
			'homeAssistant.prefix': { type: 'string', describe: 'Discovery prefix' },
		},
	},
};

describe('Config Validator - input guards', () => {
	it('returns an empty array for null, undefined and non-object input', () => {
		assert.deepStrictEqual(validateConfigFile(null, definitions), []);
		assert.deepStrictEqual(validateConfigFile(undefined, definitions), []);
		assert.deepStrictEqual(validateConfigFile('not-an-object', definitions), []);
		assert.deepStrictEqual(validateConfigFile(42, definitions), []);
		assert.deepStrictEqual(validateConfigFile(['a', 'b'], definitions), []);
	});

	it('returns an empty array when option definitions are unusable', () => {
		assert.deepStrictEqual(validateConfigFile({ appTitle: 'x' }, null), []);
		assert.deepStrictEqual(validateConfigFile({ appTitle: 'x' }, 'nope'), []);
	});

	it('returns an empty array for an empty config object', () => {
		assert.deepStrictEqual(validateConfigFile({}, definitions), []);
	});
});

describe('Config Validator - top-level keys', () => {
	it('accepts a clean config without warnings', () => {
		const config = {
			appTitle: 'My Teams',
			appActiveCheckInterval: 5,
			closeAppOnCross: true,
			customCSSLocation: ['./styles/a.css'],
			logConfig: { transports: {} },
			followSystemTheme: 'dark',
			untyped: { anything: 'goes' },
		};
		assert.deepStrictEqual(validateConfigFile(config, definitions), []);
	});

	it('warns about unknown keys without failing', () => {
		const warnings = validateConfigFile({ foo: 'bar' }, definitions);
		assert.strictEqual(warnings.length, 1);
		assert.match(warnings[0], /Unknown config option "foo"/);
		assert.match(warnings[0], /will be ignored/);
	});

	it('warns about each class of type mismatch', () => {
		const config = {
			appTitle: 7,
			appActiveCheckInterval: 'fast',
			closeAppOnCross: 'yes',
			customCSSLocation: { path: './styles' },
			logConfig: ['not', 'an', 'object'],
		};
		const warnings = validateConfigFile(config, definitions);
		assert.strictEqual(warnings.length, 5);
		assert.match(warnings[0], /"appTitle" should be type "string" but got "number"/);
		assert.match(warnings[1], /"appActiveCheckInterval" should be type "number" but got "string"/);
		assert.match(warnings[2], /"closeAppOnCross" should be type "boolean" but got "string"/);
		assert.match(warnings[3], /"customCSSLocation" should be type "array" but got "object"/);
		assert.match(warnings[4], /"logConfig" should be type "object" but got "array"/);
	});

	it('treats null as "unset" rather than a type mismatch', () => {
		assert.deepStrictEqual(validateConfigFile({ logConfig: null }, definitions), []);
	});

	it('skips type checking when the definition has no type', () => {
		assert.deepStrictEqual(validateConfigFile({ untyped: 123 }, definitions), []);
	});

	it('warns when a value is not in the allowed choices', () => {
		const warnings = validateConfigFile({ followSystemTheme: 'neon' }, definitions);
		assert.strictEqual(warnings.length, 1);
		assert.strictEqual(warnings[0], 'Config option "followSystemTheme" must be one of [auto, light, dark]');
	});

	it('accepts a valid choice without warnings', () => {
		assert.deepStrictEqual(validateConfigFile({ followSystemTheme: 'light' }, definitions), []);
	});
});

describe('Config Validator - nested fields metadata', () => {
	it('accepts valid nested values without warnings', () => {
		const config = {
			mqtt: { enabled: true, homeAssistant: { enabled: false, prefix: 'ha' } },
		};
		assert.deepStrictEqual(validateConfigFile(config, definitionsWithFields), []);
	});

	it('warns about unknown nested leaf paths with dotted names', () => {
		const config = { mqtt: { homeAssistant: { enabld: true } } };
		const warnings = validateConfigFile(config, definitionsWithFields);
		assert.strictEqual(warnings.length, 1);
		assert.match(warnings[0], /Unknown config option "mqtt\.homeAssistant\.enabld"/);
	});

	it('warns about nested leaf type mismatches with dotted names', () => {
		const config = { mqtt: { enabled: 'yes', homeAssistant: { prefix: 5 } } };
		const warnings = validateConfigFile(config, definitionsWithFields);
		assert.strictEqual(warnings.length, 2);
		assert.match(warnings[0], /"mqtt\.enabled" should be type "boolean" but got "string"/);
		assert.match(warnings[1], /"mqtt\.homeAssistant\.prefix" should be type "string" but got "number"/);
	});

	it('warns when an intermediate object path holds a non-object', () => {
		const config = { mqtt: { homeAssistant: 'on' } };
		const warnings = validateConfigFile(config, definitionsWithFields);
		assert.strictEqual(warnings.length, 1);
		assert.match(warnings[0], /"mqtt\.homeAssistant" should be type "object" but got "string"/);
	});

	it('skips nested validation when no fields metadata exists', () => {
		const config = { logConfig: { totally: { madeUp: 'keys' } } };
		assert.deepStrictEqual(validateConfigFile(config, definitions), []);
	});
});

describe('Config Validator - safety', () => {
	it('never includes config values in warnings', () => {
		const config = {
			unknownKey: 'SECRET_VALUE_123',
			appActiveCheckInterval: 'SECRET_VALUE_123',
			followSystemTheme: 'SECRET_VALUE_123',
			mqtt: { brokerUrl: 'SECRET_VALUE_123', homeAssistant: { prefix: 123 } },
		};
		const warnings = validateConfigFile(config, { ...definitions, ...definitionsWithFields });
		assert.ok(warnings.length >= 4, `Expected at least 4 warnings, got ${warnings.length}`);
		assert.ok(!warnings.join('\n').includes('SECRET_VALUE_123'), 'Warnings must not contain config values');
	});

	it('returns a single generic warning if validation itself blows up', () => {
		const explosive = {};
		Object.defineProperty(explosive, 'appTitle', {
			enumerable: true,
			get() {
				throw new Error('SECRET_VALUE_123 should never leak');
			},
		});
		const warnings = validateConfigFile(explosive, definitions);
		assert.strictEqual(warnings.length, 1);
		assert.match(warnings[0], /could not complete/);
		assert.ok(!warnings[0].includes('SECRET_VALUE_123'));
	});
});

describe('Config Validator - review follow-ups', () => {
	const unionDefinitions = {
		logConfig: {
			default: { transports: { console: { level: 'info' }, file: { level: false } } },
			describe: 'Log config',
			type: 'object',
			fields: {
				'transports.console.level': { type: 'string|boolean', describe: 'Console level or false' },
				'transports.file.level': { type: 'string|boolean', describe: 'File level or false' },
			},
		},
		network: {
			default: { webRTCIPHandlingPolicy: null },
			describe: 'Network config',
			type: 'object',
			fields: {
				webRTCIPHandlingPolicy: { type: 'string', describe: 'WebRTC policy', choices: ['default', 'disable_non_proxied_udp'] },
			},
		},
	};

	it('accepts union types like string|boolean for nested leaves', () => {
		const config = { logConfig: { transports: { console: { level: false }, file: { level: 'debug' } } } };
		assert.deepStrictEqual(validateConfigFile(config, unionDefinitions), []);
	});

	it('still flags values matching no union component', () => {
		const config = { logConfig: { transports: { file: { level: 42 } } } };
		const warnings = validateConfigFile(config, unionDefinitions);
		assert.strictEqual(warnings.length, 1);
		assert.match(warnings[0], /logConfig\.transports\.file\.level/);
		assert.match(warnings[0], /string\|boolean/);
	});

	it('treats null as "unset" for type and choices checks', () => {
		const config = { network: { webRTCIPHandlingPolicy: null } };
		assert.deepStrictEqual(validateConfigFile(config, unionDefinitions), []);
	});

	it('enforces choices on nested leaves', () => {
		const config = { network: { webRTCIPHandlingPolicy: 'nonsense' } };
		const warnings = validateConfigFile(config, unionDefinitions);
		assert.strictEqual(warnings.length, 1);
		assert.match(warnings[0], /network\.webRTCIPHandlingPolicy/);
		assert.match(warnings[0], /must be one of \[default, disable_non_proxied_udp\]/);
		assert.ok(!warnings[0].includes('nonsense'), 'Warnings must not contain config values');
	});

	it('reports a literal __proto__ key as unknown instead of resolving it', () => {
		const config = JSON.parse('{"__proto__": {"polluted": true}}');
		const warnings = validateConfigFile(config, unionDefinitions);
		assert.strictEqual(warnings.length, 1);
		assert.match(warnings[0], /Unknown config option "__proto__"/);
	});
});
