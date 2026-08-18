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

// `pass otp` and friends print codes grouped as "123 456". Strip whitespace
// rather than non-digits: some issuers use alphanumeric codes.
function codeFrom(stdout) {
  return firstLine(stdout).replace(/\s+/g, "");
}

function runCommand(command) {
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
    // The converged AAD code page uses its own continue button rather than the
    // generic primary one, so that id is tried first.
    const OTC_SUBMIT_SEL = '#idSubmit_SAOTCC_Continue, ' + SUBMIT_SEL;
    const findPwd = () => Array.from(document.querySelectorAll('input[type=password]')).find(editable);
    // name=otc has been stable across AAD generations; the id is the current
    // converged page; autocomplete is an unverified fallback. One query matches
    // all three, so the first in document order wins, not the first listed.
    const findOtc = () => Array.from(document.querySelectorAll('input[name="otc"], #idTxtBx_SAOTCC_OTC, input[autocomplete="one-time-code"]')).find(editable);
`;

// Runs in the login page's own context. Handles the current page: fills the
// email field (if a value was provided and it is empty), optionally clicks the
// Next button (autoSubmit, email step only), optionally clicks the MFA option
// whose label matches `verifyMethod`, clicks the matching "Pick an account"
// tile, and resolves once a visible, editable password field exists (or after
// OBSERVER_TIMEOUT_MS).
// Resolves { pwd, email, account, verify, next }.
function buildObserverScript(gen, user, verifyMethod, autoSubmit, wantOtc) {
  return `(() => new Promise((resolve) => {
    ${RENDERER_PRELUDE}
    const GEN = ${JSON.stringify(gen)};
    const USER = ${JSON.stringify(user)};
    const VERIFY = ${JSON.stringify(verifyMethod)};
    const AUTO = ${JSON.stringify(!!autoSubmit)};
    const WANT_OTC = ${JSON.stringify(!!wantOtc)};
    // Only look for the code field when a totpCommand is configured, so an
    // existing password-only setup keeps the exact behaviour it had.
    const otcNow = () => WANT_OTC && !!findOtc();
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
      if (!AUTO || !emailFilled || findPwd() || otcNow() || NS.next || nextAttempts >= 6) return;
      const btn = Array.from(document.querySelectorAll(SUBMIT_SEL)).find(editable);
      if (btn) { activate(btn); NS.next = true; nextAttempts += 1; next = 'clicked'; }
    };

    let verify = VERIFY ? 'no-match' : 'skipped';
    let verifyAttempts = 0;
    const clickVerify = () => {
      if (!VERIFY || otcNow() || NS.verify || verifyAttempts >= 10) return;
      verifyAttempts += 1;
      const want = VERIFY.trim().toLowerCase();
      const scope = document.querySelector('#idDiv_SAOTCS_Proofs') || document.body;
      const rows = Array.from(scope.querySelectorAll('[data-value], [role=button], a, button'));
      const target = rows.find((el) => editable(el) && (el.textContent || '').trim().toLowerCase().startsWith(want));
      if (target) { activate(target); NS.verify = true; verify = 'clicked'; }
    };

    const tick = () => { if (superseded()) return; fillEmail(); clickAccount(); clickNext(); clickVerify(); };
    const state = (pwdFound, otcFound) => ({ pwd: pwdFound, otc: otcFound, email, account, verify, next });
    tick();
    if (findPwd() || otcNow()) return resolve(state(!!findPwd(), otcNow()));
    const finish = (pwdFound, otcFound) => { obs.disconnect(); clearTimeout(t); clearInterval(iv); resolve(state(pwdFound, otcFound)); };
    // Bail as soon as a newer-generation script has taken over, so this one
    // stops looping instead of running until OBSERVER_TIMEOUT_MS.
    const step = () => { if (superseded()) return finish(false, false); tick(); if (findPwd() || otcNow()) finish(!!findPwd(), otcNow()); };
    const obs = new MutationObserver(step);
    obs.observe(document.documentElement, { childList: true, subtree: true });
    // Timer retries cover the case where AAD enables the button late and fires
    // no further mutations for the observer to react to.
    const iv = setInterval(step, 500);
    const t = setTimeout(() => finish(false, false), ${OBSERVER_TIMEOUT_MS});
  }))()`;
}

// Resilient fill shared by the password and one-time-code steps. AAD mounts the
// form a beat after the field appears and resets the input during hydration, so
// a one-shot fill gets wiped and the submit sends blank ("Please enter your
// password"). We re-apply the value whenever it drifts, and only submit once it
// has held for two consecutive ticks (~0.5s), i.e. after AAD stopped resetting it.
//
// `find`, `submitSel` and `flag` are identifiers/keys from our own code, not user
// input. The value itself goes through JSON.stringify, which safely encodes
// quotes, backslashes, unicode, newlines and `</script>` as a JS string literal.
function buildFillScript({ value, autoSubmit, find, submitSel, flag }) {
  return `(() => new Promise((resolve) => {
    ${RENDERER_PRELUDE}
    const VAL = ${JSON.stringify(value)};
    const AUTO = ${JSON.stringify(!!autoSubmit)};
    const findField = ${find};
    const SUBMIT = ${submitSel};
    // Shared with any concurrent script in this document so the submit is
    // clicked at most once even if more than one fill script is injected. The
    // password and code steps use different keys so one cannot suppress the other.
    const NS = (window.__ssoPrefill = window.__ssoPrefill || {});
    const FLAG = ${JSON.stringify(flag)};
    let filled = false;
    let submitted = false;
    let stable = 0;
    let ticks = 0;
    const done = () => { obs.disconnect(); clearInterval(iv); clearTimeout(t); resolve(!filled ? 'no-field' : (submitted ? 'filled-submitted' : 'filled')); };
    const tick = () => {
      ticks += 1;
      const el = findField();
      if (!el) { if (filled) return done(); return; } // field gone after submit -> done
      if (el.value !== VAL) { setValue(el, VAL); filled = true; stable = 0; }
      else { filled = true; stable += 1; }
      if (AUTO && !submitted && !NS[FLAG] && stable >= 2) {
        const btn = document.querySelector(SUBMIT)
          || (el.form && el.form.querySelector('button, input[type=submit]'));
        if (btn && editable(btn)) {
          btn.click();
          NS[FLAG] = true;
          submitted = true;
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

function buildPasswordFillScript(password, autoSubmit) {
  return buildFillScript({
    value: password,
    autoSubmit,
    find: "findPwd",
    submitSel: "SUBMIT_SEL",
    flag: "signIn",
  });
}

function buildTotpFillScript(code, autoSubmit) {
  return buildFillScript({
    value: code,
    autoSubmit,
    find: "findOtc",
    submitSel: "OTC_SUBMIT_SEL",
    flag: "totpSubmit",
  });
}

/**
 * Attach the pre-fill behaviour to the main window. No-op unless at least one
 * of `auth.webLogin.user` / `auth.webLogin.passwordCommand` /
 * `auth.webLogin.verifyMethod` / `auth.webLogin.totpCommand` is set.
 * @param {Electron.BrowserWindow} window
 * @param {object} config startup config
 */
function attach(window, config) {
  const webLogin = config.auth?.webLogin || {};
  const user = (webLogin.user || "").trim();
  const command = (webLogin.passwordCommand || "").trim();
  const verifyMethod = (webLogin.verifyMethod || "").trim();
  const totpCommand = (webLogin.totpCommand || "").trim();
  if (!user && !command && !verifyMethod && !totpCommand) return;

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

  // Injects the observer and returns its structured result, or null when this
  // frame is not an actionable login page.
  async function observe(frame, gen) {
    const result = await frame
      .executeJavaScript(
        buildObserverScript(gen, user || null, verifyMethod || null, autoSubmit, !!totpCommand),
        true,
      )
      .catch((e) => ({ __err: e.message }));
    if (gen !== generation) return null; // navigated away; abandon this attempt
    // Skip hidden MSAL auth iframes (script failed) and frames mid-navigation
    // (no structured result) — neither is an actionable login page.
    if (!result || result.__err || typeof result.pwd !== "boolean") return null;
    return result;
  }

  // Runs the user's command and injects the matching fill script.
  //
  // The command can block for seconds (e.g. a pinentry prompt), during which
  // the frame may have navigated away — and a navigation to a non-login URL
  // does not bump `generation`. Re-check the frame's current URL right before
  // injecting so the secret is never typed into a different document. Both
  // steps go through here so neither can drift from that check.
  async function runAndFill(frame, gen, { command: cmd, build, normalise, label }) {
    const value = normalise(await runCommand(cmd));
    if (gen !== generation) return null;
    if (!value) {
      console.warn(`[SSO_PREFILL] ${label} command returned empty output`);
      return null;
    }

    let currentUrl = null;
    try {
      currentUrl = frame.url;
    } catch {
      return null; // frame gone
    }
    if (!isLoginUrl(currentUrl, extraHosts)) {
      console.debug("[SSO_PREFILL] Frame left the login page before fill; skipping");
      return null;
    }

    const fill = await frame.executeJavaScript(build(value, autoSubmit), true);
    console.info("[SSO_PREFILL] Credential filled", { step: label, result: fill });
    return fill;
  }

  const passwordStep = () => ({
    command,
    build: buildPasswordFillScript,
    normalise: firstLine,
    label: "password",
  });
  const totpStep = () => ({
    command: totpCommand,
    build: buildTotpFillScript,
    normalise: codeFrom,
    label: "totp",
  });

  async function handleFrame(frame, gen) {
    const origin = originOf(frame.url);
    try {
      const result = await observe(frame, gen);
      if (!result) {
        console.debug("[SSO_PREFILL] Frame not actionable", { frame: origin });
        return;
      }
      console.info("[SSO_PREFILL] Login page handled", {
        frame: origin,
        email: result.email,
        account: result.account,
        pwField: result.pwd,
        otcField: result.otc,
        verify: result.verify,
        next: result.next,
      });

      // Password wins if a page ever offers both fields, since the code step
      // always follows it.
      if (result.pwd && command) {
        const fill = await runAndFill(frame, gen, passwordStep());
        // AAD advances from the password step to the code step without reliably
        // firing a navigation event, and the observer above has already resolved
        // and disconnected. Re-arm it here rather than waiting for a navigation
        // that may never come. If one does come it bumps `generation` and this
        // pass abandons itself.
        if (fill === "filled-submitted" && totpCommand) {
          const next = await observe(frame, gen);
          if (next?.otc) await runAndFill(frame, gen, totpStep());
        }
        return;
      }

      if (result.otc && totpCommand) {
        await runAndFill(frame, gen, totpStep());
      }
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
    totpPrefill: !!totpCommand,
    verifyMethod: verifyMethod || null,
    autoSubmit,
    extraHosts: extraHosts.length,
  });
}

module.exports = { attach, isLoginUrl, buildObserverScript, buildPasswordFillScript, buildTotpFillScript, codeFrom };
