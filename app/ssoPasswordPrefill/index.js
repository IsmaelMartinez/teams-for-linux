// app/ssoPasswordPrefill/index.js

/**
 * SSO web-login pre-fill (email + password + MFA method).
 *
 * Many organisations (e.g. the UN) expire the Teams session quickly by policy,
 * so users land on the Microsoft / federated *web* login page on almost every
 * launch and have to retype credentials. This module drives that login form:
 *
 * - fills the email/username field from a static value (`ssoInAppUser`),
 * - fills the password field from a user-defined command
 *   (`ssoInAppPasswordCommand`), e.g. `pass show teams`, so the app itself
 *   stores no secret,
 * - with `ssoInAppAutoSubmit`, advances each step (clicks Next after the email,
 *   Sign in after the password), and
 * - with `ssoInAppVerifyMethod`, clicks the matching option on the "Verify your
 *   identity" MFA method-selection page (e.g. "Text").
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
 *   default, extendable via `ssoInAppLoginHosts`), so credentials/clicks can
 *   never target an arbitrary site.
 * - A per-page observer handles the email fill, the optional Next click, and
 *   the optional verify-method click, and resolves once a password field
 *   exists. Each navigation gets a fresh observer, so the multi-page AAD flow
 *   (email → password → verify → code) is handled step by step. The password
 *   command runs only once a password field is actually present.
 * - A generation counter makes each navigation start a fresh attempt and lets
 *   stale in-flight attempts bail, so a long-waiting observer never blocks the
 *   next page.
 * - MFA method matching is a best-effort text match against the AAD proof list;
 *   see README for its fragility.
 */

const { exec } = require("node:child_process");

// Built-in Microsoft login hosts. Mirrors AUTH_LOGIN_DOMAINS in
// app/mainAppWindow/index.js; kept local so this module stays self-contained.
const DEFAULT_LOGIN_HOSTS = [
  "login.microsoftonline.com",
  "login.microsoft.com",
  "login.live.com",
];

// How long the renderer observer watches for the password field / MFA options,
// and how long the password command may run before being killed.
const OBSERVER_TIMEOUT_MS = 20000;
const COMMAND_TIMEOUT_MS = 15000;
const COMMAND_MAX_BUFFER = 1024 * 1024;

function hostMatches(hostname, suffixes) {
  return suffixes.some((d) => hostname === d || hostname.endsWith("." + d));
}

