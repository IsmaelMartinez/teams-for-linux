'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { base64urlEncode, base64urlDecode, generateClientDataJSON, sanitizeForFido2 } = require('../../app/webauthn/helpers');

// ─── helpers.js ─────────────────────────────────────────────────────────────

describe('WebAuthn helpers - base64url encoding', () => {
	it('encodes buffer to base64url (no padding, url-safe)', () => {
		const buf = Buffer.from([0xfb, 0xff, 0xfe]);
		const encoded = base64urlEncode(buf);
		assert.ok(!encoded.includes('+'), 'should not contain +');
		assert.ok(!encoded.includes('/'), 'should not contain /');
		assert.ok(!encoded.includes('='), 'should not contain padding');
		assert.strictEqual(encoded, '-__-');
	});

	it('decodes base64url back to buffer', () => {
		const original = Buffer.from([0xfb, 0xff, 0xfe]);
		const encoded = base64urlEncode(original);
		const decoded = base64urlDecode(encoded);
		assert.deepStrictEqual(decoded, original);
	});

	it('handles empty buffer', () => {
		const encoded = base64urlEncode(Buffer.alloc(0));
		assert.strictEqual(encoded, '');
		const decoded = base64urlDecode('');
		assert.strictEqual(decoded.length, 0);
	});

	it('roundtrips a 32-byte SHA-256 hash', () => {
		const { createHash } = require('node:crypto');
		const hash = createHash('sha256').update('test challenge').digest();
		const encoded = base64urlEncode(hash);
		const decoded = base64urlDecode(encoded);
		assert.deepStrictEqual(decoded, hash);
	});

	it('converts between base64url and standard base64', () => {
		// A credential ID from rlavriv's test output
		const standardBase64 = 'NWye1KCTIblpXx6vkYID8bVfaJ2mH7yWGEwVfdpoDIE=';
		const buf = Buffer.from(standardBase64, 'base64');
		const base64url = base64urlEncode(buf);
		// base64url should not have + / =
		assert.ok(!base64url.includes('+'));
		assert.ok(!base64url.includes('/'));
		assert.ok(!base64url.includes('='));
		// roundtrip back
		const back = base64urlDecode(base64url);
		assert.deepStrictEqual(back, buf);
	});
});

describe('WebAuthn helpers - generateClientDataJSON', () => {
	it('produces valid JSON with correct field order', () => {
		const challenge = Buffer.from('test-challenge-bytes');
		const json = generateClientDataJSON('webauthn.get', challenge, 'https://login.microsoft.com');
		const parsed = JSON.parse(json.toString('utf-8'));

		assert.strictEqual(parsed.type, 'webauthn.get');
		assert.strictEqual(parsed.origin, 'https://login.microsoft.com');
		assert.strictEqual(parsed.crossOrigin, false);
		// challenge should be base64url-encoded
		assert.strictEqual(typeof parsed.challenge, 'string');
		// Verify roundtrip
		const decodedChallenge = base64urlDecode(parsed.challenge);
		assert.deepStrictEqual(decodedChallenge, challenge);
	});

	it('uses webauthn.create type for credential creation', () => {
		const challenge = Buffer.from('create-challenge');
		const json = generateClientDataJSON('webauthn.create', challenge, 'https://login.microsoftonline.com');
		const parsed = JSON.parse(json.toString('utf-8'));
		assert.strictEqual(parsed.type, 'webauthn.create');
	});

	it('returns a Buffer', () => {
		const json = generateClientDataJSON('webauthn.get', Buffer.from('x'), 'https://example.com');
		assert.ok(Buffer.isBuffer(json));
	});
});

describe('WebAuthn helpers - sanitizeForFido2', () => {
	it('passes through clean strings', () => {
		assert.strictEqual(sanitizeForFido2('login.microsoft.com'), 'login.microsoft.com');
	});

	it('strips control characters including newlines', () => {
		assert.strictEqual(sanitizeForFido2('evil\ninjection'), 'evilinjection');
		assert.strictEqual(sanitizeForFido2('evil\r\ninjection'), 'evilinjection');
		assert.strictEqual(sanitizeForFido2('evil\x00null'), 'evilnull');
	});

	it('truncates to maxLength', () => {
		const long = 'a'.repeat(600);
		assert.strictEqual(sanitizeForFido2(long).length, 500);
		assert.strictEqual(sanitizeForFido2(long, 10).length, 10);
	});

	it('handles non-string input', () => {
		assert.strictEqual(sanitizeForFido2(null), '');
		assert.strictEqual(sanitizeForFido2(undefined), '');
		assert.strictEqual(sanitizeForFido2(123), '');
	});
});

// ─── fido2Backend.js - device parsing ───────────────────────────────────────

