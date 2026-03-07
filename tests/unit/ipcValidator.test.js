'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { validateIpcChannel, allowedChannels } = require('../../app/security/ipcValidator');

describe('IPC Validator - Channel validation', () => {
	it('accepts all channels in the allowlist', () => {
		for (const channel of allowedChannels) {
			assert.strictEqual(validateIpcChannel(channel), true, `Expected '${channel}' to be allowed`);
		}
	});

	it('rejects unknown channels', () => {
		const unknownChannels = [
			'evil-channel',
			'run-arbitrary-code',
			'',
			'get-config-modified',
			'GET-CONFIG',
			'get-config ',
			' get-config',
		];
		for (const channel of unknownChannels) {
			assert.strictEqual(validateIpcChannel(channel), false, `Expected '${channel}' to be rejected`);
		}
	});

	it('rejects non-string channel values', () => {
		assert.strictEqual(validateIpcChannel(undefined), false);
		assert.strictEqual(validateIpcChannel(null), false);
		assert.strictEqual(validateIpcChannel(123), false);
		assert.strictEqual(validateIpcChannel({}), false);
	});
});

describe('IPC Validator - Payload sanitisation', () => {
	it('removes __proto__ from payloads', () => {
		const payload = JSON.parse('{"__proto__": {"isAdmin": true}, "name": "test"}');
		validateIpcChannel('get-config', payload);
		assert.strictEqual(payload.__proto__?.isAdmin, undefined);
		assert.strictEqual(payload.name, 'test');
	});

	it('removes constructor property from payloads', () => {
		const payload = { constructor: { prototype: { isAdmin: true } }, name: 'test' };
		validateIpcChannel('get-config', payload);
		assert.ok(!Object.hasOwn(payload, 'constructor') || typeof payload.constructor === 'function');
		assert.strictEqual(payload.name, 'test');
	});

	it('removes prototype property from payloads', () => {
		const payload = { prototype: { isAdmin: true }, name: 'test' };
		validateIpcChannel('get-config', payload);
		assert.ok(!Object.hasOwn(payload, 'prototype'));
		assert.strictEqual(payload.name, 'test');
	});

	it('sanitises nested objects recursively', () => {
		const payload = JSON.parse('{"data": {"nested": {"__proto__": {"isAdmin": true}}, "value": 1}}');
		validateIpcChannel('get-config', payload);
		assert.strictEqual(payload.data.nested.__proto__?.isAdmin, undefined);
		assert.strictEqual(payload.data.value, 1);
	});

	it('handles deeply nested payloads up to MAX_SANITIZE_DEPTH', () => {
		// Build a 12-level deep object with __proto__ at level 11
		let obj = { clean: true };
		let current = obj;
		for (let i = 0; i < 11; i++) {
			current.child = { level: i };
			current = current.child;
		}
		current.__proto__ = { isAdmin: true };

		validateIpcChannel('get-config', obj);
		// At depth > 10, sanitisation stops, so the deep __proto__ may remain
		// The important thing is it doesn't throw
		assert.strictEqual(obj.clean, true);
	});

	it('handles null payload gracefully', () => {
		assert.strictEqual(validateIpcChannel('get-config', null), true);
	});

	it('handles primitive payloads gracefully', () => {
		assert.strictEqual(validateIpcChannel('get-config', 'string'), true);
		assert.strictEqual(validateIpcChannel('get-config', 42), true);
		assert.strictEqual(validateIpcChannel('get-config', true), true);
	});

	it('handles array payloads', () => {
		const payload = [{ __proto__: { isAdmin: true } }, { name: 'safe' }];
		// Arrays are objects, so sanitisation should process them
		validateIpcChannel('get-config', payload);
		assert.strictEqual(payload[1].name, 'safe');
	});
});

describe('IPC Validator - Allowlist completeness', () => {
	it('has a non-empty allowlist', () => {
		assert.ok(allowedChannels.size > 0, 'Allowlist should not be empty');
	});

	it('contains expected core channels', () => {
		const expectedChannels = [
			'get-config',
			'get-app-version',
			'user-status-changed',
			'set-badge-count',
			'navigate-back',
			'navigate-forward',
			'play-notification-sound',
			'show-notification',
			'select-source',
			'submitForm',
			'offline-retry',
		];
		for (const channel of expectedChannels) {
			assert.ok(allowedChannels.has(channel), `Expected core channel '${channel}' in allowlist`);
		}
	});
});
