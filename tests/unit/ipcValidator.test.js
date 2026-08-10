'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { readdirSync, readFileSync, statSync } = require('node:fs');
const path = require('node:path');
const { validateIpcChannel, allowedChannels } = require('../../app/security/ipcValidator');

const APP_DIR = path.join(__dirname, '..', '..', 'app');

function collectSourceFiles(dir) {
	const found = [];
	for (const entry of readdirSync(dir)) {
		const full = path.join(dir, entry);
		if (statSync(full).isDirectory()) {
			found.push(...collectSourceFiles(full));
		} else if (/\.js$/.test(entry)) {
			found.push(full);
		}
	}
	return found;
}

// Both regexes are linear-time: no nested quantifiers. Matching runs on
// whole-file content, not per line — browserWindowManager.js registers
// channels with the literal on the line after `ipcMain.handle(`.
const IPC_REGISTRATION = /ipcMain\.(handle|on|once)\(/g;
const IPC_CHANNEL_LITERAL = /ipcMain\.(handle|on|once)\(\s*["']([^"']+)["']/g;

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
		assert.ok(!Object.hasOwn(payload, '__proto__'));
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
		assert.ok(!Object.hasOwn(payload.data.nested, '__proto__'));
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
		Object.defineProperty(current, '__proto__', { value: { isAdmin: true }, configurable: true, enumerable: true });

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

	// Every channel registered under app/ must be allowlisted or app/index.js's
	// ipcMain wrap rejects it at runtime as `Unauthorized IPC channel`. A
	// hardcoded expected list would only pin today's channels — a channel
	// registered later and forgotten in both the allowlist and the list passes
	// silently (the shape of the `manage-profile-pin` miss caught in review on
	// PR #2787). Scanning the source instead makes a new channel fail CI by
	// default (#2821).
	it('allowlists every channel registered under app/', () => {
		const offenders = [];
		let registrationCount = 0;
		let literalCount = 0;
		for (const file of collectSourceFiles(APP_DIR)) {
			const source = readFileSync(file, 'utf8');
			registrationCount += (source.match(IPC_REGISTRATION) || []).length;
			for (const match of source.matchAll(IPC_CHANNEL_LITERAL)) {
				literalCount++;
				if (!allowedChannels.has(match[2])) {
					offenders.push(`${path.relative(APP_DIR, file)}:${match[2]}`);
				}
			}
		}
		assert.deepStrictEqual(
			offenders,
			[],
			`Every registered IPC channel must be in app/security/ipcValidator.js's allowlist. Missing:\n  ${offenders.join('\n  ')}`
		);
		assert.strictEqual(
			registrationCount,
			literalCount,
			'An ipcMain.handle/on/once registration does not pass its channel as a string literal, so this scanner cannot verify it against the allowlist. A human must check the channel is allowlisted consciously (or make it a literal).'
		);
	});
});
