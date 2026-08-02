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

// net::ERR_CERT_AUTHORITY_INVALID. The only failure we are willing to override,
// so an expired or revoked certificate is still rejected even when its issuer is
// on the allowlist.
const ERR_CERT_AUTHORITY_INVALID = -202;

// Special values accepted by the setCertificateVerifyProc callback.
const VERIFY_ACCEPT = 0;
const VERIFY_USE_CHROMIUM_RESULT = -3;

/**
 * Installs a session-level certificate verify proc so `customCACertsFingerprints`
 * also applies to connections that never surface a certificate error to a window.
 *
 * The `certificate-error` event only fires when a page load reports the error, so
 * behind a proxy that intercepts every TLS connection the allowlist never got a
 * chance to act (issue #2762). This proc runs on every server certificate
 * verification instead.
 *
 * Nothing is installed when no fingerprints are configured, so the default
 * behaviour is untouched. When a fingerprint is configured we still defer to
 * Chromium for anything that is not an untrusted-authority failure, so this can
 * only ever accept a certificate the user explicitly allowlisted.
 *
 * @param {Object} config - App configuration containing customCACertsFingerprints
 * @param {Electron.App} app - Electron app, used to catch sessions as they are created
 * @param {Electron.Session} defaultSession - Session that may already exist
 */
exports.installCertificateVerifyProc = function installCertificateVerifyProc(
  config,
  app,
  defaultSession,
) {
  const fingerprints = config.customCACertsFingerprints || [];
  if (fingerprints.length === 0) {
    return;
  }

  const verifyProc = (request, callback) => {
    if (request.verificationResult === "OK") {
      callback(VERIFY_USE_CHROMIUM_RESULT);
      return;
    }

    if (!isUntrustedAuthority(request)) {
      callback(VERIFY_USE_CHROMIUM_RESULT);
      return;
    }

    if (getChainFingerprints(request.certificate).some((fp) => fingerprints.includes(fp))) {
      console.debug("[CERT] Accepting allowlisted certificate authority");
      callback(VERIFY_ACCEPT);
      return;
    }

    console.error("[CERT] Certificate authority not in allowlist for request");
    callback(VERIFY_USE_CHROMIUM_RESULT);
  };

  const applyTo = (targetSession) => {
    try {
      targetSession.setCertificateVerifyProc(verifyProc);
    } catch (error) {
      console.error("[CERT] Could not install certificate verify proc", {
        message: error.message,
      });
    }
  };

  if (defaultSession) {
    applyTo(defaultSession);
  }
  // Profile partitions get their own session, so catch them as they appear.
  app.on("session-created", applyTo);

  console.info("[CERT] Custom CA allowlist active", { count: fingerprints.length });
};

/**
 * Whether a failed verification was caused by an untrusted issuing authority.
 * @param {Object} request - setCertificateVerifyProc request
 * @returns {boolean}
 */
function isUntrustedAuthority(request) {
  return (
    request.errorCode === ERR_CERT_AUTHORITY_INVALID ||
    (typeof request.verificationResult === "string" &&
      request.verificationResult.includes("CERT_AUTHORITY_INVALID"))
  );
}

/**
 * Collects the fingerprint of every certificate in a presented chain.
 *
 * An intercepting proxy often serves an incomplete chain, in which case the root
 * is not reachable via issuerCert and matching only the root would never succeed.
 * Every entry is compared against the user's explicit allowlist, so matching any
 * of them is as deliberate as matching the root.
 *
 * @param {Electron.Certificate} cert - Leaf certificate
 * @returns {string[]} Fingerprints, leaf first
 */
function getChainFingerprints(cert) {
  const fingerprints = [];
  let current = cert;
  while (current) {
    if (current.fingerprint) {
      fingerprints.push(current.fingerprint);
    }
    current = current.issuerCert === current ? null : current.issuerCert;
  }
  return fingerprints;
}

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
