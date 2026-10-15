const DEFAULT_BUS_NAME = "com.github.IsmaelMartinez.teams_for_linux";
const OBJECT_PATH = "/com/github/IsmaelMartinez/teams_for_linux";
const INTERFACE_NAME = `${DEFAULT_BUS_NAME}.Control`;
const DO_NOT_QUEUE = 0x4;

const INTERFACE = {
  name: INTERFACE_NAME,
  methods: {
    AcceptAudio: ["", "b"],
    AcceptVideo: ["", "b"],
    DeclineCall: ["", "b"],
    ToggleMute: ["", "b"],
    Mute: ["b", "b"],
    Unmute: ["b", "b"],
    ToggleVideo: ["", "b"],
    ToggleHandRaise: ["", "b"],
    LeaveCall: ["", "b"],
    GetState: ["", "s"],
  },
  signals: {
    StateChanged: ["s", "stateJson"],
    PresenceChanged: ["si", "status", "statusCode"],
    InCallChanged: ["b", "inCall"],
    IncomingCallChanged: ["b", "incomingCall"],
    IncomingCallCallerChanged: ["s", "callerJson"],
    CameraChanged: ["b", "enabled"],
    MicrophoneChanged: ["s", "state"],
    MicrophoneControlChanged: ["s", "state"],
    ScreenSharingChanged: ["b", "sharing"],
    MeetingStartedChanged: ["b", "started"],
  },
  // dbus-native 0.7.9 declares every exported property read/write and cannot
  // safely enforce read-only access. State is exposed by GetState + signals,
  // not writable properties which could falsify microphone/call state.
  properties: {},
};

const STATE_SIGNALS = [
  ["inCall", "InCallChanged"],
  ["incomingCall", "IncomingCallChanged"],
  ["cameraEnabled", "CameraChanged"],
  ["microphoneState", "MicrophoneChanged"],
  ["microphoneControlState", "MicrophoneControlChanged"],
  ["screenSharing", "ScreenSharingChanged"],
  ["meetingStarted", "MeetingStartedChanged"],
];

class DBusControlService {
  constructor(control, {
    dbus,
    env = process.env,
    platform = process.platform,
    logger = console,
    startupTimeout = 5000,
  } = {}) {
    this.control = control;
    this.dbus = dbus;
    this.busName = env.FLATPAK_ID || DEFAULT_BUS_NAME;
    this.platform = platform;
    this.logger = logger;
    this.startupTimeout = startupTimeout;
    this.bus = null;
    this.ownsName = false;
    this.active = false;
    this.timer = null;
    this.lastState = null;
    this.stateListener = null;
  }

  start() {
    if (this.platform !== "linux" || this.bus) return;
    try {
      // Lazy loading keeps this optional Linux feature out of other platforms.
      const dbus = this.dbus || require("@homebridge/dbus-native");
      const bus = dbus.sessionBus();
      this.bus = bus;
      bus.connection.on("error", () => {
        if (this.bus !== bus) return;
        this.logger.warn("[DBUS_CONTROL] Session bus connection failed");
        this.stop();
      });
      bus.connection.on("end", () => {
        if (this.bus !== bus) return;
        this.logger.warn("[DBUS_CONTROL] Session bus connection ended");
        this.stop();
      });
      this.timer = setTimeout(() => {
        if (this.bus !== bus) return;
        this.logger.warn("[DBUS_CONTROL] Bus name request timed out");
        this.stop();
      }, this.startupTimeout);
      this.timer.unref();
      bus.requestName(this.busName, DO_NOT_QUEUE, (error, result) => {
        // A late reply must never reactivate a stopped or replaced service.
        if (this.bus !== bus) return;
        clearTimeout(this.timer);
        this.timer = null;
        if (error || (result !== 1 && result !== 4)) {
          this.logger.warn("[DBUS_CONTROL] Failed to acquire bus name");
          this.stop();
          return;
        }
        this.ownsName = true;
        try {
          // dbus-native looks up methods directly on this object. Do not expose
          // Object.prototype members as accidental remote method handlers.
          const implementation = Object.freeze(Object.assign(Object.create(null), {
            AcceptAudio: () => this.dispatch(bus, "acceptAudio"),
            AcceptVideo: () => this.dispatch(bus, "acceptVideo"),
            DeclineCall: () => this.dispatch(bus, "declineCall"),
            ToggleMute: () => this.dispatch(bus, "toggleMute"),
            Mute: (force) => typeof force === "boolean" && this.dispatch(bus, "mute", force),
            Unmute: (force) => typeof force === "boolean" && this.dispatch(bus, "unmute", force),
            ToggleVideo: () => this.dispatch(bus, "toggleVideo"),
            ToggleHandRaise: () => this.dispatch(bus, "toggleHandRaise"),
            LeaveCall: () => this.dispatch(bus, "leaveCall"),
            GetState: () => this.getState(bus),
          }));
          bus.exportInterface(implementation, OBJECT_PATH, INTERFACE);
          this.active = true;
          this.subscribe(bus);
          this.logger.info("[DBUS_CONTROL] Session bus service started");
        } catch {
          this.logger.warn("[DBUS_CONTROL] Failed to export control interface");
          this.stop();
        }
      });
    } catch {
      this.logger.warn("[DBUS_CONTROL] Unable to start session bus service");
      this.stop();
    }
  }

