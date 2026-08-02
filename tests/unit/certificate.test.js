'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { onAppCertificateError, installCertificateVerifyProc } = require('../../app/certificate/index');

function createCert(fingerprint, issuerCert = null) {
	const cert = { fingerprint };
	cert.issuerCert = issuerCert ?? cert; // self-referencing = root
	return cert;
}

function createArg(overrides = {}) {
	const event = { preventDefault: () => {} };
	let callbackValue = null;
	return {
		arg: {
			error: 'net::ERR_CERT_AUTHORITY_INVALID',
			certificate: createCert('AA:BB:CC'),
			config: { customCACertsFingerprints: [] },
			event,
			callback: (val) => { callbackValue = val; },
			...overrides,
		},
		getCallbackValue: () => callbackValue,
		event,
	};
}

describe('Certificate validation - fingerprint matching', () => {
	it('accepts certificate when fingerprint is in allowlist', () => {
		const { arg, getCallbackValue } = createArg({
			certificate: createCert('AA:BB:CC'),
			config: { customCACertsFingerprints: ['AA:BB:CC'] },
		});
		onAppCertificateError(arg);
		assert.strictEqual(getCallbackValue(), true);
	});

	it('rejects certificate when fingerprint is not in allowlist', () => {
		const { arg, getCallbackValue } = createArg({
			certificate: createCert('AA:BB:CC'),
			config: { customCACertsFingerprints: ['XX:YY:ZZ'] },
		});
		onAppCertificateError(arg);
		assert.strictEqual(getCallbackValue(), false);
	});

	it('rejects certificate when allowlist is empty', () => {
		const { arg, getCallbackValue } = createArg({
			certificate: createCert('AA:BB:CC'),
			config: { customCACertsFingerprints: [] },
		});
		onAppCertificateError(arg);
		assert.strictEqual(getCallbackValue(), false);
	});

	it('rejects certificate when allowlist is undefined', () => {
		const { arg, getCallbackValue } = createArg({
			certificate: createCert('AA:BB:CC'),
			config: {},
		});
		onAppCertificateError(arg);
		assert.strictEqual(getCallbackValue(), false);
	});

	it('calls event.preventDefault when fingerprint matches', () => {
		let preventDefaultCalled = false;
		const { arg } = createArg({
			certificate: createCert('AA:BB:CC'),
			config: { customCACertsFingerprints: ['AA:BB:CC'] },
		});
		arg.event.preventDefault = () => { preventDefaultCalled = true; };
		onAppCertificateError(arg);
		assert.strictEqual(preventDefaultCalled, true);
	});
});

describe('Certificate validation - chain traversal', () => {
	it('traverses a 2-level certificate chain to find root', () => {
		const root = createCert('ROOT:FP');
		const intermediate = createCert('INTER:FP', root);
		const { arg, getCallbackValue } = createArg({
			certificate: intermediate,
			config: { customCACertsFingerprints: ['ROOT:FP'] },
		});
		onAppCertificateError(arg);
		assert.strictEqual(getCallbackValue(), true);
	});

	it('traverses a 3-level certificate chain to find root', () => {
		const root = createCert('ROOT:FP');
		const mid = createCert('MID:FP', root);
		const leaf = createCert('LEAF:FP', mid);
		const { arg, getCallbackValue } = createArg({
			certificate: leaf,
			config: { customCACertsFingerprints: ['ROOT:FP'] },
		});
		onAppCertificateError(arg);
		assert.strictEqual(getCallbackValue(), true);
	});

	it('handles self-signed certificate (issuerCert === cert)', () => {
		const selfSigned = createCert('SELF:FP');
		const { arg, getCallbackValue } = createArg({
			certificate: selfSigned,
			config: { customCACertsFingerprints: ['SELF:FP'] },
		});
		onAppCertificateError(arg);
		assert.strictEqual(getCallbackValue(), true);
	});

	it('handles certificate with no issuerCert property', () => {
		const cert = { fingerprint: 'BARE:FP' };
		const { arg, getCallbackValue } = createArg({
			certificate: cert,
			config: { customCACertsFingerprints: ['BARE:FP'] },
		});
		onAppCertificateError(arg);
		assert.strictEqual(getCallbackValue(), true);
	});
});