describe('WebAuthn fido2Backend - device path parsing', () => {
	// Replicate the regex from discoverDevices() to test without mocking execFile
	function parseDevicePaths(stdout) {
		return stdout
			.trim()
			.split('\n')
			.filter((line) => line.length > 0)
			.map((line) => {
				const match = line.match(/^(\/dev\/\S+?):/);
				return match ? match[1] : null;
			})
			.filter(Boolean);
	}

	it('parses single YubiKey device (rlavriv output)', () => {
		const output = '/dev/hidraw5: vendor=0x1050, product=0x0407 (Yubico YubiKey OTP+FIDO+CCID)\n';
		const devices = parseDevicePaths(output);
		assert.deepStrictEqual(devices, ['/dev/hidraw5']);
	});

	it('parses multiple devices', () => {
		const output = [
			'/dev/hidraw5: vendor=0x1050, product=0x0407 (Yubico YubiKey)',
			'/dev/hidraw11: vendor=0x1050, product=0x0120 (Yubico Security Key)',
		].join('\n');
		const devices = parseDevicePaths(output);
		assert.deepStrictEqual(devices, ['/dev/hidraw5', '/dev/hidraw11']);
	});

	it('handles empty output', () => {
		assert.deepStrictEqual(parseDevicePaths(''), []);
		assert.deepStrictEqual(parseDevicePaths('\n'), []);
	});

	it('strips trailing colon from device path', () => {
		// Bug 2 from community validation: trailing colon must be removed
		const output = '/dev/hidraw0: vendor=0x1050\n';
		const devices = parseDevicePaths(output);
		assert.strictEqual(devices[0], '/dev/hidraw0');
		assert.ok(!devices[0].endsWith(':'));
	});
});

// ─── fido2Backend.js - assertion output parsing ─────────────────────────────

describe('WebAuthn fido2Backend - assertion output parsing', () => {
	// Replicate the parsing logic from getAssertion() to test with captured output
	function parseAssertionOutput(stdout, rpId, allowCredentials) {
		const lines = stdout.trim().split('\n');
		const echoOffset = lines.length > 2 && lines[1] === rpId ? 2 : 0;
		const dataLines = lines.slice(echoOffset);

		if (dataLines.length < 2) {
			throw new Error(`Expected at least 2 lines, got ${dataLines.length}`);
		}

		const authData = Buffer.from(dataLines[0], 'base64');
		const signature = Buffer.from(dataLines[1], 'base64');
		let credentialId;
		if (dataLines.length >= 3) {
			credentialId = base64urlEncode(Buffer.from(dataLines[2], 'base64'));
		} else if (allowCredentials?.length === 1) {
			credentialId = allowCredentials[0].id;
		} else {
			throw new Error('No credential ID');
		}
		const userHandle = dataLines.length >= 4
			? base64urlEncode(Buffer.from(dataLines[3], 'base64'))
			: null;

		return { authData, signature, credentialId, userHandle };
	}

	it('parses resident assertion with echo offset (rlavriv fido2-tools 1.16.0)', () => {
		// Captured from rlavriv's test script output (without -h, with -r)
		const stdout = [
			'7nISPgbSl7qCoiFCvPYPUgUuOrf+ZG6yXdIKcCXY6vU=',       // echoed clientDataHash
			'login.microsoft.com',                                    // echoed rpId
			'WCU1bJ7UoJMhuWlfHq+RggPxtV9onaYfvJYYTBV92mgMgQUAAAA/', // authData
			'MEUCIQDKkAXNUi3UU9edMr1+ag5/kFrsoFP8btYu63fEUJEjMAIgX63DiInGGuKk1+Gr3IxRpUh80YT3wPugS8tELPzr1Bg=', // signature
			'T0Y60HIbtJ9OJkyKaflJ82fJHV7PVuL8814yAhxxzf/7gmgar/d6JnVQa3lk9VjY5ilM', // credentialId
		].join('\n');

		const result = parseAssertionOutput(stdout, 'login.microsoft.com', []);

		// Echo offset should be 2 (first two lines are echoed input)
		assert.strictEqual(result.authData.length, 39, 'authData should be 39 bytes');
		assert.ok(result.signature.length > 0, 'signature should not be empty');
		assert.ok(result.credentialId.length > 0, 'credentialId should be present');
		// credentialId should be base64url-encoded
		assert.ok(!result.credentialId.includes('+'));
		assert.ok(!result.credentialId.includes('/'));
	});

	it('parses assertion without echo offset', () => {
		// Some fido2-tools versions don't echo input back
		const stdout = [
			'WCU1bJ7UoJMhuWlfHq+RggPxtV9onaYfvJYYTBV92mgMgQUAAAA/', // authData
			'MEUCIQDKkAXNUi3UU9edMr1+ag5/kFrsoFP8btYu63fEUJEjMAIgX63DiInGGuKk1+Gr3IxRpUh80YT3wPugS8tELPzr1Bg=', // signature
		].join('\n');

		const result = parseAssertionOutput(stdout, 'login.microsoft.com', [
			{ id: 'test-cred-id', type: 'public-key' },
		]);

		assert.strictEqual(result.authData.length, 39);
		assert.ok(result.signature.length > 0);
		// With only 2 lines and single allowCredential, falls back to provided ID
		assert.strictEqual(result.credentialId, 'test-cred-id');
		assert.strictEqual(result.userHandle, null);
	});

	it('parses full resident assertion with userHandle (rlavriv output)', () => {
		const stdout = [
			'7nISPgbSl7qCoiFCvPYPUgUuOrf+ZG6yXdIKcCXY6vU=',
			'login.microsoft.com',
			'WCU1bJ7UoJMhuWlfHq+RggPxtV9onaYfvJYYTBV92mgMgQUAAAA/',
			'MEUCIQDKkAXNUi3UU9edMr1+ag5/kFrsoFP8btYu63fEUJEjMAIgX63DiInGGuKk1+Gr3IxRpUh80YT3wPugS8tELPzr1Bg=',
			'T0Y60HIbtJ9OJkyKaflJ82fJHV7PVuL8814yAhxxzf/7gmgar/d6JnVQa3lk9VjY5ilM',
			'fxEoxorlyfCKJ5o2h+R5OGHzYtLXybXCNm9MMhw9Ubw=',  // userHandle
		].join('\n');

		const result = parseAssertionOutput(stdout, 'login.microsoft.com', []);
		assert.ok(result.userHandle !== null, 'userHandle should be present');
		assert.ok(result.userHandle.length > 0);
	});

	it('throws when output has fewer than 2 data lines', () => {
		assert.throws(
			() => parseAssertionOutput('only-one-line\n', 'other.rp.id', []),
			/Expected at least 2 lines/,
		);
	});

	it('throws when no credential ID and multiple allowCredentials', () => {
		const stdout = [
			'AAAA', // authData (won't match rpId for echo)
			'BBBB', // signature
		].join('\n');

		assert.throws(
			() => parseAssertionOutput(stdout, 'login.microsoft.com', [
				{ id: 'cred1' },
				{ id: 'cred2' },
			]),
			/No credential ID/,
		);
	});
});

