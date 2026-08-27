'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { encode: cborEncode, decode: cborDecode } = require('cbor-x');
const { base64urlEncode, base64urlDecode, generateClientDataJSON, sanitizeForFido2 } = require('../../app/webauthn/helpers');

// ─── Test helpers hoisted to module scope (replicas of fido2Backend.js logic) ──

/** Replicates discoverDevices()'s regex-based parsing. */
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

/** Replicates parseAssertionOutput() for captured-stdout fixtures. */
function parseAssertionOutput(stdout, rpId, credentialId) {
	const lines = stdout.trim().split('\n');
	const echoOffset = lines.length > 2 && lines[1] === rpId ? 2 : 0;
	const dataLines = lines.slice(echoOffset);

	if (dataLines.length < 2) {
		throw new Error(`Expected at least 2 lines, got ${dataLines.length}`);
	}

	const authData = cborDecode(Buffer.from(dataLines[0], 'base64'));
	const signature = Buffer.from(dataLines[1], 'base64');
	const userHandle = dataLines.length >= 3
		? base64urlEncode(Buffer.from(dataLines[2], 'base64'))
		: null;

	return { authData, signature, credentialId, userHandle };
}

/** Replicates the createCredential() stdout parsing logic. */
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

/** Replicates the getAssertion() argument-building logic. */
function buildAssertArgs(userVerification) {
	const args = ['-G'];
	if (userVerification === 'required') {
		args.push('-v');
	}
	return args;
}

/** Replicates buildCredArgs() from fido2Backend.js. */
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

	// A ceremony relayed out of a login iframe signs the iframe's origin, with
	// the top-level document recorded separately (#2828).
	it('marks a ceremony cross-origin and records topOrigin when the frame differs', () => {
		const json = generateClientDataJSON(
			'webauthn.get',
			Buffer.from('c'),
			'https://login.live.com',
			'https://login.microsoft.com'
		);
		const parsed = JSON.parse(json.toString('utf-8'));

		assert.strictEqual(parsed.origin, 'https://login.live.com');
		assert.strictEqual(parsed.crossOrigin, true);
		assert.strictEqual(parsed.topOrigin, 'https://login.microsoft.com');
	});

	it('omits topOrigin and stays same-origin for a main-frame ceremony', () => {
		const sameOrigin = generateClientDataJSON(
			'webauthn.get',
			Buffer.from('c'),
			'https://login.microsoft.com',
			'https://login.microsoft.com'
		);
		const parsed = JSON.parse(sameOrigin.toString('utf-8'));

		assert.strictEqual(parsed.crossOrigin, false);
		assert.ok(!('topOrigin' in parsed));
		// Pinned to the exact pre-#2829 byte layout, so main-frame logins are
		// untouched by construction, not by both calls drifting together.
		assert.strictEqual(
			sameOrigin.toString('utf-8'),
			'{"type":"webauthn.get","challenge":"Yw","origin":"https://login.microsoft.com","crossOrigin":false}'
		);
		const withoutTopOrigin = generateClientDataJSON(
			'webauthn.get',
			Buffer.from('c'),
			'https://login.microsoft.com'
		);
		assert.deepStrictEqual(sameOrigin, withoutTopOrigin);
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
	it('parses a resident assertion with echo offset, reading the final line as the user id (rlavriv fido2-tools 1.16.0)', () => {
		// Captured from rlavriv's test script output (without -h, with -r).
		// Per fido2-assert(1) OUTPUT FORMAT the lines are: echoed clientDataHash,
		// echoed rpId, authData, signature, and the user id when the credential
		// is resident. No credential id is ever printed.
		const stdout = [
			'7nISPgbSl7qCoiFCvPYPUgUuOrf+ZG6yXdIKcCXY6vU=',       // echoed clientDataHash
			'login.microsoft.com',                                    // echoed rpId
			'WCU1bJ7UoJMhuWlfHq+RggPxtV9onaYfvJYYTBV92mgMgQUAAAA/', // authData
			'MEUCIQDKkAXNUi3UU9edMr1+ag5/kFrsoFP8btYu63fEUJEjMAIgX63DiInGGuKk1+Gr3IxRpUh80YT3wPugS8tELPzr1Bg=', // signature
			'T0Y60HIbtJ9OJkyKaflJ82fJHV7PVuL8814yAhxxzf/7gmgar/d6JnVQa3lk9VjY5ilM', // user id
		].join('\n');

		const result = parseAssertionOutput(stdout, 'login.microsoft.com', 'enumerated-cred-id');

		// After CBOR decode, the 39-byte CBOR wrapper yields a 37-byte authData payload
		assert.strictEqual(result.authData.length, 37, 'authData should be 37 bytes after CBOR decode');
		assert.ok(result.signature.length > 0, 'signature should not be empty');
		assert.strictEqual(result.credentialId, 'enumerated-cred-id');
		assert.ok(result.userHandle.length > 0, 'userHandle should be present');
		// userHandle should be base64url-encoded
		assert.ok(!result.userHandle.includes('+'));
		assert.ok(!result.userHandle.includes('/'));
	});

	it('parses a non-resident assertion without echo offset and without a user id line', () => {
		// Some fido2-tools versions don't echo input back
		const stdout = [
			'WCU1bJ7UoJMhuWlfHq+RggPxtV9onaYfvJYYTBV92mgMgQUAAAA/', // authData
			'MEUCIQDKkAXNUi3UU9edMr1+ag5/kFrsoFP8btYu63fEUJEjMAIgX63DiInGGuKk1+Gr3IxRpUh80YT3wPugS8tELPzr1Bg=', // signature
		].join('\n');

		const result = parseAssertionOutput(stdout, 'login.microsoft.com', 'test-cred-id');

		assert.strictEqual(result.authData.length, 37);
		assert.ok(result.signature.length > 0);
		assert.strictEqual(result.credentialId, 'test-cred-id');
		assert.strictEqual(result.userHandle, null);
	});

	it('throws when output has fewer than 2 data lines', () => {
		assert.throws(
			() => parseAssertionOutput('only-one-line\n', 'other.rp.id', 'cred-id'),
			/Expected at least 2 lines/,
		);
	});
});