function createHarness(config) {
	const sessions = [];
	const listeners = {};
	const fakeApp = { on: (event, fn) => { listeners[event] = fn; } };
	const fakeSession = { setCertificateVerifyProc: (fn) => sessions.push(fn) };
	installCertificateVerifyProc(config, fakeApp, fakeSession);
	return {
		sessions,
		emitSessionCreated: (ses) => listeners['session-created']?.(ses),
		verify: (request) => {
			let result = null;
			sessions[0](request, (value) => { result = value; });
			return result;
		},
	};
}

function createRequest(overrides = {}) {
	return {
		verificationResult: 'CERT_AUTHORITY_INVALID',
		errorCode: -202,
		certificate: createCert('AA:BB:CC'),
		...overrides,
	};
}

describe('Certificate verify proc - installation', () => {
	it('does not install anything when no fingerprints are configured', () => {
		const { sessions } = createHarness({ customCACertsFingerprints: [] });
		assert.strictEqual(sessions.length, 0);
	});

	it('installs on the default session when fingerprints are configured', () => {
		const { sessions } = createHarness({ customCACertsFingerprints: ['AA:BB:CC'] });
		assert.strictEqual(sessions.length, 1);
	});

	it('installs on sessions created later, such as profile partitions', () => {
		const harness = createHarness({ customCACertsFingerprints: ['AA:BB:CC'] });
		harness.emitSessionCreated({ setCertificateVerifyProc: (fn) => harness.sessions.push(fn) });
		assert.strictEqual(harness.sessions.length, 2);
	});
});

describe('Certificate verify proc - verification', () => {
	it('accepts when an allowlisted fingerprint is in the chain', () => {
		const { verify } = createHarness({ customCACertsFingerprints: ['ROOT:FP'] });
		const root = createCert('ROOT:FP');
		assert.strictEqual(verify(createRequest({ certificate: createCert('LEAF:FP', root) })), 0);
	});

	it('accepts on a match against an incomplete chain with no reachable root', () => {
		const { verify } = createHarness({ customCACertsFingerprints: ['LEAF:FP'] });
		assert.strictEqual(verify(createRequest({ certificate: { fingerprint: 'LEAF:FP' } })), 0);
	});

	it('defers to Chromium when no fingerprint matches', () => {
		const { verify } = createHarness({ customCACertsFingerprints: ['XX:YY:ZZ'] });
		assert.strictEqual(verify(createRequest()), -3);
	});

	it('defers to Chromium when verification already succeeded', () => {
		const { verify } = createHarness({ customCACertsFingerprints: ['AA:BB:CC'] });
		assert.strictEqual(verify(createRequest({ verificationResult: 'OK', errorCode: 0 })), -3);
	});

	it('does not accept an expired certificate even when the issuer is allowlisted', () => {
		const { verify } = createHarness({ customCACertsFingerprints: ['AA:BB:CC'] });
		const request = createRequest({ verificationResult: 'CERT_DATE_INVALID', errorCode: -201 });
		assert.strictEqual(verify(request), -3);
	});

	it('does not accept a revoked certificate even when the issuer is allowlisted', () => {
		const { verify } = createHarness({ customCACertsFingerprints: ['AA:BB:CC'] });
		const request = createRequest({ verificationResult: 'CERT_REVOKED', errorCode: -206 });
		assert.strictEqual(verify(request), -3);
	});
});

describe('Certificate validation - non-authority errors', () => {
	it('rejects certificates for non-authority errors', () => {
		const { arg, getCallbackValue } = createArg({
			error: 'net::ERR_CERT_DATE_INVALID',
			certificate: createCert('AA:BB:CC'),
			config: { customCACertsFingerprints: ['AA:BB:CC'] },
		});
		onAppCertificateError(arg);
		assert.strictEqual(getCallbackValue(), false);
	});

	it('rejects certificates for common name mismatch', () => {
		const { arg, getCallbackValue } = createArg({
			error: 'net::ERR_CERT_COMMON_NAME_INVALID',
		});
		onAppCertificateError(arg);
		assert.strictEqual(getCallbackValue(), false);
	});
});
