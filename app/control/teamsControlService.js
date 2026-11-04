const { sendKeyboardEventToWindow } = require("../globalShortcuts");
const { EventEmitter } = require("node:events");

const SHORTCUTS = {
  mute: "Ctrl+Shift+M",
  video: "Ctrl+Shift+O",
  handRaise: "Ctrl+Shift+K",
  leave: "Ctrl+Shift+H",
};

// These names deliberately match the stable status names exposed in the
// observed D-Bus state.  The Teams presence service uses PascalCase values.
// "Offline" also requires the OffWork activity, matching the Teams web client.
const PRESENCE_AVAILABILITY = new Map([
  ["available", { availability: "Available" }],
  ["busy", { availability: "Busy" }],
  ["do_not_disturb", { availability: "DoNotDisturb" }],
  ["away", { availability: "Away" }],
  ["be_right_back", { availability: "BeRightBack" }],
  ["offline", { availability: "Offline", activity: "OffWork" }],
]);
const PRESENCE_RESOURCE = "https://presence.teams.microsoft.com";
const FORCE_AVAILABILITY_URL = `${PRESENCE_RESOURCE}/v1/me/forceavailability/`;

class TeamsControlService extends EventEmitter {
  constructor({ getShortcutWebContents, performIncomingCallAction, stateService = null }) {
    super();
    this.getShortcutWebContents = getShortcutWebContents;
    this.performIncomingCallAction = performIncomingCallAction;
    this.stateService = stateService;
    this.onStateChanged = () => this.emit("state-changed", this.getState());
    this.stateService?.on("state-changed", this.onStateChanged);
  }

  getState() {
    return this.stateService?.getState() ?? {
      presenceStatus: "unknown", presenceStatusCode: -1, inCall: false, incomingCall: false,
      incomingCallCaller: null, cameraEnabled: false, microphoneState: "unknown",
      microphoneControlState: "unknown", screenSharing: false, meetingStarted: false,
    };
  }

  refreshState() {
    const snapshot = this.getState();
    this.emit("state-changed", snapshot);
    return snapshot;
  }

  dispose() {
    this.stateService?.removeListener("state-changed", this.onStateChanged);
  }

  acceptAudio() {
    return this.#callAction("ACCEPT_AUDIO");
  }

  acceptVideo() {
    return this.#callAction("ACCEPT_VIDEO");
  }

  declineCall() {
    return this.#callAction("DECLINE");
  }

  toggleMute() {
    return this.#sendShortcut(SHORTCUTS.mute);
  }

  mute(force = false) {
    return this.#setMute("muted", force);
  }

  unmute(force = false) {
    return this.#setMute("unmuted", force);
  }

  #setMute(desired, force) {
    if (typeof force !== "boolean") return false;
    const state = this.getState()?.microphoneControlState ?? "unknown";
    if (state === desired) return false;
    if (state !== "muted" && state !== "unmuted" && !force) return false;
    return this.toggleMute();
  }

  toggleVideo() {
    return this.#sendShortcut(SHORTCUTS.video);
  }

  toggleHandRaise() {
    return this.#sendShortcut(SHORTCUTS.handRaise);
  }

  leaveCall() {
    return this.#sendShortcut(SHORTCUTS.leave);
  }

  /**
   * Ask the selected Teams renderer to change its own presence. The renderer
   * already has the authentication service that Teams uses for this endpoint;
   * deliberately do not return or persist its bearer token in the main process.
   *
   * @param {string} status Stable D-Bus status name, e.g. "do_not_disturb".
   * @returns {boolean} Whether the request was dispatched to a live renderer.
   */
  setStatus(status) {
    if (typeof status !== "string") return false;
    const presence = PRESENCE_AVAILABILITY.get(status);
    if (!presence) return false;

    try {
      const webContents = this.getShortcutWebContents();
      if (!webContents || webContents.isDestroyed() ||
          typeof webContents.executeJavaScript !== "function") return false;
      const script = `
        (async () => {
          const handler = window.teamsForLinuxReactHandler;
          if (!handler || typeof handler.acquireToken !== "function") return false;
          const tokenResult = await handler.acquireToken(${JSON.stringify(PRESENCE_RESOURCE)});
          if (!tokenResult?.success || typeof tokenResult.token !== "string") return false;
          const response = await fetch(${JSON.stringify(FORCE_AVAILABILITY_URL)}, {
            method: "PUT",
            headers: {
              Authorization: "Bearer " + tokenResult.token,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(${JSON.stringify(presence)}),
          });
          return response.ok;
        })()
      `;
      // D-Bus methods are synchronous. Returning true means the authenticated
      // request was accepted for dispatch, just as shortcut methods do; Teams'
      // eventual response is intentionally not exposed to another bus client.
      Promise.resolve(webContents.executeJavaScript(script)).catch(() => {});
      return true;
    } catch {
      return false;
    }
  }

  #callAction(action) {
    try {
      const result = this.performIncomingCallAction(action);
      if (result && typeof result.then === "function") {
        Promise.resolve(result).catch(() => {});
        return false;
      }
      return result === true;
    } catch {
      return false;
    }
  }

  #sendShortcut(accelerator) {
    try {
      const webContents = this.getShortcutWebContents();
      if (!webContents || webContents.isDestroyed()) return false;
      return sendKeyboardEventToWindow({ webContents }, accelerator);
    } catch {
      return false;
    }
  }
}

module.exports = TeamsControlService;
