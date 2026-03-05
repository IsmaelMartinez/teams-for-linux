// Auth Diagnostics & Calendar Recovery Module
// Captures diagnostic data for auth expiry detection and calendar resilience spikes.
// When a blank calendar is detected (iframe loads multiple times), triggers a recovery reload.
// All output uses [AUTH_DIAG] prefix and is captured by electron-log when file logging is enabled.
// See: docs-site/docs/development/research/auth-expiry-calendar-resilience-research.md

const TOKEN_EXPIRY_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes
const AUTH_FAILURE_DEBOUNCE_MS = 30_000; // 30 seconds
const MULTI_LOAD_WINDOW_MS = 30_000; // Window to detect multiple iframe loads as a failure signal
const RECOVERY_DELAY_MS = 15_000; // Delay after detecting multi-load before reloading iframe

let _authFailureCount = 0;
let _lastAuthFailureTime = 0;

function init(_config) {
  // Delay startup check to let Teams initialize localStorage
  setTimeout(checkTokenExpiry, 10_000);
  setInterval(checkTokenExpiry, TOKEN_EXPIRY_CHECK_INTERVAL);

  interceptConsoleForAuthFailures();
  observeCalendarIframe();

  console.info('[AUTH_DIAG] Diagnostics module initialized');
}

function checkTokenExpiry() {
  try {
    let expiryTimestamp = null;

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.includes('expiry_AuthService')) {
        expiryTimestamp = Number.parseInt(localStorage.getItem(key), 10);
        break;
      }
    }

    if (expiryTimestamp === null || Number.isNaN(expiryTimestamp)) {
      console.debug('[AUTH_DIAG] Token expiry check: no valid expiry_AuthService found');
      return;
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    const expiresInMinutes = Math.round((expiryTimestamp - nowSeconds) / 60);
    const isExpired = expiryTimestamp <= nowSeconds;

    console.info('[AUTH_DIAG] Token expiry check', {
      expiresInMinutes,
      isExpired
    });
  } catch (error) {
    console.debug('[AUTH_DIAG] Token expiry check failed:', error.message);
  }
}

function interceptConsoleForAuthFailures() {
  const originalError = console.error;
  const originalWarn = console.warn;
  const authPattern = /InteractionRequired|AADSTS50058|AADSTS700024|login_required/;

  function checkMessage(args) {
    try {
      const message = args.map(String).join(' ');
      if (!authPattern.test(message)) return;

      _authFailureCount++;
      const now = Date.now();

      if (now - _lastAuthFailureTime > AUTH_FAILURE_DEBOUNCE_MS) {
        _lastAuthFailureTime = now;
        const codeMatch = message.match(/AADSTS\d+/);

        // Use originalError to avoid recursion
        originalError.call(console, '[AUTH_DIAG] Auth failure detected', {
          errorCode: codeMatch ? codeMatch[0] : 'InteractionRequired',
          totalCount: _authFailureCount
        });
      }
    } catch (error) {
      console.debug('[AUTH_DIAG] Error in console interception:', error.message);
    }
  }

  console.error = function (...args) {
    checkMessage(args);
    return originalError.apply(console, args);
  };

  console.warn = function (...args) {
    checkMessage(args);
    return originalWarn.apply(console, args);
  };
}

function observeCalendarIframe() {
  const calendarPattern = /outlook\.office\.com\/hosted\/calendar|outlook\.office365\.com\/hosted\/calendar/;
  let loadCount = 0;
  let firstLoadTime = 0;
  let hasRecovered = false;
  let isRecoveryReload = false;

  function onIframeFound(iframe) {
    const src = iframe.src || '';
    if (!calendarPattern.test(src)) return;

    console.info('[AUTH_DIAG] Calendar iframe detected');

    iframe.addEventListener('load', () => {
      if (isRecoveryReload) {
        isRecoveryReload = false;
        console.info('[AUTH_DIAG] Calendar iframe recovery reload completed');
        return;
      }

      loadCount++;
      const now = Date.now();
      console.info('[AUTH_DIAG] Calendar iframe loaded', { loadCount });

      if (loadCount === 1) {
        firstLoadTime = now;
      }

      // Two loads within the window means the first attempt failed and Teams retried.
      // Schedule a recovery reload after services have had time to settle.
      if (loadCount >= 2 && !hasRecovered && (now - firstLoadTime) < MULTI_LOAD_WINDOW_MS) {
        hasRecovered = true;
        console.info('[AUTH_DIAG] Calendar multi-load detected, scheduling recovery reload');
        setTimeout(() => {
          isRecoveryReload = true;
          console.info('[AUTH_DIAG] Reloading calendar iframe for recovery');
          iframe.src = iframe.src;
        }, RECOVERY_DELAY_MS);
      }
    });

    iframe.addEventListener('error', () => {
      console.error('[AUTH_DIAG] Calendar iframe load error');
    });
  }

  function scanNode(node) {
    if (node.nodeName === 'IFRAME') {
      onIframeFound(node);
    }
    if (node.querySelectorAll) {
      for (const iframe of node.querySelectorAll('iframe')) {
        onIframeFound(iframe);
      }
    }
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          scanNode(node);
        }
      }
    }
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
      }
    });
  }
}

module.exports = { init };