// ─── fido2Backend.js - credential creation output parsing ───────────────────

describe('WebAuthn fido2Backend - credential creation output parsing', () => {
	function parseCredOutput(stdout, rpId) {
		const lines = stdout.trim().split('\n');
		const echoOffset = lines.length > 2 && lines[1] === rpId ? 2 : 0;
		const dataLines = lines.slice(echoOffset);
		if (dataLines.length < 4) {
			throw new Error(`Expected at least 4 data lines, got ${dataLines.length}`);
		}

		return {
			fmt: dataLines[0].trim(),
			authData: Buffer.from(dataLines[1], 'base64'),
			credId: Buffer.from(dataLines[2], 'base64'),
			signature: Buffer.from(dataLines[3], 'base64'),
			x5c: dataLines.length >= 5 ? Buffer.from(dataLines[4], 'base64') : null,
		};
	}

	it('parses packed attestation with echo offset', () => {
		const stdout = [
			'aGFzaA==',              // echoed clientDataHash
			'login.microsoft.com',   // echoed rpId
			'packed',                // fmt
			'AAEC',                  // authData (3 bytes)
			'AwQF',                  // credId (3 bytes)
			'BgcI',                  // signature (3 bytes)
			'CQoL',                  // x5c certificate (3 bytes)
		].join('\n');

		const result = parseCredOutput(stdout, 'login.microsoft.com');
		assert.strictEqual(result.fmt, 'packed');
		assert.strictEqual(result.authData.length, 3);
		assert.strictEqual(result.credId.length, 3);
		assert.strictEqual(result.signature.length, 3);
		assert.ok(result.x5c !== null);
		assert.strictEqual(result.x5c.length, 3);
	});

	it('parses none attestation without x5c', () => {
		const stdout = [
			'none',    // fmt
			'AAEC',    // authData
			'AwQF',    // credId
			'BgcI',    // signature
		].join('\n');

		const result = parseCredOutput(stdout, 'other.rp.id');
		assert.strictEqual(result.fmt, 'none');
		assert.strictEqual(result.x5c, null);
	});

	it('throws with insufficient output lines', () => {
		assert.throws(
			() => parseCredOutput('packed\nAAEC\nAwQF\n', 'other.rp'),
			/Expected at least 4 data lines/,
		);
	});
});

// ─── fido2Backend.js - argument building ────────────────────────────────────