// ─── fido2Backend.js - resident credential enumeration ──────────────────────

describe('WebAuthn fido2Backend - resident credential list parsing', () => {
	const { _parseResidentCredentialList } = require('../../app/webauthn/fido2Backend');

	it('parses a credential line into base64url id and user handle', () => {
		// fido2-token -L -k output (libfido2 tools/credman.c print_rk):
		// "NN: <credId base64> <displayName> <userId base64> <type> <prot>"
		const stdout = '00: T0Y60HIbtJ9OJkyKaflJ82fJHV7PVuL8814yAhxxzf/7gmgar/d6JnVQa3lk9VjY5ilM user@example.com fxEoxorlyfCKJ5o2h+R5OGHzYtLXybXCNm9MMhw9Ubw= es256 uvopt\n';

		const creds = _parseResidentCredentialList(stdout);

		assert.strictEqual(creds.length, 1);
		assert.strictEqual(creds[0].credentialId, 'T0Y60HIbtJ9OJkyKaflJ82fJHV7PVuL8814yAhxxzf_7gmgar_d6JnVQa3lk9VjY5ilM');
		assert.strictEqual(creds[0].userHandle, 'fxEoxorlyfCKJ5o2h-R5OGHzYtLXybXCNm9MMhw9Ubw');
	});

	it('handles display names containing spaces', () => {
		const stdout = '01: AAAA Some Display Name BBBB es256 uvopt+uvblocked\n';

		const creds = _parseResidentCredentialList(stdout);

		assert.strictEqual(creds.length, 1);
		assert.strictEqual(creds[0].credentialId, 'AAAA');
		assert.strictEqual(creds[0].userHandle, 'BBBB');
	});

	it('parses multiple credentials', () => {
		const stdout = '00: AAAA one CCCC es256 uvopt\n01: BBBB two DDDD es256 uvopt\n';

		const creds = _parseResidentCredentialList(stdout);

		assert.strictEqual(creds.length, 2);
		assert.strictEqual(creds[0].credentialId, 'AAAA');
		assert.strictEqual(creds[1].credentialId, 'BBBB');
	});

	it('ignores lines that are not credential entries', () => {
		assert.deepStrictEqual(_parseResidentCredentialList(''), []);
		assert.deepStrictEqual(_parseResidentCredentialList('Enter PIN for /dev/hidraw2:\n'), []);
		assert.deepStrictEqual(_parseResidentCredentialList('fido2-token: fido_credman_get_dev_rk: FIDO_ERR_INVALID_ARGUMENT\n'), []);
	});
});

