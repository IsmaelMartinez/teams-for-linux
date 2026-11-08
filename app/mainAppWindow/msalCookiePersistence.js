// Some localStorage tokens get encrypted by a Session cookie 'msal.cache.encryption'.
// Electron drops this cookie on process exits, so the encrypted tokens can't be decrypted anymore
// This forces a fresh login on every start (#2681)
// Set an expiration date for the cookie to promote it from a session cookie, so it survives restarts
// Every session that hosts a Teams account needs this: the root window session
// and each multi-account profile partition (#3183).
const MSAL_ENCRYPTION_COOKIE = 'msal.cache.encryption';

// Sessions that already have the listener, so a session reachable through more
// than one path (the root window is also the legacy profile) is wired once.
const wiredSessions = new WeakSet();

function keepMsalEncryptionCookiePersistent(windowSession, config) {
  // undefined counts as enabled: a partial auth block in config.json replaces
  // the defaults wholesale and must not silently disable this fix (#2722)
  if (config?.auth?.keepMsalCacheEncryptionCookie?.enabled === false) return;
  if (wiredSessions.has(windowSession)) return;
  wiredSessions.add(windowSession);
  windowSession.cookies.on('changed', (_event, cookie, _cause, removed) => {
    if (removed || cookie.name !== MSAL_ENCRYPTION_COOKIE || !cookie.session) {
      return;
    }

    const bareDomain = (cookie.domain || '').replace(/^\./, '');
    if (!bareDomain) return;
    const url = `${cookie.secure ? 'https' : 'http'}://${bareDomain}${cookie.path || '/'}`;

    // Get the days to keep the cookie from the config.
    // If no value is set or the value is outside of 1 and 400 or not a number set it to 400
    let keepMsalEncryptionDays = config?.auth?.keepMsalCacheEncryptionCookie?.days ?? 400;
    if(keepMsalEncryptionDays > 400 || keepMsalEncryptionDays < 1 || Number.isNaN(keepMsalEncryptionDays)) keepMsalEncryptionDays = 400;

    // Preserve the original attributes exactly, only add an expiry.
    const details = {
      url,
      name: cookie.name,
      value: cookie.value,
      path: cookie.path,
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
      sameSite: cookie.sameSite,
      // Keep the Cookie for 400 days
      expirationDate: Math.floor(Date.now() / 1000) + (keepMsalEncryptionDays * 24 * 60 * 60),
    };
    if ((cookie.domain || '').startsWith('.')) {
      details.domain = cookie.domain;
    }

    windowSession.cookies.set(details)
      .then(() => console.debug('[AUTH_RECOVERY] Promoted msal.cache.encryption cookie to persistent (survives restart)'))
      .catch((err) => console.warn('[AUTH_RECOVERY] Failed to persist msal.cache.encryption cookie:', err.message));
  });
}

module.exports = { keepMsalEncryptionCookiePersistent };