describe('WebAuthn fido2Backend - getAssertion argument construction', () => {
	// Replicate the arg-building logic from getAssertion()
	function buildAssertArgs(userVerification, hasAllowCredentials) {
		const args = ['-G'];
		if (!hasAllowCredentials) {
			args.push('-r');
		}
		if (userVerification === 'required') {
			args.push('-v');
		}
		return args;
	}

	it('uses -r for resident assertion (no allowCredentials)', () => {
		const args = buildAssertArgs('required', false);
		assert.ok(args.includes('-r'));
		assert.ok(args.includes('-v'));
		assert.deepStrictEqual(args, ['-G', '-r', '-v']);
	});

	it('omits -r when allowCredentials are provided', () => {
		const args = buildAssertArgs('required', true);
		assert.ok(!args.includes('-r'));
		assert.deepStrictEqual(args, ['-G', '-v']);
	});

	it('omits -v for preferred userVerification', () => {
		const args = buildAssertArgs('preferred', false);
		assert.ok(!args.includes('-v'));
		assert.deepStrictEqual(args, ['-G', '-r']);
	});

	it('omits -v for discouraged userVerification', () => {
		const args = buildAssertArgs('discouraged', true);
		assert.deepStrictEqual(args, ['-G']);
	});
});

describe('WebAuthn fido2Backend - createCredential argument construction', () => {
	// Replicate buildCredArgs() logic
	function buildCredArgs(authSel) {
		const args = ['-M', '-h'];
		if (authSel?.residentKey === 'required') {
			args.push('-r');
		}
		if (authSel?.userVerification === 'required') {
			args.push('-v');
		}
		return args;
	}

	it('builds basic args with no options', () => {
		assert.deepStrictEqual(buildCredArgs({}), ['-M', '-h']);
	});

	it('adds -r for resident key', () => {
		const args = buildCredArgs({ residentKey: 'required' });
		assert.ok(args.includes('-r'));
	});

	it('adds -v for required user verification', () => {
		const args = buildCredArgs({ userVerification: 'required' });
		assert.ok(args.includes('-v'));
	});

	it('does not add -v for preferred user verification', () => {
		const args = buildCredArgs({ userVerification: 'preferred' });
		assert.ok(!args.includes('-v'));
	});

	it('handles undefined authenticatorSelection', () => {
		assert.deepStrictEqual(buildCredArgs(undefined), ['-M', '-h']);
	});
});

// ─── fido2Backend.js - stdin construction ───────────────────────────────────

describe('WebAuthn fido2Backend - stdin line construction', () => {
	it('builds correct assertion input for resident credentials (no allowCredentials)', () => {
		const clientDataHash = Buffer.from('fake-hash-32-bytes-for-testing!!');
		const rpId = 'login.microsoft.com';
		const inputLines = [clientDataHash.toString('base64'), sanitizeForFido2(rpId)];

		assert.strictEqual(inputLines.length, 2);
		assert.strictEqual(inputLines[1], 'login.microsoft.com');
		// clientDataHash should be standard base64
		assert.ok(inputLines[0].length > 0);
	});

	it('builds correct assertion input with single allowCredential', () => {
		const clientDataHash = Buffer.from('fake-hash-32-bytes-for-testing!!');
		const rpId = 'login.microsoft.com';
		const credId = 'NWye1KCTIblpXx6vkYID8bVfaJ2mH7yWGEwVfdpoDIE'; // base64url
		const inputLines = [clientDataHash.toString('base64'), sanitizeForFido2(rpId)];

		// Simulate: only first credential from allowCredentials
		inputLines.push(base64urlDecode(credId).toString('base64'));

		assert.strictEqual(inputLines.length, 3);
		// Line 3 should be standard base64 (not base64url)
		const line3 = inputLines[2];
		assert.ok(!line3.includes('-'), 'credential ID on stdin should be standard base64');
		assert.ok(!line3.includes('_'), 'credential ID on stdin should be standard base64');
	});

	it('appends PIN as last line when provided', () => {
		const inputLines = ['hash', 'rpId'];
		const pin = '123456';

		const allLines = [...inputLines];
		if (pin) {
			allLines.push(pin.trim());
		}
		const stdin = allLines.join('\n') + '\n';

		assert.strictEqual(stdin, 'hash\nrpId\n123456\n');
	});

	it('does not append PIN when null', () => {
		const inputLines = ['hash', 'rpId'];
		const pin = null;

		const allLines = [...inputLines];
		if (pin) {
			allLines.push(pin.trim());
		}
		const stdin = allLines.join('\n') + '\n';

		assert.strictEqual(stdin, 'hash\nrpId\n');
	});

	it('trims PIN whitespace', () => {
		const inputLines = ['hash', 'rpId'];
		const pin = '  1234  ';

		const allLines = [...inputLines];
		if (pin) {
			allLines.push(pin.trim());
		}

		assert.strictEqual(allLines[2], '1234');
	});
});