/**
 * Whether a URL is a login page we may act on. Pure; exported for testing.
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

// Runs in the login page's own context. Handles the current page: fills the
// email field (if a value was provided and it is empty), optionally clicks the
// Next button (autoSubmit, email step only), optionally clicks the MFA option
// whose label matches `verifyMethod`, clicks the matching "Pick an account"
// tile, and resolves once a visible, editable password field exists (or after
// OBSERVER_TIMEOUT_MS).
// Resolves { pwd, email, account, verify, next }.
function buildObserverScript(user, verifyMethod, autoSubmit) {
  return `(() => new Promise((resolve) => {
    const USER = ${JSON.stringify(user)};
    const VERIFY = ${JSON.stringify(verifyMethod)};
    const AUTO = ${JSON.stringify(!!autoSubmit)};
    const editable = (el) => (el.offsetParent !== null || el.getClientRects().length) && !el.disabled && !el.readOnly;
    const setValue = (el, v) => {
      const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      if (desc && desc.set) desc.set.call(el, v); else el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    // Fire a full pointer+click sequence: some AAD tiles ignore a bare
    // .click() and only respond to the pointer/mouse event chain.
    const activate = (el) => {
      try { el.focus(); } catch (e) { void e; }
      for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
        el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
      }
    };
    const EMAIL_SEL = 'input[type=email], input[name=loginfmt], input[name=username], input[autocomplete=username], input[type=text][name*="email" i]';
    const SUBMIT_SEL = '#idSIButton9, input[type=submit], button[type=submit]';
    const pwd = () => Array.from(document.querySelectorAll('input[type=password]')).find(editable);

    let email = USER ? 'no-field' : 'skipped';
    let emailFilled = false;
    const fillEmail = () => {
      if (!USER) return;
      const el = Array.from(document.querySelectorAll(EMAIL_SEL)).find(editable);
      if (!el) return;
      if (el.value) { email = 'already-filled'; emailFilled = true; return; }
      setValue(el, USER);
      email = 'filled';
      emailFilled = true;
    };

    // "Pick an account" tile screen: click the tile matching USER. Scoped to
    // the account-tile holder so it can't misfire on pages that merely show
    // the email as text. Advance action -> gated behind autoSubmit.
    let account = USER ? 'no-tile' : 'skipped';
    let accountAttempts = 0;
    const clickAccount = () => {
      if (!AUTO || !USER || account === 'clicked' || accountAttempts >= 10) return;
      const holder = document.querySelector('#tilesHolder');
      if (!holder) return;
      accountAttempts += 1;
      const want = USER.trim().toLowerCase();
      const matches = (el) =>
        (el.getAttribute('data-test-id') || '').toLowerCase().includes(want) ||
        (el.getAttribute('aria-label') || '').toLowerCase().includes(want) ||
        (el.textContent || '').toLowerCase().includes(want);
      const candidates = Array.from(holder.querySelectorAll('[role=button], [data-test-id], a, [tabindex]'));
      // Prefer an explicit clickable tile; else find any node with the email
      // and climb to its nearest clickable ancestor.
      let target = candidates.find((el) => editable(el) && matches(el));
      if (!target) {
        const node = Array.from(holder.querySelectorAll('*')).find((el) => editable(el) && matches(el));
        target = node ? node.closest('[role=button], a, [data-test-id], [tabindex]') : null;
      } else {
        target = target.closest('[role=button], a, [data-test-id], [tabindex]') || target;
      }
      if (target) { activate(target); account = 'clicked'; }
    };

    // Retry-capped: AAD wires button handlers slightly after render, so a
    // single click at dom-ready is often a no-op. tick() is re-run on
    // mutations and on a timer, so clicks retry until the page advances or the
    // cap is hit (avoids runaway clicking).
    let next = 'skipped';
    let nextAttempts = 0;
    const clickNext = () => {
      // Email step only: advance once the email is in and no password field yet.
      if (!AUTO || !emailFilled || pwd() || nextAttempts >= 6) return;
      const btn = Array.from(document.querySelectorAll(SUBMIT_SEL)).find(editable);
      if (btn) { activate(btn); nextAttempts += 1; next = 'clicked'; }
    };

    let verify = VERIFY ? 'no-match' : 'skipped';
    let verifyAttempts = 0;
    const clickVerify = () => {
      if (!VERIFY || verify === 'clicked' || verifyAttempts >= 10) return;
      verifyAttempts += 1;
      const want = VERIFY.trim().toLowerCase();
      const scope = document.querySelector('#idDiv_SAOTCS_Proofs') || document.body;
      const rows = Array.from(scope.querySelectorAll('[data-value], [role=button], a, button'));
      const target = rows.find((el) => editable(el) && (el.textContent || '').trim().toLowerCase().startsWith(want));
      if (target) { activate(target); verify = 'clicked'; }
    };

    const tick = () => { fillEmail(); clickAccount(); clickNext(); clickVerify(); };
    const state = (pwdFound) => ({ pwd: pwdFound, email, account, verify, next });
    tick();
    if (pwd()) return resolve(state(true));
    const finish = (pwdFound) => { obs.disconnect(); clearTimeout(t); clearInterval(iv); resolve(state(pwdFound)); };
    const obs = new MutationObserver(() => { tick(); if (pwd()) finish(true); });
    obs.observe(document.documentElement, { childList: true, subtree: true });
    // Timer retries cover the case where AAD enables the button late and fires
    // no further mutations for the observer to react to.
    const iv = setInterval(() => { tick(); if (pwd()) finish(true); }, 500);
    const t = setTimeout(() => finish(false), ${OBSERVER_TIMEOUT_MS});
  }))()`;
}

function buildPasswordFillScript(password, autoSubmit) {
  // JSON.stringify safely encodes the password (quotes, backslashes, unicode,
  // newlines, `</script>`) as a JS string literal for embedding.
  //
  // Resilient fill: the AAD password page often mounts a beat after the field
  // appears and resets the input to empty during hydration, so a one-shot fill
  // gets wiped and Sign in submits blank ("Please enter your password"). We
  // re-apply the value whenever it drifts from PWD, and only click Sign in once
  // the value has held for two consecutive ticks (~0.5s) — i.e. after AAD has
  // stopped resetting it.
  return `(() => new Promise((resolve) => {
    const PWD = ${JSON.stringify(password)};
    const AUTO = ${JSON.stringify(!!autoSubmit)};
    const editable = (el) => (el.offsetParent !== null || el.getClientRects().length) && !el.disabled && !el.readOnly;
    const findPwd = () => Array.from(document.querySelectorAll('input[type=password]')).find(editable);
    const setValue = (el, v) => {
      try { el.focus(); } catch (e) { void e; }
      const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      if (desc && desc.set) desc.set.call(el, v); else el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    let filled = false;
    let signedIn = false;
    let stable = 0;
    let ticks = 0;
    const done = () => { obs.disconnect(); clearInterval(iv); resolve(!filled ? 'no-field' : (signedIn ? 'filled-submitted' : 'filled')); };
    const tick = () => {
      ticks += 1;
      const el = findPwd();
      if (!el) { if (filled) return done(); return; } // field gone after submit -> done
      if (el.value !== PWD) { setValue(el, PWD); filled = true; stable = 0; }
      else { filled = true; stable += 1; }
      if (AUTO && !signedIn && stable >= 2) {
        const btn = document.querySelector('#idSIButton9, input[type=submit], button[type=submit]')
          || (el.form && el.form.querySelector('button, input[type=submit]'));
        if (btn && (btn.offsetParent !== null || btn.getClientRects().length) && !btn.disabled) {
          btn.click();
          signedIn = true;
        }
      }
      if (ticks > 40) done(); // ~10s safety cap
    };
    tick();
    const obs = new MutationObserver(tick);
    obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    const iv = setInterval(tick, 250);
    setTimeout(done, 10000);
  }))()`;
}

/**
 * Attach the pre-fill behaviour to the main window. No-op unless at least one
 * of `ssoInAppUser` / `ssoInAppPasswordCommand` / `ssoInAppVerifyMethod` is set.
 * @param {Electron.BrowserWindow} window
 * @param {object} config startup config
 */
