// app/ssoPasswordPrefill/index.js

/**
 * SSO web-login pre-fill (email + password).
 *
 * Many organisations (e.g. the UN) expire the Teams session quickly by policy,
 * so users land on the Microsoft / federated *web* login page on almost every
 * launch and have to retype credentials. This module pre-fills that login form:
 *
 * - the email/username field from a static value (`ssoInAppUser`), and
 * - the password field from a user-defined command (`ssoInAppPasswordCommand`),
 *   e.g. `pass show teams`, so the app itself stores no secret.
 *
 * This is distinct from `app/login/` (the native HTTP Basic/NTLM dialog and its
 * `ssoBasicAuthPasswordCommand`); that never touches the web login form.
 *
 * Design / security:
 * - The password command runs in the main process only. Its output goes to the
 *   login page's renderer via `executeJavaScript` solely to set the field
 *   value — the same place the user would type it — and is never logged,
 *   persisted, or sent anywhere else; the local reference is cleared right
 *   after injection.
 * - Injection is gated to recognised login hosts (Microsoft login domains by
 *   default, extendable via `ssoInAppLoginHosts`), so credentials can never be
 *   filled into an arbitrary site.
 * - A single injected observer fills the email field as soon as it appears and
 *   resolves once a password field exists; this covers both the single-page
 *   email->password transition (no new navigation) and federated flows that
 *   navigate to a separate password host. The password command runs only once
 *   a password field is actually present.
 * - A generation counter makes each navigation start a fresh attempt and lets
 *   stale in-flight attempts bail, so a long-waiting observer never blocks the
 *   next page.
 * - Auto-submit is opt-in (`ssoInAppAutoSubmit`, default false).
 */

const { exec } = require("node:child_process");

// Built-in Microsoft login hosts. Mirrors AUTH_LOGIN_DOMAINS in
// app/mainAppWindow/index.js; kept local so this module stays self-contained.
const DEFAULT_LOGIN_HOSTS = [
  "login.microsoftonline.com",
  "login.microsoft.com",
  "login.live.com",
];

// How long the renderer observer waits for a password field to appear, and how
// long the password command may run before being killed.
const OBSERVER_TIMEOUT_MS = 15000;
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

// Runs in the login page's own context. Fills the email/username field (if a
// value was provided) as soon as it appears and stays empty, and resolves once
// a visible, editable password field exists (or after OBSERVER_TIMEOUT_MS).
// Resolves { pwd: boolean, email: 'skipped'|'no-field'|'filled'|'already-filled' }.
function buildObserverScript(user) {
  return `(() => new Promise((resolve) => {
    const USER = ${JSON.stringify(user)};
    const editable = (el) => (el.offsetParent !== null || el.getClientRects().length) && !el.disabled && !el.readOnly;
    const setValue = (el, v) => {
      const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      if (desc && desc.set) desc.set.call(el, v); else el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const EMAIL_SEL = 'input[type=email], input[name=loginfmt], input[name=username], input[autocomplete=username], input[type=text][name*="email" i]';
    let email = USER ? 'no-field' : 'skipped';
    const fillEmail = () => {
      if (!USER) return;
      const el = Array.from(document.querySelectorAll(EMAIL_SEL)).find(editable);
      if (!el) return;
      if (el.value) { email = 'already-filled'; return; }
      setValue(el, USER);
      email = 'filled';
    };
    const pwd = () => Array.from(document.querySelectorAll('input[type=password]')).find(editable);
    fillEmail();
    if (pwd()) return resolve({ pwd: true, email });
    const obs = new MutationObserver(() => { fillEmail(); if (pwd()) { obs.disconnect(); clearTimeout(t); resolve({ pwd: true, email }); } });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    const t = setTimeout(() => { obs.disconnect(); resolve({ pwd: false, email }); }, ${OBSERVER_TIMEOUT_MS});
  }))()`;
}

function buildPasswordFillScript(password, autoSubmit) {
  // JSON.stringify safely encodes the password (quotes, backslashes, unicode,
  // newlines, `</script>`) as a JS string literal for embedding.
  return `(() => {
    const PWD = ${JSON.stringify(password)};
    const AUTO = ${JSON.stringify(!!autoSubmit)};
    const editable = (el) => (el.offsetParent !== null || el.getClientRects().length) && !el.disabled && !el.readOnly;
    const el = Array.from(document.querySelectorAll('input[type=password]')).find(editable);
    if (!el) return 'no-field';
    if (el.value) return 'already-filled';
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
 * Attach the pre-fill behaviour to the main window. No-op unless at least one
 * of `ssoInAppUser` / `ssoInAppPasswordCommand` is configured.
 * @param {Electron.BrowserWindow} window
 * @param {object} config startup config
 */
function attach(window, config) {
  const user = (config.ssoInAppUser || "").trim();
  const command = (config.ssoInAppPasswordCommand || "").trim();
  if (!user && !command) return;

  const extraHosts = Array.isArray(config.ssoInAppLoginHosts)
    ? config.ssoInAppLoginHosts
    : [];
  const autoSubmit = !!config.ssoInAppAutoSubmit;
  const wc = window.webContents;
  let generation = 0;

  async function maybePrefill(gen) {
    let url;
    try {
      url = wc.getURL();
    } catch {
      return;
    }
    if (!isLoginUrl(url, extraHosts)) return;

    let password = null;
    try {
      const result = await wc
        .executeJavaScript(buildObserverScript(user || null), true)
        .catch(() => ({ pwd: false, email: "error" }));
      if (gen !== generation) return; // navigated away; abandon this attempt
      console.info("[SSO_PREFILL] Login page handled", {
        email: result.email,
        passwordFieldFound: result.pwd,
      });

      if (!command || !result.pwd) return;

      password = firstLine(await runPasswordCommand(command));
      if (gen !== generation) return;
      if (!password) {
        console.warn("[SSO_PREFILL] Password command returned empty output");
        return;
      }

      const fill = await wc.executeJavaScript(
        buildPasswordFillScript(password, autoSubmit),
        true,
      );
      console.info("[SSO_PREFILL] Password field", { result: fill });
    } catch (error) {
      console.error("[SSO_PREFILL] Prefill failed", {
        code: error.code,
        message: error.message,
      });
    } finally {
      password = null;
    }
  }

  const onNav = () => {
    generation += 1;
    maybePrefill(generation);
  };
  wc.on("dom-ready", onNav);
  wc.on("did-navigate", onNav);
  console.info("[SSO_PREFILL] Enabled", {
    prefillEmail: !!user,
    prefillPassword: !!command,
    autoSubmit,
    extraHosts: extraHosts.length,
  });
}

module.exports = { attach, isLoginUrl };
