const { app } = require("electron");

class CommandLineManager {
  // Must be called before app.getPath('userData')
  static addSwitchesBeforeConfigLoad() {
    app.commandLine.appendSwitch("try-supported-channel-layouts");

    // Allow audio playback without requiring a prior user gesture.
    // Notification sounds fire in the background (no user gesture) so without
    // this switch Chromium's autoplay policy suspends the AudioContext after
    // the first play and rejects subsequent audio on all renderer paths.
    app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

    if (app.commandLine.hasSwitch("disable-features")) {
      const disabledFeatures = app.commandLine.getSwitchValue("disable-features").split(",");
      if (!disabledFeatures.includes("HardwareMediaKeyHandling")) {
        console.warn(
          "disable-features switch already set without HardwareMediaKeyHandling. " +
          "Teams media controls may conflict with system media key handling."
        );
      }
    } else {
      app.commandLine.appendSwitch("disable-features", "HardwareMediaKeyHandling");
    }
  }

  static addSwitchesAfterConfigLoad(config) {
    // Wayland-specific configuration
    if (process.env.XDG_SESSION_TYPE === "wayland") {
      // Check if X11 mode is forced via --ozone-platform=x11 (set by executableArgs in package.json).
      // When forced, the app runs through XWayland rather than native Wayland.
      const ozonePlatform = app.commandLine.getSwitchValue("ozone-platform");
      const isX11Forced = ozonePlatform === "x11";

      if (config.disableGpuExplicitlySet) {
        console.info(`Running under Wayland, respecting user's disableGpu setting: ${config.disableGpu}`);
      } else if (isX11Forced) {
        // GPU works correctly under XWayland and must NOT be disabled.
        // The original GPU auto-disable was a workaround for native Wayland
        // rendering issues (blank windows, crashes). Under XWayland, disabling
        // GPU breaks the video capture service's GPU context binding, which
        // prevents camera from working in meetings.
        // Ref: https://github.com/IsmaelMartinez/teams-for-linux/issues/2169
        console.info("Running under Wayland with forced X11 mode (XWayland), keeping GPU enabled");
      } else {
        console.info("Running under Wayland, disabling GPU composition (default behavior)...");
        config.disableGpu = true;
      }

      if (isX11Forced) {
        // Chromium's DesktopCapturer::IsRunningUnderWayland() selects the PipeWire
        // capture backend by checking XDG_SESSION_TYPE and WAYLAND_DISPLAY, with no
        // coupling to --ozone-platform. Under XWayland both env vars remain set, so
        // PipeWire is selected even though rendering is X11. PipeWire requires
        // xdg-desktop-portal authorization before getSources() returns any sources,
        // but without --use-fake-ui-for-media-stream that auth never happens and
        // getSources() returns empty (issue #2217).
        //
        // Explicitly disabling WebRTCPipeWireCapturer forces the X11 screen capture
        // path, bypassing the portal auth requirement entirely. Camera and mic
        // permissions are unaffected because this flag only controls the screen
        // capture backend, not the getUserMedia() permission path (issue #2169).
        // Ref: ADR-016, https://github.com/IsmaelMartinez/teams-for-linux/issues/2217
        console.info("Running under XWayland: disabling PipeWire capturer to force X11 screen capture path");
        const existingDisabled = app.commandLine.getSwitchValue("disable-features");
        const disabledFeatures = existingDisabled ? existingDisabled.split(",") : [];
        if (!disabledFeatures.includes("WebRTCPipeWireCapturer")) {
          disabledFeatures.push("WebRTCPipeWireCapturer");
          app.commandLine.appendSwitch("disable-features", disabledFeatures.join(","));
        }
      } else {
        // Native Wayland: auto-approve all media device requests.
        // WebRTCPipeWireCapturer is the default since Chromium 110 — no explicit enable needed.
        // Ref: https://github.com/IsmaelMartinez/teams-for-linux/issues/2169
        app.commandLine.appendSwitch("use-fake-ui-for-media-stream");
      }
    }

    // Proxy configuration
    if (config.proxyServer) {
      app.commandLine.appendSwitch("proxy-server", config.proxyServer);
    }

    // Custom WM_CLASS for Linux window managers
    if (config.class) {
      console.info("Setting WM_CLASS property to custom value " + config.class);
      app.setName(config.class);
    }

    // Authentication server whitelist for SSO
    app.commandLine.appendSwitch(
      "auth-server-whitelist",
      config.authServerWhitelist
    );

    // GPU acceleration settings
    if (config.disableGpu) {
      console.info("Disabling GPU support...");
      app.commandLine.appendSwitch("disable-gpu");
      app.commandLine.appendSwitch("disable-gpu-compositing");
      app.commandLine.appendSwitch("disable-software-rasterizer");
      app.disableHardwareAcceleration();
    }

    this.addElectronCLIFlags(config);
  }

  static addElectronCLIFlags(config) {
    if (Array.isArray(config.electronCLIFlags)) {
      for (const flag of config.electronCLIFlags) {
        if (typeof flag === "string") {
          console.debug(`Adding electron CLI flag '${flag}'`);
          app.commandLine.appendSwitch(flag);
        } else if (Array.isArray(flag) && typeof flag[0] === "string") {
          const hasValidValue = flag[1] !== undefined &&
                                 typeof flag[1] !== "object" &&
                                 typeof flag[1] !== "function";
          if (hasValidValue) {
            console.debug(
              `Adding electron CLI flag '${flag[0]}' with value '${flag[1]}'`
            );
            app.commandLine.appendSwitch(flag[0], flag[1]);
          } else {
            console.debug(`Adding electron CLI flag '${flag[0]}'`);
            app.commandLine.appendSwitch(flag[0]);
          }
        }
      }
    }
  }
}

module.exports = CommandLineManager;
