/**
 * ADR-020 Phase 2: per-profile `disableNotifications` and `muted`.
 *
 * Each Teams renderer enforces its own profile's flags in the preload's
 * Notification override. That is the only gate for the default `web` method,
 * where Chromium shows the toast without involving main. Renderers pull their
 * flags on load (resolved from the sender, never from an id the page names)
 * and receive a push whenever their profile is updated.
 */

/** @returns {{ disableNotifications: boolean, muted: boolean }} */
function flagsOf(profile) {
  return {
    disableNotifications: !!profile?.disableNotifications,
    muted: !!profile?.muted,
  };
}

/**
 * @param {object} deps
 * @param {Electron.IpcMain} deps.ipcMain
 * @param {() => Electron.WebContents[]} deps.getAllWebContents
 * @param {{ getProfileFor: Function, resolveProfileId: Function }} deps.viewManager
 * @param {{ on: Function }} deps.profilesManager
 */
function registerProfileNotificationFlags({
  ipcMain,
  getAllWebContents,
  viewManager,
  profilesManager,
}) {
  // A Teams renderer asks for its own profile's notification flags on load.
  ipcMain.handle("profile-get-notification-flags", (event) =>
    flagsOf(viewManager.getProfileFor(event))
  );

  // Runs inside ProfilesManager.update()'s emit: a throw here would surface
  // as a failed update to whoever changed the profile.
  profilesManager.on("update", (profile) => {
    if (!profile?.id) return;
    const flags = flagsOf(profile);
    for (const webContents of getAllWebContents()) {
      try {
        if (webContents.isDestroyed()) continue;
        if (viewManager.resolveProfileId(webContents) !== profile.id) continue;
        webContents.send("profile-notification-flags", flags);
      } catch (error) {
        console.warn("[ProfileNotifications] flag push failed", {
          message: error.message,
        });
      }
    }
  });
}

module.exports = { registerProfileNotificationFlags, flagsOf };
