/**
 * Handles certificate validation errors for corporate environments with custom CAs.
 * This allows Teams to work in enterprise networks with self-signed or custom 
 * certificate authorities by checking against a user-configured whitelist.
 * 
 * @param {Object} arg - Certificate error details
 * @param {string} arg.error - The certificate error type
 * @param {Electron.Certificate} arg.certificate - The failing certificate
 * @param {Object} arg.config - App configuration containing customCACertsFingerprints
 * @param {Electron.Event} arg.event - The certificate error event
 * @param {Function} arg.callback - Callback to accept/reject the certificate
 */
exports.onAppCertificateError = function onAppCertificateError(arg) {
  if (arg.error === "net::ERR_CERT_AUTHORITY_INVALID") {
    let unknownIssuerCert = getCertIssuer(arg.certificate);
    if (
      arg.config.customCACertsFingerprints.indexOf(
        unknownIssuerCert.fingerprint,
      ) !== -1
    ) {
      arg.event.preventDefault();
      arg.callback(true);
    } else {
      console.error("Unknown cert issuer for url: " + arg.url);
      console.error("Issuer Name: " + unknownIssuerCert.issuerName);
      console.error(
        "The unknown certificate fingerprint is: " +
          unknownIssuerCert.fingerprint,
      );
      arg.callback(false);
    }
  } else {
    console.error("An unexpected SSL error has occurred: " + arg.error);
    arg.callback(false);
  }
};

/**
 * Recursively traverses the certificate chain to find the root issuer.
 * This is necessary because certificates can have intermediate CAs,
 * and we need to validate against the actual root certificate authority.
 * 
 * @param {Electron.Certificate} cert - Certificate to examine
 * @returns {Electron.Certificate} The root issuer certificate
 */
function getCertIssuer(cert) {
  if ("issuerCert" in cert && cert.issuerCert !== cert) {
    return getCertIssuer(cert.issuerCert);
  }
  return cert;
}
