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

    // Force native Wayland rendering (no X11/XWayland)
    app.commandLine.appendSwitch("ozone-platform", "wayland");

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
    this.#configureWayland(config);

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

  // Wayland display server configuration (native Wayland only — no X11/XWayland).
  // Handles three concerns:
  //   1. PipeWire — required for screen sharing on Wayland
  //   2. GPU — enabled by default; respects explicit user override (disableGpu: true) for blank window fallback
  //   3. Fake media UI — required for screen sharing on Wayland
  static #configureWayland(config) {
    // 1. PipeWire is always required for screen sharing on Wayland
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
      console.info("[Wayland] Enabling PipeWire for screen sharing");
      app.commandLine.appendSwitch("enable-features", "WebRTCPipeWireCapturer");
    }

    // 2. GPU: enabled by default for performance; user can override with disableGpu: true
    //    in their config file if they experience blank windows on their compositor.
    if (config.disableGpuExplicitlySet) {
      console.info(`[Wayland] Respecting user's disableGpu setting: ${config.disableGpu}`);
    }

    // 3. Required for screen sharing on Wayland.
    app.commandLine.appendSwitch("use-fake-ui-for-media-stream");
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
