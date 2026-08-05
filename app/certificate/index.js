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

// net::ERR_CERT_AUTHORITY_INVALID, the only failure we are willing to override.
// A revoked certificate reports ERR_CERT_REVOKED instead, which ranks higher in
// Chromium's MapCertStatusToNetError, so it never reaches the accept path.
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
 * Known limitation: accepting overrides Chromium's whole verification for that
 * connection, including hostname matching, and a name mismatch is masked by the
 * authority error because it ranks lower in MapCertStatusToNetError. Trusting the
 * CA through the NSS database keeps hostname checking intact and remains the
 * stricter option; see docs-site/docs/certificate.md.
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

  // This proc runs per handshake, and behind an intercepting proxy a misconfigured
  // fingerprint fails every one of them. Report each outcome once so a persistent
  // misconfiguration is still visible without flooding the log.
  let warnedOutOfDate = false;
  let warnedNotInAllowlist = false;

  const verifyProc = (request, callback) => {
    if (request.verificationResult === "OK") {
      callback(VERIFY_USE_CHROMIUM_RESULT);
      return;
    }

    if (!isUntrustedAuthority(request)) {
      callback(VERIFY_USE_CHROMIUM_RESULT);
      return;
    }

    // validatedCertificate, not certificate. The latter is the chain the server
    // sent, and Electron links it positionally without checking that each entry
    // signed the one below, so anyone able to intercept the connection can append
    // an allowlisted CA's public certificate to a chain it never issued.
    const chain = getChain(request.validatedCertificate);

    if (chain.some((cert) => fingerprints.includes(cert.fingerprint))) {
      // Chromium reports only the most serious error, and CERT_STATUS_DATE_INVALID
      // ranks below CERT_STATUS_AUTHORITY_INVALID (net/cert/cert_status_flags.cc),
      // so an untrusted *and* expired certificate arrives here as -202. Check the
      // validity window ourselves rather than letting the expiry pass unnoticed.
      if (!chain.every(isCurrentlyValid)) {
        if (!warnedOutOfDate) {
          warnedOutOfDate = true;
          console.error("[CERT] Allowlisted authority presented an out-of-date certificate");
        }
        callback(VERIFY_USE_CHROMIUM_RESULT);
        return;
      }
      console.debug("[CERT] Accepting allowlisted certificate authority");
      callback(VERIFY_ACCEPT);
      return;
    }

    if (!warnedNotInAllowlist) {
      warnedNotInAllowlist = true;
      console.warn("[CERT] Certificate authority not in allowlist for request");
    }
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
 * Collects every certificate in a chain.
 *
 * Call this with request.validatedCertificate, which is the path Chromium built
 * and signature-checked. Every entry in it genuinely issued the one below, so
 * matching any of them is as deliberate as matching the root. That matters
 * because an intercepting proxy often serves an incomplete chain, in which case
 * the root is absent and matching only the root would never succeed.
 *
 * @param {Electron.Certificate} cert - Leaf certificate
 * @returns {Electron.Certificate[]} Certificates, leaf first
 */
function getChain(cert) {
  const chain = [];
  let current = cert;
  while (current) {
    chain.push(current);
    current = current.issuerCert === current ? null : current.issuerCert;
  }
  return chain;
}

/**
 * Whether a certificate's validity window covers the current time. Returns false
 * when the dates are missing, so an unverifiable certificate is never accepted.
 * @param {Electron.Certificate} cert
 * @returns {boolean}
 */
function isCurrentlyValid(cert) {
  const nowInSeconds = Date.now() / 1000;
  return (
    typeof cert.validStart === "number" &&
    typeof cert.validExpiry === "number" &&
    nowInSeconds >= cert.validStart &&
    nowInSeconds <= cert.validExpiry
  );
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