function attach(window, config) {
  const user = (config.ssoInAppUser || "").trim();
  const command = (config.ssoInAppPasswordCommand || "").trim();
  const verifyMethod = (config.ssoInAppVerifyMethod || "").trim();
  if (!user && !command && !verifyMethod) return;

  const extraHosts = Array.isArray(config.ssoInAppLoginHosts)
    ? config.ssoInAppLoginHosts
    : [];
  const autoSubmit = !!config.ssoInAppAutoSubmit;
  const wc = window.webContents;
  let generation = 0;

  const originOf = (url) => {
    try {
      return new URL(url).origin;
    } catch {
      return null;
    }
  };

  // All frames in the webContents (main + iframes). Teams renders the login in
  // an iframe in some flows, and our injected script only sees its own frame,
  // so we must find the right frame rather than assuming the main one.
  const allFrames = () => {
    try {
      return wc.mainFrame.framesInSubtree;
    } catch {
      return [];
    }
  };

  const loginFrames = () =>
    allFrames().filter((f) => {
      try {
        return f && isLoginUrl(f.url, extraHosts);
      } catch {
        return false;
      }
    });

  async function handleFrame(frame, gen) {
    const origin = originOf(frame.url);
    try {
      const result = await frame
        .executeJavaScript(
          buildObserverScript(user || null, verifyMethod || null, autoSubmit),
          true,
        )
        .catch((e) => ({ __err: e.message }));
      if (gen !== generation) return; // navigated away; abandon this attempt
      // Skip hidden MSAL auth iframes (script failed) and frames mid-navigation
      // (no structured result) — neither is an actionable login page.
      if (!result || result.__err || typeof result.pwd !== "boolean") {
        console.debug("[SSO_PREFILL] Frame not actionable", { frame: origin });
        return;
      }
      console.info("[SSO_PREFILL] Login page handled", {
        frame: origin,
        email: result.email,
        account: result.account,
        pwField: result.pwd,
        verify: result.verify,
        next: result.next,
      });

      if (!command || !result.pwd) return;

      const password = firstLine(await runPasswordCommand(command));
      if (gen !== generation) return;
      if (!password) {
        console.warn("[SSO_PREFILL] Password command returned empty output");
        return;
      }

      const fill = await frame.executeJavaScript(
        buildPasswordFillScript(password, autoSubmit),
        true,
      );
      console.info("[SSO_PREFILL] Credential filled", { result: fill });
    } catch (error) {
      console.error("[SSO_PREFILL] Prefill failed", {
        code: error.code,
        message: error.message,
      });
    }
  }

  const onNav = () => {
    generation += 1;
    const gen = generation;
    const frames = loginFrames();
    if (!frames.length) {
      // Surface likely-but-unmatched login frames (origins only — public
      // hostnames, no PII) so an unrecognised IdP host can be added to
      // ssoInAppLoginHosts.
      const origins = [...new Set(allFrames().map((f) => originOf(f.url)).filter(Boolean))];
      const suspects = origins.filter((o) => /login|auth|sso|adfs|sts|sign|account/i.test(o));
      if (suspects.length) {
        console.info("[SSO_PREFILL] Login-like frames not matched (add to ssoInAppLoginHosts?)", {
          suspects,
        });
      }
      return;
    }
    for (const frame of frames) handleFrame(frame, gen);
  };

  wc.on("dom-ready", onNav);
  wc.on("did-navigate", onNav);
  // Subframe navigations don't fire did-navigate; catch login iframes too.
  wc.on("did-frame-navigate", (_e, url) => {
    if (isLoginUrl(url, extraHosts)) onNav();
  });
  console.info("[SSO_PREFILL] Enabled", {
    emailPrefill: !!user,
    pwPrefill: !!command,
    verifyMethod: verifyMethod || null,
    autoSubmit,
    extraHosts: extraHosts.length,
  });
}

module.exports = { attach, isLoginUrl };
