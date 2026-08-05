'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { onAppCertificateError, installCertificateVerifyProc } = require('../../app/certificate/index');

const NOW_IN_SECONDS = Date.now() / 1000;
const ONE_YEAR_IN_SECONDS = 365 * 24 * 60 * 60;

function createCert(fingerprint, issuerCert = null) {
	const cert = {
		fingerprint,
		validStart: NOW_IN_SECONDS - ONE_YEAR_IN_SECONDS,
		validExpiry: NOW_IN_SECONDS + ONE_YEAR_IN_SECONDS,
	};
	cert.issuerCert = issuerCert ?? cert; // self-referencing = root
	return cert;
}

function createExpiredCert(fingerprint) {
	const cert = createCert(fingerprint);
	cert.validExpiry = NOW_IN_SECONDS - 1;
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
	const request = {
		verificationResult: 'CERT_AUTHORITY_INVALID',
		errorCode: -202,
		validatedCertificate: createCert('AA:BB:CC'),
		...overrides,
	};
	// The presented chain matches the validated one unless a test sets it apart,
	// which is what an interception attempt does.
	request.certificate = request.certificate ?? request.validatedCertificate;
	return request;
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
		assert.strictEqual(verify(createRequest({ validatedCertificate: createCert('LEAF:FP', root) })), 0);
	});

	it('accepts on a match against an incomplete chain with no reachable root', () => {
		const { verify } = createHarness({ customCACertsFingerprints: ['LEAF:FP'] });
		const leafOnly = createCert('LEAF:FP');
		delete leafOnly.issuerCert;
		assert.strictEqual(verify(createRequest({ validatedCertificate: leafOnly })), 0);
	});

	it('rejects an expired certificate reported as an authority error', () => {
		// Chromium ranks CERT_STATUS_AUTHORITY_INVALID above CERT_STATUS_DATE_INVALID,
		// so an untrusted and expired certificate arrives with errorCode -202.
		const { verify } = createHarness({ customCACertsFingerprints: ['AA:BB:CC'] });
		assert.strictEqual(verify(createRequest({ validatedCertificate: createExpiredCert('AA:BB:CC') })), -3);
	});

	it('rejects when an issuer in the chain has expired', () => {
		const { verify } = createHarness({ customCACertsFingerprints: ['ROOT:FP'] });
		const expiredRoot = createExpiredCert('ROOT:FP');
		assert.strictEqual(verify(createRequest({ validatedCertificate: createCert('LEAF:FP', expiredRoot) })), -3);
	});

	it('rejects when validity dates are missing and cannot be checked', () => {
		const { verify } = createHarness({ customCACertsFingerprints: ['BARE:FP'] });
		assert.strictEqual(verify(createRequest({ validatedCertificate: { fingerprint: 'BARE:FP' } })), -3);
	});

	it('ignores an allowlisted authority appended to the presented chain only', () => {
		// Electron links request.certificate positionally from the certificates the
		// server sent, without checking that each one signed the one below. Anyone
		// able to intercept the connection can append an allowlisted CA's public
		// certificate to a chain it never issued, so only the chain Chromium built
		// and signature-checked is trusted here.
		const { verify } = createHarness({ customCACertsFingerprints: ['ROOT:FP'] });
		const appendedRoot = createCert('ROOT:FP');
		const request = createRequest({
			certificate: createCert('ATTACKER:FP', appendedRoot),
			validatedCertificate: createCert('ATTACKER:FP'),
		});
		assert.strictEqual(verify(request), -3);
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
