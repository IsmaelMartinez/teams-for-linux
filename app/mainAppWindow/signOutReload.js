// Signing out ends on Microsoft's "You signed out of your account" page,
// which offers no way back to sign-in, so the only way on was to relaunch
// the app. Loads Teams again instead and returns true so the caller skips
// script injection into the page being left. Shared by the root window
// and every multi-account profile view, which have separate did-finish-load
// listeners.
function reloadIfSignedOut(webContents, url, userAgent) {
  const current = webContents.getURL();
  if (!current.startsWith("https://login.microsoftonline.com/")) return false;
  if (!/\/logout(session)?$/.test(new URL(current).pathname)) return false;
  console.info("[CONNECTION] Signed out, loading Teams again");
  webContents.loadURL(url, { userAgent }).catch(() => {});
  return true;
}

module.exports = { reloadIfSignedOut };