  dispatch(bus, method, ...args) {
    if (this.bus !== bus || !this.active) return false;
    try {
      return this.control[method](...args) === true;
    } catch {
      // Do not log caller information or arbitrary accelerator input.
      this.logger.warn("[DBUS_CONTROL] Control request failed");
      return false;
    }
  }

  getState(bus) {
    try {
      if (this.bus !== bus || !this.active) throw new Error("Service stopped");
      return JSON.stringify(this.control.getState());
    } catch {
      return JSON.stringify({ error: "State unavailable" });
    }
  }

  subscribe(bus) {
    if (typeof this.control.on !== "function") return;
    this.stateListener = (state) => this.publishState(bus, state);
    this.control.on("state-changed", this.stateListener);
  }

  sendSignal(bus, name, args) {
    if (this.bus !== bus || !this.active) return;
    try {
      bus.sendSignal(OBJECT_PATH, INTERFACE_NAME, name, INTERFACE.signals[name][0], args);
    } catch {
      this.logger.warn("[DBUS_CONTROL] Unable to publish state signal");
    }
  }

  publishState(bus, state) {
    if (this.bus !== bus || !this.active) return;
    try {
      const previous = this.lastState;
      // Serialize first so a malformed/cyclic snapshot cannot partially update
      // our baseline. No caller data is ever copied into logs.
      const json = JSON.stringify(state);
      const snapshot = JSON.parse(json);
      this.sendSignal(bus, "StateChanged", [json]);
      if (!previous || previous.presenceStatus !== snapshot.presenceStatus ||
          previous.presenceStatusCode !== snapshot.presenceStatusCode) {
        this.sendSignal(bus, "PresenceChanged", [snapshot.presenceStatus, snapshot.presenceStatusCode]);
      }
      for (const [key, signal] of STATE_SIGNALS) {
        if (!previous || previous[key] !== snapshot[key]) this.sendSignal(bus, signal, [snapshot[key]]);
      }
      if (!previous || JSON.stringify(previous.incomingCallCaller) !== JSON.stringify(snapshot.incomingCallCaller)) {
        this.sendSignal(bus, "IncomingCallCallerChanged", [JSON.stringify(snapshot.incomingCallCaller ?? null)]);
      }
      this.lastState = snapshot;
    } catch {
      this.logger.warn("[DBUS_CONTROL] Unable to encode state snapshot");
    }
  }

  stop() {
    const bus = this.bus;
    const ownsName = this.ownsName;
    this.bus = null;
    this.ownsName = false;
    this.active = false;
    this.lastState = null;
    // Remove only this adapter's subscribers, even when restarting after error.
    try {
      if (this.stateListener) this.control.off("state-changed", this.stateListener);
    } catch {
      this.logger.warn("[DBUS_CONTROL] Failed to remove control listeners");
    }
    this.stateListener = null;
    clearTimeout(this.timer);
    this.timer = null;
    if (!bus) return;
    try {
      if (ownsName) bus.releaseName(this.busName, () => {});
    } catch {
      this.logger.warn("[DBUS_CONTROL] Failed to release bus name");
    }
    try {
      // 0.7.9 has no unexportInterface. This connection belongs exclusively to
      // this adapter; ending it removes exports without affecting other modules.
      // Keep its error handler attached to absorb late socket errors.
      bus.connection.end();
    } catch {
      this.logger.warn("[DBUS_CONTROL] Failed to close session bus connection");
    }
  }
}

module.exports = DBusControlService;
