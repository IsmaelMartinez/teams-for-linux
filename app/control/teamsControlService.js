const { sendKeyboardEventToWindow } = require("../globalShortcuts");
const { EventEmitter } = require("node:events");

const SHORTCUTS = {
  mute: "Ctrl+Shift+M",
  video: "Ctrl+Shift+O",
  handRaise: "Ctrl+Shift+K",
  leave: "Ctrl+Shift+H",
};

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
