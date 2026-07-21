// app/clientCertificate/index.js

/**
 * Smartcard / NSS client-certificate PIN dialog (issue #2639).
 *
 * On Linux, Chromium delegates the PKCS#11 token PIN prompt to the embedding
 * app via app.setClientCertRequestPasswordHandler (Electron >= 33). Without a
 * handler, smartcard-backed client-certificate auth fails silently: NSS never
 * gets the PIN, the certificate is never presented, and the user sees a generic
 * auth failure. This module registers the handler and shows a hardened PIN
 * dialog built on the shared secure-prompt window.
 *
 * Linux-only: the API throws a TypeError on macOS/Windows (which ship native
 * PIN UI), so initialize() must only run under process.platform === "linux".
 *
 * Validated against a real card by the reporter (spike, issue #2639):
 * - resolve("") re-prompts (it does NOT cancel) and does not decrement the
 *   card's retry counter; reject() cleanly stops prompting without decrementing.
 *   So Cancel rejects, and the per-session safety cap also rejects.
 * - a wrong PIN sets isRetry on the next call and decrements the counter once.
 * - the handler fires once per token unlock, not per request.
 *
 * PII: hostname and tokenName may identify the user's employer or card issuer
 * and must never be logged. They are shown in the dialog only. The PIN lives
 * only in the resolved promise.
 */

const { app } = require("electron");
const { showSecurePrompt } = require("../_shared/securePrompt");

// Belt-and-braces against draining the card's PIN budget. Cards hard-lock after
// a few wrong attempts, after which unlocking needs the PUK or reissuance. We
// count only actual PIN submissions per token per session (a wrong PIN
// re-invokes the handler with isRetry true), so cancels never accumulate. Once
// this many PINs have been submitted for a token we stop prompting and ask the
// user to restart. The terminal action is a reject(), which the spike proved
// stops NSS re-prompting WITHOUT touching the retry counter (an empty-string
// resolve would loop and a wrong value would burn an attempt, so neither is
// safe here).
const MAX_ATTEMPTS_PER_TOKEN = 3;

// tokenName -> number of PINs submitted this session.
const attemptsByToken = new Map();

let registered = false;

function initialize() {
  if (process.platform !== "linux") return;
  if (registered) return;
  registered = true;

  app.setClientCertRequestPasswordHandler(async ({ hostname, tokenName, isRetry }) => {
    const submitted = attemptsByToken.get(tokenName) ?? 0;

    if (submitted >= MAX_ATTEMPTS_PER_TOKEN) {
      console.warn(
        "[CLIENT-CERT] PIN attempt cap reached for this token this session; not prompting again (restart to retry)"
      );
      // reject(): stops NSS re-prompting without decrementing the retry counter.
      throw new Error("client certificate PIN attempt cap reached");
    }

    let pin;
    try {
      pin = await showSecurePrompt({
        title: "Smartcard PIN",
        heading: "Enter smartcard PIN",
        message: `${hostname} is requesting a client certificate. Enter the PIN for the security token "${tokenName}" to continue.`,
        warning: isRetry
          ? "Previous PIN was incorrect. Repeated wrong attempts can permanently lock the card."
          : "",
        submitLabel: "Unlock",
        cancelLabel: "Cancel",
      });
    } catch {
      // User cancelled, closed the window, or the dialog failed to load (the
      // load failure is logged by securePrompt). Reject so NSS aborts the
      // certificate request instead of looping (an empty-string resolve would
      // re-prompt). Validated safe: this does not decrement the retry counter,
      // and a cancel does not count toward the attempt cap.
      throw new Error("client certificate PIN entry cancelled");
    }

    // Count only actual submissions, so the cap bounds genuine attempts (which
    // spend the card's retry budget) rather than penalising cancels.
    attemptsByToken.set(tokenName, submitted + 1);
    return pin;
  });

  console.debug("[CLIENT-CERT] client-certificate PIN handler registered");
}

module.exports = { initialize };
