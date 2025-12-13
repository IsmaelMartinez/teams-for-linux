/**
 * Handle certificate errors
 * @param {Object} arg - Certificate error arguments
 */
export function onAppCertificateError(arg) {
	const { event, url, error, certificate, callback, config } = arg;

	// Check if the certificate fingerprint is in the allowlist
	if (config.customCACertsFingerprints && 
			config.customCACertsFingerprints.length > 0 &&
			config.customCACertsFingerprints.includes(certificate.fingerprint)) {
		console.info(`Certificate error ignored for ${url} - fingerprint in allowlist`);
		event.preventDefault();
		callback(true);
		return;
	}

	console.error(`Certificate error for ${url}: ${error}`);
	console.error(`Certificate fingerprint: ${certificate.fingerprint}`);
	console.error(`Certificate issuer: ${certificate.issuerName}`);
	console.error(`Certificate subject: ${certificate.subjectName}`);

	// Don't trust the certificate by default
	callback(false);
}
