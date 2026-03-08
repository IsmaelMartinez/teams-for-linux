'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { onAppCertificateError } = require('../../app/certificate/index');

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
