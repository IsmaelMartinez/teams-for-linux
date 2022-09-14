
exports.onAppCertificateError = function onAppCertificateError(arg, logger) {
	if (arg.error === 'net::ERR_CERT_AUTHORITY_INVALID') {
		let unknownIssuerCert = getCertIssuer(arg.certificate);
		if (arg.config.customCACertsFingerprints.indexOf(unknownIssuerCert.fingerprint) !== -1) {
			arg.event.preventDefault();
			arg.callback(true);
		} else {
			logger.error('Unknown cert issuer for url: ' + arg.url);
			logger.error('Issuer Name: ' + unknownIssuerCert.issuerName);
			logger.error('The unknown certificate fingerprint is: ' + unknownIssuerCert.fingerprint);
			arg.callback(false);
		}
	} else {
		logger.error('An unexpected SSL error has occurred: ' + arg.error);
		arg.callback(false);
	}
};

function getCertIssuer(cert) {
	if ('issuerCert' in cert && cert.issuerCert !== cert) {
		return getCertIssuer(cert.issuerCert);
	}
	return cert;
}
