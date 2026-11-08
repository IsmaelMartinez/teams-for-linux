"use strict";

/**
 * ADR-020 Phase 2: clicking a notification switches to the profile that raised
 * it. Without this the click lands in that profile's view while it is hidden
 * behind the active one, so Teams opens the conversation where nobody can see
 * it.
 *
 * @param {object} deps
 * @param {{ resolveProfileId: (webContents: object) => string|null }} deps.viewManager
 * @param {{ getActive: () => {id:string}|null, switch: (id: string) => object }} deps.profilesManager
 * @returns {(webContents: object) => boolean} activates the sender's profile;
 *   true when a switch happened. Never throws: it runs inside notification
 *   and IPC callbacks, where a throw would skip the window show that follows.
 */
function createProfileActivator({ viewManager, profilesManager }) {
  return (webContents) => {
    try {
      if (!webContents || webContents.isDestroyed()) return false;
      const profileId = viewManager.resolveProfileId(webContents);
      if (!profileId || profilesManager.getActive()?.id === profileId) {
        return false;
      }
      profilesManager.switch(profileId);
      return true;
    } catch (error) {
      console.warn("[ProfileActivation] switch on notification click failed", {
        message: error.message,
      });
      return false;
    }
  };
}

/**
 * The `web` notification method shows a Chromium toast whose click never
 * reaches main, so the profile's preload reports it. The profile is resolved
 * from the sender, so a page can only bring its own profile forward.
 *
 * @param {object} deps
 * @param {Electron.IpcMain} deps.ipcMain
 * @param {(webContents: object) => boolean} deps.activate
 */
function registerWebNotificationClick({ ipcMain, activate }) {
  // A web notification raised by this renderer was clicked by the user.
  ipcMain.on("notification-web-clicked", (event) => {
    activate(event.sender);
  });
}

module.exports = { createProfileActivator, registerWebNotificationClick };
