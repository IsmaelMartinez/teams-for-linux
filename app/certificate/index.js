
exports.onAppCertificateError = function onAppCertificateError (event, webContents, url, error, certificate, callback) {
	if (error === 'net::ERR_CERT_AUTHORITY_INVALID') {
		let unknownIssuerCert = getCertIssuer(certificate);
		if (config.customCACertsFingerprints.indexOf(unknownIssuerCert.fingerprint) !== -1) {
			event.preventDefault();
			callback(true);
		} else {
			console.log('Unknown cert issuer for url: ' + url);
			console.log('Issuer Name: ' + unknownIssuerCert.issuerName);
			console.log('The unknown certificate fingerprint is: ' + unknownIssuerCert.fingerprint);
			callback(false);
		}
	} else {
		console.log('An unexpected SSL error has occured: ' + error);
		callback(false);
	}
};

function getCertIssuer(cert) {
	if ('issuerCert' in cert && cert.issuerCert !== cert) {
		return getCertIssuer(cert.issuerCert);
	}
	return cert;
}
