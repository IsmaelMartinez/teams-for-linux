// app/ssoPasswordPrefill/index.js

/**
 * SSO web-login pre-fill (email + password + MFA method).
 *
 * Many organisations (e.g. the UN) expire the Teams session quickly by policy,
 * so users land on the Microsoft / federated *web* login page on almost every
 * launch and have to retype credentials. This module drives that login form:
 *
 * - fills the email/username field from a static value (`auth.webLogin.user`),
 * - fills the password field from a user-defined command
 *   (`auth.webLogin.passwordCommand`), e.g. `pass show teams`, so the app itself
 *   stores no secret,
 * - with `auth.webLogin.autoSubmit`, advances each step (clicks Next after the email,
 *   Sign in after the password), and
 * - with `auth.webLogin.verifyMethod`, clicks the matching option on the "Verify your
 *   identity" MFA method-selection page (e.g. "Text").
 *
 * This is distinct from `app/login/` (the native HTTP Basic/NTLM dialog and its
 * `ssoBasicAuthPasswordCommand`); that never touches the web login form.
 *
 * Design / security:
 * - The password command runs in the main process only. Its output goes to the
 *   login page's renderer via `executeJavaScript` solely to set the field
 *   value — the same place the user would type it — and is never logged,
 *   persisted, or sent anywhere else. It lives only in a local `const` for the
 *   duration of the injection call and is unreachable once it returns.
 * - Injection is gated to recognised login hosts (Microsoft login domains by
 *   default, extendable via `auth.webLogin.extraHosts`), so credentials/clicks can
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
    const parsed = new URL(url);
    // Only ever act over HTTPS: this gate decides where the password gets
    // injected, so a cleartext (http:) page must never qualify even on an
    // otherwise-recognised login host.
    if (parsed.protocol !== "https:") return false;
    return hostMatches(parsed.hostname, [...DEFAULT_LOGIN_HOSTS, ...extraHosts]);
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

// Renderer-side helpers shared by both injected scripts (embedded verbatim in
// each script string). Kept in one place so the two scripts don't duplicate
// them. Runs in the login page's own context.
const RENDERER_PRELUDE = `
    const editable = (el) => (el.offsetParent !== null || el.getClientRects().length) && !el.disabled && !el.readOnly;
    const setValue = (el, v) => {
      try { el.focus(); } catch (e) { void e; }
      const desc = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
      if (desc && desc.set) desc.set.call(el, v); else el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const SUBMIT_SEL = '#idSIButton9, input[type=submit], button[type=submit]';
    const findPwd = () => Array.from(document.querySelectorAll('input[type=password]')).find(editable);
`;

// Runs in the login page's own context. Handles the current page: fills the
// email field (if a value was provided and it is empty), optionally clicks the
// Next button (autoSubmit, email step only), optionally clicks the MFA option
// whose label matches `verifyMethod`, clicks the matching "Pick an account"
// tile, and resolves once a visible, editable password field exists (or after
// OBSERVER_TIMEOUT_MS).
// Resolves { pwd, email, account, verify, next }.
function buildObserverScript(gen, user, verifyMethod, autoSubmit) {
  return `(() => new Promise((resolve) => {
    ${RENDERER_PRELUDE}
    const GEN = ${JSON.stringify(gen)};
    const USER = ${JSON.stringify(user)};
    const VERIFY = ${JSON.stringify(verifyMethod)};
    const AUTO = ${JSON.stringify(!!autoSubmit)};
    // A single login navigation fires dom-ready + did-navigate (+
    // did-frame-navigate), so several observer scripts can be live in the same
    // document at once. Coordinate through one window-scoped object:
    //  - NS.gen lets a superseded (older-generation) script stop ticking, so it
    //    doesn't keep running click loops for the full OBSERVER_TIMEOUT_MS.
    //  - NS.account/next/verify are shared one-shot flags so each click happens
    //    at most once across ALL live scripts — the earliest script acts on its
    //    first synchronous tick before a newer one can bump NS.gen, so the gen
    //    marker alone can't stop that first click (e.g. a duplicate MFA text).
    const NS = (window.__ssoPrefill = window.__ssoPrefill || {});
    NS.gen = GEN;
    const superseded = () => NS.gen !== GEN;
    // Fire a full pointer+click sequence: some AAD tiles ignore a bare
    // .click() and only respond to the pointer/mouse event chain.
    const activate = (el) => {
      try { el.focus(); } catch (e) { void e; }
      for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
        el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
      }
    };
    const EMAIL_SEL = 'input[type=email], input[name=loginfmt], input[name=username], input[autocomplete=username], input[type=text][name*="email" i]';

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
      if (!AUTO || !USER || NS.account || accountAttempts >= 10) return;
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
      if (target) { activate(target); NS.account = true; account = 'clicked'; }
    };

    // Retry-capped: AAD wires button handlers slightly after render, so a
    // single click at dom-ready is often a no-op. tick() is re-run on
    // mutations and on a timer, so clicks retry until the page advances or the
    // cap is hit (avoids runaway clicking).
    let next = 'skipped';
    let nextAttempts = 0;
    const clickNext = () => {
      // Email step only: advance once the email is in and no password field yet.
      if (!AUTO || !emailFilled || findPwd() || NS.next || nextAttempts >= 6) return;
      const btn = Array.from(document.querySelectorAll(SUBMIT_SEL)).find(editable);
      if (btn) { activate(btn); NS.next = true; nextAttempts += 1; next = 'clicked'; }
    };

    let verify = VERIFY ? 'no-match' : 'skipped';
    let verifyAttempts = 0;
    const clickVerify = () => {
      if (!VERIFY || NS.verify || verifyAttempts >= 10) return;
      verifyAttempts += 1;
      const want = VERIFY.trim().toLowerCase();
      const scope = document.querySelector('#idDiv_SAOTCS_Proofs') || document.body;
      const rows = Array.from(scope.querySelectorAll('[data-value], [role=button], a, button'));
      const target = rows.find((el) => editable(el) && (el.textContent || '').trim().toLowerCase().startsWith(want));
      if (target) { activate(target); NS.verify = true; verify = 'clicked'; }
    };

    const tick = () => { if (superseded()) return; fillEmail(); clickAccount(); clickNext(); clickVerify(); };
    const state = (pwdFound) => ({ pwd: pwdFound, email, account, verify, next });
    tick();
    if (findPwd()) return resolve(state(true));
    const finish = (pwdFound) => { obs.disconnect(); clearTimeout(t); clearInterval(iv); resolve(state(pwdFound)); };
    // Bail as soon as a newer-generation script has taken over, so this one
    // stops looping instead of running until OBSERVER_TIMEOUT_MS.
    const step = () => { if (superseded()) return finish(false); tick(); if (findPwd()) finish(true); };
    const obs = new MutationObserver(step);
    obs.observe(document.documentElement, { childList: true, subtree: true });
    // Timer retries cover the case where AAD enables the button late and fires
    // no further mutations for the observer to react to.
    const iv = setInterval(step, 500);
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
    ${RENDERER_PRELUDE}
    const PWD = ${JSON.stringify(password)};
    const AUTO = ${JSON.stringify(!!autoSubmit)};
    // Shared with any concurrent script in this document so Sign in is clicked
    // at most once even if more than one fill script is injected.
    const NS = (window.__ssoPrefill = window.__ssoPrefill || {});
    let filled = false;
    let signedIn = false;
    let stable = 0;
    let ticks = 0;
    const done = () => { obs.disconnect(); clearInterval(iv); clearTimeout(t); resolve(!filled ? 'no-field' : (signedIn ? 'filled-submitted' : 'filled')); };
    const tick = () => {
      ticks += 1;
      const el = findPwd();
      if (!el) { if (filled) return done(); return; } // field gone after submit -> done
      if (el.value !== PWD) { setValue(el, PWD); filled = true; stable = 0; }
      else { filled = true; stable += 1; }
      if (AUTO && !signedIn && !NS.signIn && stable >= 2) {
        const btn = document.querySelector(SUBMIT_SEL)
          || (el.form && el.form.querySelector('button, input[type=submit]'));
        if (btn && editable(btn)) {
          btn.click();
          NS.signIn = true;
          signedIn = true;
        }
      }
      if (ticks > 40) done(); // ~10s safety cap
    };
    tick();
    const obs = new MutationObserver(tick);
    obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    const iv = setInterval(tick, 250);
    const t = setTimeout(done, 10000);
  }))()`;
}

/**
 * Attach the pre-fill behaviour to the main window. No-op unless at least one
 * of `auth.webLogin.user` / `auth.webLogin.passwordCommand` /
 * `auth.webLogin.verifyMethod` is set.
 * @param {Electron.BrowserWindow} window
 * @param {object} config startup config
 */