// ─── fido2Backend.js - credential creation output parsing ───────────────────

describe('WebAuthn fido2Backend - credential creation output parsing', () => {
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
	it('adds -v for required userVerification', () => {
		const args = buildAssertArgs('required');
		assert.deepStrictEqual(args, ['-G', '-v']);
	});

	it('omits -v for preferred userVerification', () => {
		const args = buildAssertArgs('preferred');
		assert.deepStrictEqual(args, ['-G']);
	});

	it('omits -v for discouraged userVerification', () => {
		const args = buildAssertArgs('discouraged');
		assert.deepStrictEqual(args, ['-G']);
	});
});

describe('WebAuthn fido2Backend - createCredential argument construction', () => {
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
	it('builds the shared assertion input prefix (clientDataHash and rpId)', () => {
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

// ─── fido2Backend.js - silent probe narrowing ───────────────────────────────

// One full assertion per listed credential means one blind touch per entry.
// narrowCandidates() must reduce the list to the probed match, and must fall
// back to the full list when nothing probes as present (credProtect hides
// credentials from silent probes), so probing can only remove touches.
describe('WebAuthn fido2Backend - narrowCandidates', () => {
	const { _narrowCandidates } = require('../../app/webauthn/fido2Backend');
	const creds = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

	it('returns a single-credential list untouched without probing', async () => {
		let probed = 0;
		const single = [{ id: 'only' }];
		const result = await _narrowCandidates(single, async () => { probed++; return true; });
		assert.strictEqual(result, single);
		assert.strictEqual(probed, 0);
	});

	it('narrows to the first credential that probes as present', async () => {
		const probedIds = [];
		const result = await _narrowCandidates(creds, async (c) => {
			probedIds.push(c.id);
			return c.id === 'b';
		});
		assert.deepStrictEqual(result, [{ id: 'b' }]);
		assert.deepStrictEqual(probedIds, ['a', 'b'], 'probing must stop at the match');
	});

	it('falls back to the full list when no probe matches', async () => {
		const probedIds = [];
		const result = await _narrowCandidates(creds, async (c) => {
			probedIds.push(c.id);
			return false;
		});
		assert.strictEqual(result, creds);
		assert.deepStrictEqual(probedIds, ['a', 'b', 'c']);
	});
});

const credentialResponse = {
	credentialId: 'credential',
	rawId: '',
	type: 'public-key',
	attestationObject: '',
	authenticatorData: '',
	clientDataJson: '',
	signature: '',
	userHandle: null,
};

describe('WebAuthn main-frame override', () => {
	const override = readFileSync(path.join(__dirname, '..', '..', 'app', 'browser', 'tools', 'webauthnOverride.js'), 'utf8');

	it('returns PublicKeyCredential instances for create and get', async () => {
		class PublicKeyCredential {}
		class AuthenticatorAttestationResponse {}
		class AuthenticatorAssertionResponse {}
		const credentials = { create: () => {}, get: () => {} };
		const module = { exports: {} };

		new vm.Script(override, { filename: 'webauthnOverride.js' }).runInNewContext({
			PublicKeyCredential,
			AuthenticatorAttestationResponse,
			AuthenticatorAssertionResponse,
			DOMException,
			atob: () => '',
			btoa: () => '',
			console: { debug: () => {}, error: () => {}, info: () => {}, warn: () => {} },
			module,
			navigator: { credentials },
			process: { platform: 'linux' },
			window: { addEventListener: () => {} },
		});
		module.exports.init(
			{ auth: { webauthn: { enabled: true } } },
			{ invoke: async () => ({ success: true, data: credentialResponse }) },
		);

		const created = await credentials.create({
			publicKey: { challenge: new Uint8Array(), user: { id: new Uint8Array() }, pubKeyCredParams: [] },
		});
		const asserted = await credentials.get({ publicKey: { challenge: new Uint8Array() } });

		assert.ok(created instanceof PublicKeyCredential);
		assert.ok(asserted instanceof PublicKeyCredential);
		// The bridge/fido login page instanceof-checks the response object as
		// well and silently discards the credential otherwise (#2719).
		assert.ok(created.response instanceof AuthenticatorAttestationResponse);
		assert.ok(asserted.response instanceof AuthenticatorAssertionResponse);
	});
});

// The subframe override is a template string run through executeJavaScript, so
// a syntax error in it fails silently at runtime and surfaces only as logins
// not working inside the login iframe. Nothing else parses it.
describe('WebAuthn subframe injection - injected script', () => {
	const injected = (() => {
		const src = readFileSync(path.join(__dirname, '..', '..', 'app', 'webauthn', 'index.js'), 'utf8');
		const start = src.indexOf('wf.executeJavaScript(String.raw`');
		assert.notStrictEqual(start, -1, 'injected block not found');
		const open = src.indexOf('`', start);
		const close = src.indexOf('`)', open + 1);
		assert.notStrictEqual(close, -1, 'closing backtick not found');
		return src.slice(open + 1, close);
	})();

	it('parses as valid JavaScript', () => {
		assert.doesNotThrow(() => new vm.Script(injected, { filename: 'injected-subframe.js' }));
	});

	// The relayed credential has to carry the same members as the main-frame
	// reconstruction or the page serialises a different body (#2828).
	it('gives the relayed credential toJSON and getAuthenticatorData', () => {
		assert.ok(injected.includes('toJSON'));
		assert.ok(injected.includes('getAuthenticatorData'));
	});

	it('returns PublicKeyCredential instances for create and get', async () => {
		class PublicKeyCredential {}
		class AuthenticatorAttestationResponse {}
		class AuthenticatorAssertionResponse {}
		let messageListener;
		const credentials = { create: () => {}, get: () => {} };
		const window = {
			addEventListener: (_type, listener) => { messageListener = listener; },
			removeEventListener: () => {},
			parent: {
				postMessage: ({ id }) => messageListener({
					data: { type: 'webauthn-response', id, result: credentialResponse },
				}),
			},
		};

		new vm.Script(injected, { filename: 'injected-subframe.js' }).runInNewContext({
			PublicKeyCredential,
			AuthenticatorAttestationResponse,
			AuthenticatorAssertionResponse,
			DOMException,
			atob: () => '',
			btoa: () => '',
			console: { info: () => {} },
			crypto: { randomUUID: () => 'request-id' },
			navigator: { credentials },
			setTimeout: () => 0,
			window,
		});

		const created = await credentials.create({
			publicKey: { challenge: new Uint8Array(), user: { id: new Uint8Array() }, pubKeyCredParams: [] },
		});
		const asserted = await credentials.get({ publicKey: { challenge: new Uint8Array() } });

		assert.ok(created instanceof PublicKeyCredential);
		assert.ok(asserted instanceof PublicKeyCredential);
		// Same instanceof requirement as the main-frame override (#2719).
		assert.ok(created.response instanceof AuthenticatorAttestationResponse);
		assert.ok(asserted.response instanceof AuthenticatorAssertionResponse);
	});
});

// ─── Cancelling a security-key operation (issue #2631) ────────────────────────

describe('Security key cancellation', () => {
	const fido2Backend = require('../../app/webauthn/fido2Backend');

	it('rejects an already-cancelled assertion before touching the device', async () => {
		const controller = new AbortController();
		controller.abort();

		await assert.rejects(
			() => fido2Backend.getAssertion({ abortSignal: controller.signal }),
			// Reaching the device would fail with "No FIDO2 hardware device found"
			// instead, so this also proves enumeration was skipped.
			(err) => err.message === fido2Backend.CANCELLED_MESSAGE,
		);
	});

	it('rejects an already-cancelled credential creation before touching the device', async () => {
		const controller = new AbortController();
		controller.abort();

		await assert.rejects(
			() => fido2Backend.createCredential({ abortSignal: controller.signal }),
			(err) => err.message === fido2Backend.CANCELLED_MESSAGE,
		);
	});

	it('kills the detached child process group when cancelled mid-call', async () => {
		const controller = new AbortController();
		// Stands in for fido2-assert blocking on the user-presence check: spawned
		// detached exactly the same way, and never exits on its own. Uses this
		// Node binary rather than `sleep`, which does not exist on Windows.
		const pending = fido2Backend._spawnFido2(
			process.execPath,
			['-e', 'setTimeout(() => {}, 30_000)'],
			[],
			30_000,
			null,
			controller.signal,
		);

		// Give the child a moment to actually exist before cancelling it.
		await new Promise((resolve) => setTimeout(resolve, 100));
		controller.abort();

		await assert.rejects(pending, (err) => err.message === fido2Backend.CANCELLED_MESSAGE);
	});

	it('leaves an uncancelled call alone', async () => {
		const controller = new AbortController();
		const { stdout } = await fido2Backend._spawnFido2(
			process.execPath,
			['-e', 'process.stdout.write("ok")'],
			[],
			5000,
			null,
			controller.signal,
		);

		assert.strictEqual(stdout.trim(), 'ok');
	});

	it('marks a cancellation as NotAllowedError so the page offers another method', () => {
		assert.match(fido2Backend.CANCELLED_MESSAGE, /^NotAllowedError:/);
	});
});

// ─── Writing to a child that has already gone (#2920) ────────────────────────

describe('Security key stdin writes against a closed pipe', () => {
	const fido2Backend = require('../../app/webauthn/fido2Backend');

	it('does not raise an uncaught exception when a write lands on a closed stdin', async () => {
		// The child closes its read end before prompting, so both the parameter
		// write and the PIN write hit a dead pipe. With no listener on stdin that
		// EPIPE becomes an uncaught exception, and the handler in app/index.js
		// does not classify it as recoverable, so it calls process.exit(1).
		const uncaught = [];
		const trap = (err) => uncaught.push(err);
		process.on('uncaughtException', trap);

		try {
			await assert.rejects(
				fido2Backend._spawnFido2(
					process.execPath,
					[
						'-e',
						'require("node:fs").closeSync(0);' +
							'process.stderr.write("Enter PIN for /dev/hidraw0:");' +
							'setTimeout(() => process.exit(1), 300);',
					],
					[],
					5000,
					'1234',
					null,
				),
				/exited with code 1/,
			);
			// The write is asynchronous, so give the EPIPE a chance to surface.
			await new Promise((resolve) => setTimeout(resolve, 250));

			assert.deepStrictEqual(
				uncaught.map((err) => err.code),
				[],
				'writing the PIN to a dead child must not throw out of the promise',
			);
		} finally {
			process.off('uncaughtException', trap);
		}
	});
});

// ─── The allowCredentials retry loop, driven for real ─────────────────────────
//
// getAssertion() walks the credentials the server allowed until one is on the
// key. Asserting a copy of that decision proves nothing, so these tests put
// stub `fido2-token` / `fido2-assert` executables on PATH and run the real
// function against them, counting how many times the stub was spawned.
//
// The stubs are shebang scripts, which Windows cannot execute directly. The
// backend is Linux-only anyway (Chromium handles WebAuthn natively elsewhere).

describe('getAssertion allowCredentials loop', () => {
	const fs = require('node:fs');
	const os = require('node:os');
	const fido2Backend = require('../../app/webauthn/fido2Backend');

	const posixOnly = { skip: process.platform === 'win32' && 'stub binaries need a POSIX shebang' };

	let stubDir;
	let logPath;
	let originalPath;

	// Two lines is what fido2-assert emits without echoing input back:
	// CBOR-wrapped authenticator data, then the signature.
	const successStdout = [
		cborEncode(Buffer.from('authenticator-data')).toString('base64'),
		Buffer.from('signature-bytes').toString('base64'),
	].join('\n') + '\n';

	// When the asserted credential is resident, fido2-assert appends the user
	// id as a final line. The credential id never appears in its output; it
	// comes from the fido2-token credman listing instead.
	const RESIDENT_CREDENTIAL = Buffer.from('resident-cred');
	const USER_HANDLE = Buffer.from('user-handle');
	const residentStdout = successStdout.trimEnd() + '\n' + USER_HANDLE.toString('base64') + '\n';

	const credential = (name) => ({ id: base64urlEncode(Buffer.from(name)), type: 'public-key' });
	const THREE_CREDENTIALS = [credential('cred-one'), credential('cred-two'), credential('cred-three')];

	function writeStub(name, body) {
		const file = path.join(stubDir, name);
		fs.writeFileSync(file, `#!${process.execPath}\n${body}`, { mode: 0o755 });
	}

	before(() => {
		if (process.platform === 'win32') return;
		stubDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fido2-stub-'));
		logPath = path.join(stubDir, 'calls.log');

		// -L alone lists devices; -L -k <rpId> <device> lists resident credentials.
		writeStub('fido2-token', `
			if (process.argv.includes("-k")) {
				process.stdout.write(process.env.FIDO2_STUB_RK_LINES || "");
				process.exit(0);
			}
			process.stdout.write("/dev/hidraw9: vendor=0x1050, product=0x0407 (Stub)\\n");
		`);

		// Reads stdin to completion first, exactly like the real tool, so the
		// backend's parameter write never lands on a closed pipe. Each behaviour
		// is consumed in order, one per spawn.
		writeStub('fido2-assert', `
			const fs = require("node:fs");
			// Safety net: a stalled test must not leave this running forever.
			setTimeout(() => process.exit(9), 20000);
			const chunks = [];
			process.stdin.on("data", (c) => chunks.push(c));
			process.stdin.on("end", run);
			let started = false;
			function run() {
				if (started) return;
				started = true;
				fs.appendFileSync(process.env.FIDO2_STUB_LOG, "call\\n");
				const calls = fs.readFileSync(process.env.FIDO2_STUB_LOG, "utf8").split("\\n").filter(Boolean).length;
				const script = JSON.parse(process.env.FIDO2_STUB_SCRIPT);
				const behaviour = script[calls - 1] || script[script.length - 1];
				if (behaviour === "success" || behaviour === "success-resident") {
					process.stdout.write(behaviour === "success" ? process.env.FIDO2_STUB_STDOUT : process.env.FIDO2_STUB_STDOUT_RESIDENT);
					process.exit(0);
				}
				if (behaviour === "hang") return;
				process.stderr.write(behaviour === "bad-pin" ? "FIDO_ERR_PIN_INVALID" : "FIDO_ERR_NO_CREDENTIALS");
				process.exit(1);
			}
		`);

		originalPath = process.env.PATH;
		process.env.PATH = `${stubDir}${path.delimiter}${originalPath}`;
		process.env.FIDO2_STUB_LOG = logPath;
		process.env.FIDO2_STUB_STDOUT = successStdout;
		process.env.FIDO2_STUB_STDOUT_RESIDENT = residentStdout;
		process.env.FIDO2_STUB_RK_LINES = `00: ${RESIDENT_CREDENTIAL.toString('base64')} Stub Display Name ${USER_HANDLE.toString('base64')} es256 uvopt\n`;
	});

	after(() => {
		if (process.platform === 'win32') return;
		process.env.PATH = originalPath;
		delete process.env.FIDO2_STUB_LOG;
		delete process.env.FIDO2_STUB_SCRIPT;
		delete process.env.FIDO2_STUB_STDOUT;
		delete process.env.FIDO2_STUB_STDOUT_RESIDENT;
		delete process.env.FIDO2_STUB_RK_LINES;
		fs.rmSync(stubDir, { recursive: true, force: true });
	});

	/** Arm the stub with one behaviour per expected spawn and reset the counter. */
	function arm(...behaviours) {
		fs.writeFileSync(logPath, '');
		process.env.FIDO2_STUB_SCRIPT = JSON.stringify(behaviours);
	}

	const spawnCount = () => fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean).length;

	async function waitForSpawns(count) {
		const deadline = Date.now() + 5000;
		while (spawnCount() < count) {
			if (Date.now() > deadline) throw new Error(`stub spawned ${spawnCount()} times, expected ${count}`);
			await new Promise((resolve) => setTimeout(resolve, 20));
		}
	}

	const assertionOptions = (extra) => ({
		challenge: base64urlEncode(Buffer.from('challenge')),
		rpId: 'login.microsoft.com',
		origin: 'https://login.microsoft.com',
		timeout: 30,
		...extra,
	});

	it('probes for the credential on the key and asserts only against it', posixOnly, async () => {
		// Spawns: probe cred-one (miss), probe cred-two (match), real assertion.
		arm('no-credentials', 'success', 'success');

		const result = await fido2Backend.getAssertion(assertionOptions({ allowCredentials: THREE_CREDENTIALS }));

		assert.strictEqual(result.credentialId, THREE_CREDENTIALS[1].id);
		assert.strictEqual(spawnCount(), 3);
	});

	it('falls back to trying each credential when no probe matches', posixOnly, async () => {
		// Spawns: three probe misses, then the sequential walk: miss, success.
		arm('no-credentials', 'no-credentials', 'no-credentials', 'no-credentials', 'success');

		const result = await fido2Backend.getAssertion(assertionOptions({ allowCredentials: THREE_CREDENTIALS }));

		assert.strictEqual(result.credentialId, THREE_CREDENTIALS[1].id);
		assert.strictEqual(spawnCount(), 5);
	});

	it('skips probing when only one credential is allowed', posixOnly, async () => {
		arm('success');

		const result = await fido2Backend.getAssertion(assertionOptions({ allowCredentials: [THREE_CREDENTIALS[0]] }));

		assert.strictEqual(result.credentialId, THREE_CREDENTIALS[0].id);
		assert.strictEqual(spawnCount(), 1);
	});

	it('stops trying further credentials once cancelled', posixOnly, async () => {
		arm('hang');
		const controller = new AbortController();

		const pending = fido2Backend.getAssertion(assertionOptions({
			allowCredentials: THREE_CREDENTIALS,
			abortSignal: controller.signal,
		}));

		await waitForSpawns(1);
		controller.abort();

		await assert.rejects(pending, (err) => err.message === fido2Backend.CANCELLED_MESSAGE);
		// The whole point: one child, not one per allowed credential. The first
		// spawn is a probe here, so this also pins that a cancel mid-probe
		// rejects instead of reading as a miss and probing on.
		assert.strictEqual(spawnCount(), 1);
	});

	it('does not retry an error that is not "wrong credential"', posixOnly, async () => {
		// Spawns: three probe misses, then the first sequential attempt fails
		// with a final error and the walk must stop there.
		arm('no-credentials', 'no-credentials', 'no-credentials', 'bad-pin');

		await assert.rejects(
			() => fido2Backend.getAssertion(assertionOptions({ allowCredentials: THREE_CREDENTIALS })),
			/FIDO_ERR_PIN_INVALID/,
		);
		assert.strictEqual(spawnCount(), 4);
	});

	it('tries every allowed credential before giving up', posixOnly, async () => {
		// Three probe misses, then three sequential misses.
		arm('no-credentials');

		await assert.rejects(
			() => fido2Backend.getAssertion(assertionOptions({ allowCredentials: THREE_CREDENTIALS })),
			/FIDO_ERR_NO_CREDENTIALS/,
		);
		assert.strictEqual(spawnCount(), 6);
	});

	it('resolves a discoverable sign-in by enumerating resident credentials', posixOnly, async () => {
		arm('success-resident');

		const result = await fido2Backend.getAssertion(assertionOptions({}));

		// The credential id comes from the credman listing, the user handle from
		// the assertion output, and the ceremony ran once with that credential.
		assert.strictEqual(result.credentialId, base64urlEncode(RESIDENT_CREDENTIAL));
		assert.strictEqual(result.userHandle, base64urlEncode(USER_HANDLE));
		assert.strictEqual(spawnCount(), 1);
	});

	it('fails a discoverable sign-in cleanly when the key holds no credential for the site', posixOnly, async () => {
		arm('success-resident');
		const saved = process.env.FIDO2_STUB_RK_LINES;
		process.env.FIDO2_STUB_RK_LINES = '';
		try {
			await assert.rejects(
				() => fido2Backend.getAssertion(assertionOptions({})),
				/NotAllowedError: no credential for this site/,
			);
			assert.strictEqual(spawnCount(), 0);
		} finally {
			process.env.FIDO2_STUB_RK_LINES = saved;
		}
	});

	it('fails a discoverable sign-in cleanly when the key holds several accounts', posixOnly, async () => {
		arm('success-resident');
		const saved = process.env.FIDO2_STUB_RK_LINES;
		process.env.FIDO2_STUB_RK_LINES = saved + `01: ${base64urlEncode(Buffer.from('other-cred'))} Other Name ${base64urlEncode(Buffer.from('other-user'))} es256 uvopt\n`;
		try {
			await assert.rejects(
				() => fido2Backend.getAssertion(assertionOptions({})),
				/more than one account/,
			);
			assert.strictEqual(spawnCount(), 0);
		} finally {
			process.env.FIDO2_STUB_RK_LINES = saved;
		}
	});
});
