const { app } = require("electron");

class CommandLineManager {
  // Must be called before app.getPath('userData')
  static addSwitchesBeforeConfigLoad() {
    app.commandLine.appendSwitch("try-supported-channel-layouts");

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
      if (config.disableGpuExplicitlySet) {
        console.info(`Running under Wayland, respecting user's disableGpu setting: ${config.disableGpu}`);
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
      app.commandLine.appendSwitch("use-fake-ui-for-media-stream");
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
      config.auth?.serverWhitelist || "*"
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