function attach(window, config) {
  const webLogin = config.auth?.webLogin || {};
  const user = (webLogin.user || "").trim();
  const command = (webLogin.passwordCommand || "").trim();
  const verifyMethod = (webLogin.verifyMethod || "").trim();
  if (!user && !command && !verifyMethod) return;

  const extraHosts = Array.isArray(webLogin.extraHosts)
    ? webLogin.extraHosts
    : [];
  const autoSubmit = !!webLogin.autoSubmit;
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
          buildObserverScript(gen, user || null, verifyMethod || null, autoSubmit),
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

      // The password command can block for seconds (e.g. a pinentry prompt),
      // during which this frame may have navigated away — and a navigation to a
      // non-login URL does not bump `generation`. Re-check the frame's current
      // URL right before injecting so the password is never typed into a
      // different document.
      let currentUrl = null;
      try {
        currentUrl = frame.url;
      } catch {
        return; // frame gone
      }
      if (!isLoginUrl(currentUrl, extraHosts)) {
        console.debug("[SSO_PREFILL] Frame left the login page before fill; skipping");
        return;
      }

      const fill = await frame.executeJavaScript(
        buildPasswordFillScript(password, autoSubmit),
        true,
      );
      console.info("[SSO_PREFILL] Credential filled", { result: fill });
    } catch (error) {
      console.error("[SSO_PREFILL] Prefill failed", { code: error.code });
    }
  }

  const onNav = () => {
    generation += 1;
    const gen = generation;
    const frames = loginFrames();
    if (!frames.length) {
      // Surface likely-but-unmatched login frames (origins only — public
      // hostnames, no PII) so an unrecognised IdP host can be added to
      // auth.webLogin.extraHosts.
      const origins = [...new Set(allFrames().map((f) => originOf(f.url)).filter(Boolean))];
      const suspects = origins.filter((o) => /login|auth|sso|adfs|sts|sign|account/i.test(o));
      if (suspects.length) {
        // debug, not info: a federated tenant's IdP origin (e.g. an ADFS host)
        // identifies the user's employer, which is on the never-log-at-info list.
        console.debug("[SSO_PREFILL] Login-like frames not matched (add to auth.webLogin.extraHosts?)", {
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
