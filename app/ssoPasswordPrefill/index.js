// app/ssoPasswordPrefill/index.js

/**
 * SSO web-login password pre-fill.
 *
 * Many organisations (e.g. the UN) expire the Teams session quickly by policy,
 * so users land on the Microsoft / federated "Enter password" *web* page on
 * almost every launch. Microsoft already remembers the account (email), but
 * never the password, so it has to be retyped each time. This module pre-fills
 * the password field on that login page from a user-defined command
 * (`ssoInAppPasswordCommand`), e.g. `pass show teams`, so the app itself stores
 * no secret.
 *
 * This is distinct from `app/login/` (the native HTTP Basic/NTLM dialog and its
 * `ssoBasicAuthPasswordCommand`); that never touches the web login form.
 *
 * Design / security:
 * - The command runs in the main process only. Its output (the password) is
 *   handed to the login page's renderer via `executeJavaScript` solely to set
 *   the field value — the same place the user would type it. It is never
 *   logged, persisted, or sent anywhere else, and the local reference is
 *   cleared right after injection.
 * - Injection is gated to recognised login hosts (Microsoft login domains by
 *   default, extendable via `ssoInAppLoginHosts`), so the password can never be
 *   filled into an arbitrary site.
 * - A detector (a Promise resolved by a MutationObserver) means the command
 *   only runs once a visible password field actually exists — it handles the
 *   SPA email->password transition where no new navigation fires, and avoids
 *   running the command on pages that have no password field.
 * - Auto-submit is opt-in (`ssoInAppAutoSubmit`, default false); otherwise the
 *   field is only filled and the user clicks "Sign in".
 */

const { exec } = require("node:child_process");

// Built-in Microsoft login hosts. Mirrors AUTH_LOGIN_DOMAINS in
// app/mainAppWindow/index.js; kept local so this module stays self-contained.
const DEFAULT_LOGIN_HOSTS = [
  "login.microsoftonline.com",
  "login.microsoft.com",
  "login.live.com",
];

// How long the renderer detector waits for a password field to appear, and how
// long the password command may run before being killed.
const DETECTOR_TIMEOUT_MS = 15000;
const COMMAND_TIMEOUT_MS = 15000;
const COMMAND_MAX_BUFFER = 1024 * 1024;

function hostMatches(hostname, suffixes) {
  return suffixes.some((d) => hostname === d || hostname.endsWith("." + d));
}

/**
 * Whether a URL is a login page we may pre-fill. Pure; exported for testing.
 * @param {string} url
 * @param {string[]} [extraHosts] additional host suffixes from config
 */
function isLoginUrl(url, extraHosts = []) {
  try {
    const hostname = new URL(url).hostname;
    return hostMatches(hostname, [...DEFAULT_LOGIN_HOSTS, ...extraHosts]);
  } catch {
    return false;
  }
}

// Password managers (`pass`, `secret-tool`, KeePassXC CLI, ...) emit the secret
// on the first line; ignore anything after it and the trailing newline.
function firstLine(stdout) {
  return String(stdout).split(/\r?\n/, 1)[0];
}

function runPasswordCommand(command) {
  return new Promise((resolve, reject) => {
    // Shell execution is intended: the command comes from the user's own config
    // and may use pipes/expansion, exactly like ssoBasicAuthPasswordCommand.
    exec(
      command,
      { timeout: COMMAND_TIMEOUT_MS, windowsHide: true, maxBuffer: COMMAND_MAX_BUFFER },
      (error, stdout) => (error ? reject(error) : resolve(stdout)),
    );
  });
}

// Resolves true once a visible, editable password field exists in the page,
// or false after DETECTOR_TIMEOUT_MS. Runs in the login page's own context.
const DETECTOR_SCRIPT = `(() => new Promise((resolve) => {
  const editable = (el) => (el.offsetParent !== null || el.getClientRects().length) && !el.disabled && !el.readOnly;
  const find = () => Array.from(document.querySelectorAll('input[type="password"]')).find(editable);
  if (find()) return resolve(true);
  const obs = new MutationObserver(() => { if (find()) { obs.disconnect(); clearTimeout(t); resolve(true); } });
  obs.observe(document.documentElement, { childList: true, subtree: true });
  const t = setTimeout(() => { obs.disconnect(); resolve(false); }, ${DETECTOR_TIMEOUT_MS});
}))()`;

function buildFillScript(password, autoSubmit) {
  // JSON.stringify safely encodes the password (quotes, backslashes, unicode)
  // as a JS string literal for embedding.
  return `(() => {
    const PWD = ${JSON.stringify(password)};
    const AUTO = ${JSON.stringify(!!autoSubmit)};
    const editable = (el) => (el.offsetParent !== null || el.getClientRects().length) && !el.disabled && !el.readOnly;
    const el = Array.from(document.querySelectorAll('input[type="password"]')).find(editable);
    if (!el) return 'no-field';
    if (el.value) return 'already-filled';
    // Use the native value setter so React/Angular's change tracking fires.
    const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
    if (desc && desc.set) desc.set.call(el, PWD); else el.value = PWD;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    if (AUTO) {
      const btn = document.querySelector('#idSIButton9, input[type=submit], button[type=submit]')
        || (el.form && el.form.querySelector('button, input[type=submit]'));
      if (btn) setTimeout(() => btn.click(), 50);
    }
    return 'filled';
  })()`;
}

/**
 * Attach the pre-fill behaviour to the main window. No-op unless
 * `ssoInAppPasswordCommand` is configured.
 * @param {Electron.BrowserWindow} window
 * @param {object} config startup config
 */
function attach(window, config) {
  const command = (config.ssoInAppPasswordCommand || "").trim();
  if (!command) return;

  const extraHosts = Array.isArray(config.ssoInAppLoginHosts)
    ? config.ssoInAppLoginHosts
    : [];
  const autoSubmit = !!config.ssoInAppAutoSubmit;
  const wc = window.webContents;
  let inFlight = false;

  async function maybePrefill() {
    if (inFlight) return;
    let url;
    try {
      url = wc.getURL();
    } catch {
      return;
    }
    if (!isLoginUrl(url, extraHosts)) return;

    inFlight = true;
    let password = null;
    try {
      const present = await wc
        .executeJavaScript(DETECTOR_SCRIPT, true)
        .catch(() => false);
      if (!present) return;

      password = firstLine(await runPasswordCommand(command));
      if (!password) {
        console.warn("[SSO_PREFILL] Password command returned empty output");
        return;
      }

      const result = await wc.executeJavaScript(
        buildFillScript(password, autoSubmit),
        true,
      );
      console.debug("[SSO_PREFILL] Prefill attempt", { result });
    } catch (error) {
      console.error("[SSO_PREFILL] Prefill failed", {
        code: error.code,
        message: error.message,
      });
    } finally {
      password = null;
      inFlight = false;
    }
  }

  wc.on("dom-ready", maybePrefill);
  wc.on("did-navigate", maybePrefill);
  console.debug("[SSO_PREFILL] Enabled", {
    autoSubmit,
    extraHosts: extraHosts.length,
  });
}

module.exports = { attach, isLoginUrl };
