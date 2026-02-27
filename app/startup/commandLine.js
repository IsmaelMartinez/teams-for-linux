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
    if (process.env.XDG_SESSION_TYPE === "wayland") {
      this.#configureWayland(config);
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

  // Wayland display server configuration.
  // Handles three independent concerns:
  //   1. PipeWire — always enabled for screen sharing
  //   2. GPU — auto-disabled unless user overrides or XWayland optimizations are on
  //   3. Fake media UI — applied unless XWayland optimizations skip it
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

    // Detect XWayland: ozone-platform=x11 forces X11 rendering on a Wayland session.
    // The runtime check is needed because the same config file is used for both
    // native Wayland and XWayland sessions.
    const isXWayland = app.commandLine.getSwitchValue("ozone-platform") === "x11";
    const xwaylandOptimizations = isXWayland && config.wayland?.xwaylandOptimizations;

    if (xwaylandOptimizations) {
      console.info("[Wayland] XWayland optimizations enabled (wayland.xwaylandOptimizations)");
    }

    // 2. GPU handling: respect explicit user setting, otherwise auto-configure.
    //    Native Wayland auto-disables GPU to prevent blank windows.
    //    XWayland with optimizations keeps GPU enabled for camera support (#2169).
    if (config.disableGpuExplicitlySet) {
      console.info(`[Wayland] Respecting user's disableGpu setting: ${config.disableGpu}`);
    } else if (xwaylandOptimizations) {
      console.info("[Wayland] XWayland mode: keeping GPU enabled");
    } else {
      console.info("[Wayland] Disabling GPU composition (default)");
      config.disableGpu = true;
    }

    // 3. Fake media UI: needed for screen sharing (#2217), but breaks camera
    //    under XWayland (#2169). Only skip when XWayland optimizations are on.
    if (!xwaylandOptimizations) {
      app.commandLine.appendSwitch("use-fake-ui-for-media-stream");
    }
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
