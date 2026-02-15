/**
 * Handles certificate validation errors for corporate environments with custom CAs.
 * This allows Teams to work in enterprise networks with self-signed or custom
 * certificate authorities by checking against a user-configured whitelist.
 *
 * @param {Object} arg - Certificate error details
 * @param {string} arg.error - The certificate error type
 * @param {Electron.Certificate} arg.certificate - The failing certificate
 * @param {Object} arg.config - App configuration containing auth.customCACertsFingerprints
 * @param {Electron.Event} arg.event - The certificate error event
 * @param {Function} arg.callback - Callback to accept/reject the certificate
 */
exports.onAppCertificateError = function onAppCertificateError(arg) {
  if (arg.error === "net::ERR_CERT_AUTHORITY_INVALID") {
    let unknownIssuerCert = getCertIssuer(arg.certificate);
    const fingerprints = arg.config.customCACertsFingerprints || [];
    if (
      fingerprints.includes(
        unknownIssuerCert.fingerprint
      )
    ) {
      arg.event.preventDefault();
      arg.callback(true);
    } else {
      console.error("[CERT] Certificate authority not in allowlist for request");
      console.error(
        "[CERT] To trust this certificate, add the following fingerprint to customCACertsFingerprints in config: " +
          unknownIssuerCert.fingerprint
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
  if ("issuerCert" in cert && cert.issuerCert === cert) {
    return cert;
  }
  if ("issuerCert" in cert) {
    return getCertIssuer(cert.issuerCert);
  }
  return cert;
}
