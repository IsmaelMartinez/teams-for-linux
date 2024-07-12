
exports.onAppCertificateError = function onAppCertificateError(arg) {
	if (arg.error === 'net::ERR_CERT_AUTHORITY_INVALID') {
		let unknownIssuerCert = getCertIssuer(arg.certificate);
		if (arg.config.customCACertsFingerprints.indexOf(unknownIssuerCert.fingerprint) !== -1) {
			arg.event.preventDefault();
			arg.callback(true);
		} else {
			console.error('Unknown cert issuer for url: ' + arg.url);
			console.error('Issuer Name: ' + unknownIssuerCert.issuerName);
			console.error('The unknown certificate fingerprint is: ' + unknownIssuerCert.fingerprint);
			arg.callback(false);
		}
	} else {
		console.error('An unexpected SSL error has occurred: ' + arg.error);
		arg.callback(false);
	}
};

function getCertIssuer(cert) {
	if ('issuerCert' in cert && cert.issuerCert !== cert) {
		return getCertIssuer(cert.issuerCert);
	}
	return cert;
}
