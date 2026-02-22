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

      console.info("Enabling PipeWire for screen sharing...");
      if (app.commandLine.hasSwitch("enable-features")) {
        const features = app.commandLine.getSwitchValue("enable-features").split(",");
        if (!features.includes("WebRTCPipeWireCapturer")) {
          console.warn(
            "enable-features switch already set without WebRTCPipeWireCapturer. " +
            "Screen sharing on Wayland may not work correctly. " +
            "Please add WebRTCPipeWireCapturer to your enable-features list."
          );
        }
      } else {
        app.commandLine.appendSwitch("enable-features", "WebRTCPipeWireCapturer");
      }

      // Only use fake media stream UI for native Wayland mode.
      // Under XWayland (X11 forced mode), the normal X11 media permission handling
      // works correctly. Using fake-ui in XWayland can cause GPU context binding
      // issues with the video capture service when permissions are persisted.
      // Ref: https://github.com/IsmaelMartinez/teams-for-linux/issues/2169
      if (!isX11Forced) {
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
