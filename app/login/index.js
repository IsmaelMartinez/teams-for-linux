const { app, ipcMain, BrowserWindow } = require("electron");
const { execSync } = require("node:child_process");
const path = require("node:path");

// Per-`webContents` first-try tracking (ADR-020 § "Shared-state audit").
// A module-level boolean would lie once profile switching exists: profile
// B's first 401 would look like profile A's retry and trigger an app
// relaunch. Keying by `webContents` keeps each profile's challenge state
// isolated; the WeakMap drops entries when a view is destroyed.
const firstLoginTryByWebContents = new WeakMap();

// Single submitForm listener registered once at module load; dispatches to
// the currently-open login dialog via this pointer. Avoids per-dialog
// registration churn and the need for removeListener. See
// app/joinMeetingDialog/index.js for the same pattern.
let activeLoginHandler = null;
let handlersRegistered = false;

function ensureIpcHandlers() {
  if (handlersRegistered) return;
  handlersRegistered = true;
  // Handle form submission for SSO/authentication workflows
  ipcMain.on("submitForm", (_event, data) => {
    activeLoginHandler?.(data);
  });
}

exports.loginService = function loginService(parentWindow, callback) {
  ensureIpcHandlers();

  let win = new BrowserWindow({
    width: 363,
    height: 124,
    modal: true,
    frame: false,
    parent: parentWindow,

    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });
  win.once("ready-to-show", () => {
    win.show();
  });

  activeLoginHandler = (data) => {
    callback(data.username, data.password);
    win.close();
  };

  win.on("closed", () => {
    activeLoginHandler = null;
    win = null;
  });

  win.loadURL(`file://${__dirname}/login.html`);
};

/**
 * Whether an HTTP authentication challenge may be answered, with the
 * configured credential or the login dialog. Pure; exported for testing.
 *
 * A proxy challenge is always answered: the proxy sits in front of every
 * request. Any other challenge must come over HTTPS, so the credential never
 * travels in cleartext, and from one of `hosts` when that list is set. Any
 * request the page makes can raise a challenge (an image is enough), so
 * without the list every HTTPS server the page reaches is answered.
 *
 * @param {{ url?: string }} details - Electron's authenticationResponseDetails
 * @param {{ isProxy?: boolean, host?: string }} authInfo
 * @param {string[]} [hosts] - hostnames or parent domains from auth.basic.hosts
 * @returns {boolean}
 */
function isExpectedChallenge(details, authInfo, hosts = []) {
  if (authInfo?.isProxy) return true;
  let protocol;
  try {
    protocol = new URL(details?.url).protocol;
  } catch {
    return false;
  }
  if (protocol !== "https:") return false;
  if (hosts.length === 0) return true;
  const host = String(authInfo?.host ?? "").toLowerCase();
  return hosts.some((entry) => {
    const domain = String(entry).toLowerCase();
    return host === domain || host.endsWith("." + domain);
  });
}

exports.isExpectedChallenge = isExpectedChallenge;

exports.handleLoginDialogTry = function handleLoginDialogTry(
  window,
  ssoBasicAuthUser,
  ssoBasicAuthPasswordCommand,
  hosts = [],
) {
  window.webContents.on("login", (event, details, authInfo, callback) => {
    event.preventDefault();
    if (!isExpectedChallenge(details, authInfo, hosts)) {
      // Cancelled, and not counted as a login try: an unexpected challenge
      // must not use up the first try or trigger the relaunch below. The host
      // is not logged, since it can name a tenant's identity provider.
      console.warn("[SSO] Ignored an HTTP authentication challenge from an unexpected source");
      callback();
      return;
    }
    const wc = window.webContents;
    const isFirstLoginTry = !firstLoginTryByWebContents.has(wc);
    if (isFirstLoginTry) {
      firstLoginTryByWebContents.set(wc, true);
      if (ssoBasicAuthUser && ssoBasicAuthPasswordCommand) {
        console.debug('[SSO] Retrieving password using configured command');
        try {
          // Command comes from user's own config file - shell features (pipes, expansion) are expected
          const ssoPassword = execSync(ssoBasicAuthPasswordCommand).toString();
          callback(ssoBasicAuthUser, ssoPassword);
        } catch (error) {
          console.error(
            `[SSO] Failed to execute password command. Status Code: ${error.status}`,
          );
        }
      } else {
        console.debug("Using dialogue window.");
        this.loginService(window, callback);
      }
    } else {
      // Auth failed after we already closed the login browser window — relaunch.
      app.relaunch();
      app.exit(0);
    }
  });
};
