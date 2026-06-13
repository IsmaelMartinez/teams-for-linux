// Configuration option definitions for Teams for Linux.
//
// This is the single source of truth for the wrapper's config schema. It is
// consumed at runtime by the yargs parser in ./index.js, and by the docs/schema
// generator in scripts/generateConfigDocs.js. Each entry carries a `default`,
// a `describe` string, and a `type`. Keep it a plain data module with no
// imports so the generator can require it outside Electron.
//
// Two additional metadata dimensions are carried on each entry:
//
// - `applyMode`: how a change to the option takes effect. "live" means the
//   change is applied immediately at runtime via the config-changed delta
//   (see app/menus/index.js); "restart" means the value is read at boot and
//   requires an app relaunch. New options default to "restart" — promote to
//   "live" only when a verified runtime re-read path exists.
// - `fields` (object-typed options only): nested-leaf metadata. A flat map
//   from the leaf's dot-path relative to the option (e.g. "thumbnail.enabled")
//   to `{ type, describe }` (plus `choices` where the leaf has a fixed value
//   set). Leaf defaults are not duplicated here — the generator derives them
//   by resolving each dot-path against the option's `default` object.
//
// After changing an option here, run `npm run generate-config-docs` and commit
// the regenerated docs-site/docs/configuration-generated.md and
// docs-site/static/config-schema.json (CI enforces they stay in sync).

// defaults.js is a pure data module (no Electron imports), so requiring it here
// keeps options.js loadable by the generator outside Electron.
const defaults = require("./defaults");

module.exports = {
      appActiveCheckInterval: {
        default: 2,
        describe:
          "A numeric value in seconds as poll interval to check if the system is active from being idle",
        type: "number",
        applyMode: "restart",
      },
      screenSharing: {
        default: {
          thumbnail: {
            enabled: true,
            alwaysOnTop: true,
          },
          lockInhibitionMethod: "Electron",
        },
        describe:
          "Screen sharing configuration. thumbnail: controls the preview window shown during active sharing. lockInhibitionMethod: screen lock inhibition method (Electron/WakeLockSentinel).",
        type: "object",
        fields: {
          "thumbnail.enabled": {
            type: "boolean",
            describe:
              "Automatically show the preview thumbnail window when screen sharing starts.",
          },
          "thumbnail.alwaysOnTop": {
            type: "boolean",
            describe: "Keep the screen sharing thumbnail window always on top.",
          },
          "lockInhibitionMethod": {
            type: "string",
            describe: "Screen lock inhibition method used while sharing.",
            choices: ["Electron", "WakeLockSentinel"],
          },
        },
        applyMode: "restart",
      },
      appIcon: {
        default: "",
        describe: "Teams app icon to show in the tray",
        type: "string",
        applyMode: "restart",
      },
      appIconType: {
        default: "default",
        describe: "Type of tray icon to be used",
        type: "string",
        choices: ["default", "light", "dark"],
        applyMode: "restart",
      },
      appIdleTimeout: {
        default: 300,
        describe:
          "A numeric value in seconds as duration before app considers the system as idle",
        type: "number",
        applyMode: "restart",
      },
      appIdleTimeoutCheckInterval: {
        default: 10,
        describe:
          "A numeric value in seconds as poll interval to check if the appIdleTimeout is reached",
        type: "number",
        applyMode: "restart",
      },
      appTitle: {
        default: "Microsoft Teams",
        describe: "A text to be suffixed with page title",
        type: "string",
        applyMode: "restart",
      },
      alwaysOnTop: {
        default: true,
        describe: "Keep the pop-out window always on top of other windows.",
        type: "boolean",
        applyMode: "restart",
      },
      authServerWhitelist: {
        default: "*",
        describe: "Set auth-server-whitelist value",
        type: "string",
        applyMode: "restart",
      },
      awayOnSystemIdle: {
        default: false,
        describe: "Sets the user status as away when system goes idle",
        type: "boolean",
        applyMode: "restart",
      },
      idleDetection: {
        default: {
          forceState: false,
          stateFile: "/tmp/teams-for-linux-idle-state-$USER",
        },
        describe: "Idle detection configuration. forceState: enables state file-based idle control (workaround for Wayland/Hyprland). stateFile: path to state file with $USER expansion support.",
        type: "object",
        fields: {
          "forceState": {
            type: "boolean",
            describe:
              "Enable state file-based idle state control (workaround for Wayland/Hyprland).",
          },
          "stateFile": {
            type: "string",
            describe: "Path to the idle state file (supports $USER expansion).",
          },
        },
        applyMode: "restart",
      },
      chromeUserAgent: {
        default: `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`,
        describe: "Google Chrome User Agent",
        type: "string",
        applyMode: "restart",
      },
      customBGServiceBaseUrl: {
        default: "http://localhost",
        describe:
          "Base URL of the server which provides custom background images",
        type: "string",
        applyMode: "restart",
      },
      customBGServiceConfigFetchInterval: {
        default: 0,
        describe:
          "A numeric value in seconds as poll interval to download background service config download",
        type: "number",
        applyMode: "restart",
      },
      customCACertsFingerprints: {
        default: [],
        describe:
          "Array of custom CA Certs Fingerprints to allow SSL unrecognized signer or self signed certificate",
        type: "array",
        applyMode: "restart",
      },
      customCSSName: {
        default: "",
        describe:
          'custom CSS name for the packaged available css files. Currently those are: "compactDark", "compactLight", "tweaks", "condensedDark" and "condensedLight" ',
        type: "string",
        applyMode: "restart",
      },
      customCSSLocation: {
        default: "",
        describe: "custom CSS styles file location",
        type: "string",
        applyMode: "restart",
      },
      customStickers: {
        default: {
          enabled: false,
          folder: "",
          formats: ["png", "jpg", "jpeg", "gif", "webp"],
          urlImport: {
            enabled: true,
            allowedContentTypes: [
              "image/png",
              "image/jpeg",
              "image/gif",
              "image/webp",
            ],
            maxBytes: 5242880,
          },
        },
        describe:
          "Custom stickers feature. enabled: master flag (off by default). folder: absolute path to the sticker folder; empty string uses <userData>/stickers/ (auto-created). formats: file extensions to scan (lowercase, no leading dot). The scanner reads the configured folder plus one level of subdirectories so packs imported under <folder>/<pack>/ are visible. urlImport: HTTPS URL import (drop or paste a URL onto the sticker panel); allowedContentTypes restricts what the wrapper will save; maxBytes caps individual file size.",
        type: "object",
        fields: {
          "enabled": {
            type: "boolean",
            describe: "Master flag for the custom stickers feature.",
          },
          "folder": {
            type: "string",
            describe:
              "Absolute path to the sticker folder; empty string uses <userData>/stickers/, created on first run if missing.",
          },
          "formats": {
            type: "array",
            describe:
              "File extensions the scanner accepts (lowercase, no leading dot); the scanner reads the configured folder plus one level of subdirectories.",
          },
          "urlImport.enabled": {
            type: "boolean",
            describe:
              "Allow importing stickers from HTTPS URLs via the panel header input or by dropping a URL on the panel.",
          },
          "urlImport.allowedContentTypes": {
            type: "array",
            describe:
              "Response content-types the wrapper will accept and save when importing from a URL.",
          },
          "urlImport.maxBytes": {
            type: "number",
            describe:
              "Per-file size cap in bytes for URL imports; larger responses are rejected.",
          },
        },
        applyMode: "restart",
      },
      disableTimestampOnCopy: {
        default: false,
        describe:
          "Controls whether timestamps are included when copying messages in chats",
        type: "boolean",
        applyMode: "restart",
      },
      class: {
        default: null,
        describe: "A custom value for the WM_CLASS property",
        type: "string",
        applyMode: "restart",
      },
      cacheManagement: {
        default: {
          enabled: false,
          maxCacheSizeMB: 600,
          cacheCheckIntervalMs: 3600000,
        },
        describe:
          "Cache management configuration to prevent daily logout issues",
        type: "object",
        fields: {
          "enabled": {
            type: "boolean",
            describe:
              "Enable automatic cache management to prevent daily logout issues.",
          },
          "maxCacheSizeMB": {
            type: "number",
            describe: "Maximum cache size in MB before cleanup runs.",
          },
          "cacheCheckIntervalMs": {
            type: "number",
            describe: "How often the cache size is checked, in milliseconds.",
          },
        },
        applyMode: "restart",
      },
      clearStorageData: {
        default: null,
        describe:
          "Flag to clear storage data. Expects an object of the type https://www.electronjs.org/docs/latest/api/session#sesclearstoragedataoptions",
        type: "boolean",
        applyMode: "restart",
      },
      clientCertPath: {
        default: "",
        describe:
          "Custom Client Certs for corporate authentication (certificate must be in pkcs12 format)",
        type: "string",
        applyMode: "restart",
      },
      clientCertPassword: {
        default: "",
        describe:
          "Custom Client Certs password for corporate authentication (certificate must be in pkcs12 format)",
        type: "string",
        applyMode: "restart",
      },
      closeAppOnCross: {
        default: false,
        describe: "Close the app when clicking the close (X) cross",
        type: "boolean",
        applyMode: "restart",
      },
      defaultNotificationUrgency: {
        default: "normal",
        describe: "Default urgency for new notifications (low/normal/critical)",
        type: "string",
        choices: ["low", "normal", "critical"],
        applyMode: "live",
      },
      defaultURLHandler: {
        default: "",
        describe: "Default application to be used to open the HTTP URLs",
        type: "string",
        applyMode: "restart",
      },
      disableGpu: {
        default: false,
        describe:
          "A flag to disable GPU and hardware acceleration (can be useful if the window remains blank)",
        type: "boolean",
        applyMode: "restart",
      },
      download: {
        default: {
          enabled: false,
          notifyOnDownloadComplete: true,
          showProgressBar: true,
          showTitlePrefix: true,
        },
        describe:
          "Download manager configuration. enabled: master switch for the entire feature, defaults to false while the feature is in early development — set true to opt in. notifyOnDownloadComplete: show a system notification when a file download finishes (click opens the containing folder). showProgressBar: drive the taskbar progress bar and KDE JobView / Unity LauncherEntry signals while downloads are in flight. showTitlePrefix: also prefix the window title with [N%] as a portable fallback for environments where the other progress signals aren't rendered; set to false to keep the title untouched when KDE / Ubuntu already show progress elsewhere. All sub-flags only take effect when enabled is true.",
        type: "object",
        fields: {
          "enabled": {
            type: "boolean",
            describe:
              "Master switch for the download feedback feature; sub-flags only take effect when this is true.",
          },
          "notifyOnDownloadComplete": {
            type: "boolean",
            describe:
              "Show a system notification when a file download finishes (click opens the containing folder).",
          },
          "showProgressBar": {
            type: "boolean",
            describe:
              "Drive the taskbar progress bar and KDE JobView / Unity LauncherEntry signals while downloads are in flight.",
          },
          "showTitlePrefix": {
            type: "boolean",
            describe:
              "Prefix the main window title with download progress as a portable fallback where other progress signals are not rendered.",
          },
        },
        applyMode: "restart",
      },
      disableNotifications: {
        default: false,
        describe: "A flag to disable all notifications",
        type: "boolean",
        applyMode: "live",
      },
      disableNotificationSound: {
        default: false,
        describe: "Disable chat/meeting start notification sound",
        type: "boolean",
        applyMode: "live",
      },
      disableNotificationSoundIfNotAvailable: {
        default: false,
        describe:
          "Disables notification sound unless status is Available (e.g. while in a call, busy, etc.)",
        type: "boolean",
        applyMode: "live",
      },
      disableNotificationWindowFlash: {
        default: false,
        describe:
          "A flag indicates whether to disable window flashing when there is a notification",
        type: "boolean",
        applyMode: "live",
      },
      notifications: {
        default: {
          timeoutType: "default",
        },
        describe:
          "Notification behaviour. timeoutType: how long notifications stay in the system notification center (Linux/Windows only). Choices: `default` (auto-clear per system policy) or `never` (persist until the user dismisses, useful on GNOME and other desktops that auto-remove notifications). Mirrors Electron's Notification timeoutType. May not be honoured by every notification daemon.",
        type: "object",
        fields: {
          "timeoutType": {
            type: "string",
            describe:
              "How long notifications stay in the system notification center (Linux/Windows only); may not be honoured by every notification daemon.",
            choices: ["default", "never"],
          },
        },
        applyMode: "restart",
      },
      disableBadgeCount: {
        default: false,
        describe:
          "A flag indicates whether to disable the badge counter on the taskbar/dock icon",
        type: "boolean",
        applyMode: "live",
      },
      disableGlobalShortcuts: {
        default: [],
        describe:
          "Array of global shortcuts to disable while the app is in focus. See https://www.electronjs.org/docs/latest/api/accelerator for available accelerators to use",
        type: "array",
        applyMode: "restart",
      },
      globalShortcuts: {
        default: [],
        describe:
          "Global keyboard shortcuts that work system-wide. Disabled by default (opt-in). See configuration docs for details and limitations",
        type: "array",
        applyMode: "restart",
      },
      electronCLIFlags: {
        default: [],
        describe: "Electron CLI flags",
        type: "array",
        applyMode: "restart",
      },
      emulateWinChromiumPlatform: {
        default: false,
        describe:
          "Use windows platform information in chromium. This is helpful if MFA app does not support Linux.",
        type: "boolean",
        applyMode: "restart",
      },
      enableIncomingCallToast: {
        default: false,
        describe: "Enable incoming call toast",
        type: "boolean",
        applyMode: "restart",
      },
      followSystemTheme: {
        default: true,
        describe:
          "Follow the operating-system dark/light theme preference. Default is true; set false to keep Teams's own theme regardless of OS changes.",
        type: "boolean",
        applyMode: "restart",
      },
      frame: {
        default: true,
        describe: "Specify false to create a Frameless Window. Default is true",
        type: "boolean",
        applyMode: "restart",
      },
      incomingCallCommand: {
        default: null,
        describe:
          'Command to execute on an incoming call. (caution: "~" in path is not supported)',
        type: "string",
        applyMode: "restart",
      },
      incomingCallCommandArgs: {
        default: [],
        describe: "Arguments for the incoming call command.",
        type: "array",
        applyMode: "restart",
      },
      isCustomBackgroundEnabled: {
        default: false,
        describe: "A flag indicates whether to enable custom background or not",
        type: "boolean",
        applyMode: "restart",
      },
      logConfig: {
        default: {
          transports: {
            console: {
              level: "info",
            },
            file: {
              level: false,
            },
          },
        },
        describe:
          "Electron-log configuration. See logger.js for configurable values. To disable it provide a Falsy value.",
        type: "object",
        fields: {
          "transports.console.level": {
            type: "string|boolean",
            describe:
              "electron-log level for the console transport (error/warn/info/verbose/debug/silly); set to false to disable console logging.",
          },
          "transports.file.level": {
            type: "string|boolean",
            describe:
              "electron-log level for the file transport (error/warn/info/verbose/debug/silly); false (the default) disables file logging.",
          },
        },
        applyMode: "restart",
      },
      meetupJoinRegEx: {
        default: defaults.meetupJoinRegEx,
        describe: "Regex for Teams meetup-join and related links",
        type: "string",
        applyMode: "restart",
      },
      menubar: {
        default: "auto",
        describe: "A value controls the menu bar behaviour",
        type: "string",
        choices: ["auto", "visible", "hidden"],
        applyMode: "restart",
      },
      minimized: {
        default: false,
        describe: "Start the application minimized",
        type: "boolean",
        applyMode: "restart",
      },
      minimizeOnClose: {
        default: false,
        describe:
          "Minimize the window when clicking the close (X) cross instead of hiding it to the tray (ignored when closeAppOnCross is true)",
        type: "boolean",
        applyMode: "restart",
      },
      notificationMethod: {
        default: "web",
        describe:
          "Notification method to be used by the application (web/electron/custom)",
        type: "string",
        choices: ["web", "electron", "custom"],
        applyMode: "restart",
      },
      customNotification: {
        default: {
          toastDuration: 5000,
        },
        describe:
          "Custom in-app notification system configuration",
        type: "object",
        fields: {
          "toastDuration": {
            type: "number",
            describe:
              "Time in milliseconds before a custom toast notification auto-dismisses.",
          },
        },
        applyMode: "restart",
      },
      onNewWindowOpenMeetupJoinUrlInApp: {
        default: true,
        describe:
          "Open meetupJoinRegEx URLs in the app instead of the default browser",
        type: "boolean",
        applyMode: "restart",
      },
      partition: {
        default: "persist:teams-4-linux",
        describe: "BrowserWindow webpreferences partition",
        type: "string",
        applyMode: "restart",
      },
      proxyServer: {
        default: null,
        describe: "Proxy Server with format address:port",
        type: "string",
        applyMode: "restart",
      },
      network: {
	default: {
		webRTCIPHandlingPolicy: null,
		disableQuic: true,
	},
      	describe:
	  "Network configuration. " +
    	  "webRTCIPHandlingPolicy: WebRTC IP handling policy to control which network interfaces are used for ICE candidates. " +
    	  "Use 'default_public_interface_only' to prevent WebRTC from advertising interfaces that have no internet route " +
    	  "(e.g. a secondary ethernet adapter), which can cause calls to drop to OnHold due to asymmetric STUN routing. " +
    	  "Valid values: 'default', 'default_public_and_private_interfaces', 'default_public_interface_only', 'disable_non_proxied_udp'. " +
    	  "Disabled by default (opt-in). " +
    	  "disableQuic: Append Chromium's --disable-quic switch at startup. Defaults to true to work around issue #2518 " +
    	  "(concurrent SharePoint downloads abort with ERR_QUIC_PROTOCOL_ERROR on the shared QUIC session). Set to false " +
    	  "to re-enable QUIC if a future Chromium release fixes the underlying transport bug.",
	type: "object",
        fields: {
          "webRTCIPHandlingPolicy": {
            type: "string",
            describe:
              "WebRTC IP handling policy controlling which network interfaces are used for ICE candidate gathering.",
            choices: [
              "default",
              "default_public_and_private_interfaces",
              "default_public_interface_only",
              "disable_non_proxied_udp",
            ],
          },
          "disableQuic": {
            type: "boolean",
            describe:
              "Append Chromium's --disable-quic switch at startup to work around QUIC protocol errors (issue #2518).",
          },
        },
        applyMode: "restart",
      },
      spellCheckerLanguages: {
        default: [],
        describe:
          "Array of languages to use with Electron's spell checker (experimental)",
        type: "array",
        applyMode: "restart",
      },
      ssoBasicAuthUser: {
        default: "",
        describe: "User to use for SSO basic auth.",
        type: "string",
        applyMode: "restart",
      },
      ssoBasicAuthPasswordCommand: {
        default: "",
        describe: "Command to execute to retrieve password for SSO basic auth.",
        type: "string",
        applyMode: "restart",
      },
      trayIconEnabled: {
        default: true,
        describe: "Enable tray icon",
        type: "boolean",
        applyMode: "restart",
      },
      msTeamsProtocols: {
        default: {
          v1: "^msteams:/(?:meet/|l/(?:app|call|channel|chat|entity|file|meet(?:ing|up-join)|message|task|team)/)",
          v2: String.raw`^msteams://teams\.(?:microsoft\.com|live\.com|cloud\.microsoft)/(?:meet/|l/(?:app|call|channel|chat|entity|file|meet(?:ing|up-join)|message|task|team)/)`,
        },
        describe:
          "Regular expressions for Microsoft Teams protocol links (v1 and v2).",
        type: "object",
        fields: {
          "v1": {
            type: "string",
            describe:
              "Regular expression matching legacy msteams: scheme protocol links.",
          },
          "v2": {
            type: "string",
            describe:
              "Regular expression matching host-based msteams:// scheme protocol links.",
          },
        },
        applyMode: "restart",
      },
      url: {
        default: "https://teams.cloud.microsoft",
        describe: "Microsoft Teams URL",
        type: "string",
        applyMode: "restart",
      },
      useMutationTitleLogic: {
        default: true,
        describe: "Use MutationObserver to update counter from title",
        type: "boolean",
        applyMode: "restart",
      },
      watchConfigFile: {
        default: false,
        describe: "Watch for changes in the config file and reload the app",
        type: "boolean",
        applyMode: "restart",
      },
      webDebug: {
        default: false,
        describe: "Enable debug at start",
        type: "boolean",
        applyMode: "restart",
      },
      media: {
        default: {
          microphone: {
            disableAutogain: false,
            speakingIndicator: false,
            overrideConstraints: { enabled: false },
          },
          camera: {
            resolution: { enabled: false, mode: "remove" },
            autoAdjustAspectRatio: { enabled: false },
          },
          video: { menuEnabled: false },
          showStatusOnDockIcon: false,
          macPerformanceMode: true,
        },
        describe:
          "Media settings for microphone, camera, and video. showStatusOnDockIcon: overlay the user presence status on the Dock icon on macOS. macPerformanceMode: on macOS, force-enable native hardware/rendering optimizations (Metal ANGLE, GPU rasterization, hardware WebRTC codecs) at startup; defaults to true, set false to opt out without disabling the GPU entirely.",
        type: "object",
        fields: {
          "microphone.disableAutogain": {
            type: "boolean",
            describe:
              "Disable microphone auto gain control so Teams does not automatically adjust microphone volume levels.",
          },
          "microphone.speakingIndicator": {
            type: "boolean",
            describe:
              "Enable a visual overlay showing microphone state during calls (speaking/silent/muted) with WebRTC-based call state detection.",
          },
          "microphone.overrideConstraints.enabled": {
            type: "boolean",
            describe:
              "Enable overriding the microphone audio constraints Teams requests via getUserMedia; only the keys you set are overridden.",
          },
          "microphone.overrideConstraints.echoCancellation": {
            type: "boolean",
            describe:
              "When set, overrides getUserMedia's echoCancellation constraint; omit to leave it untouched.",
          },
          "microphone.overrideConstraints.noiseSuppression": {
            type: "boolean",
            describe:
              "When set, overrides getUserMedia's noiseSuppression constraint; omit to leave it untouched.",
          },
          "microphone.overrideConstraints.autoGainControl": {
            type: "boolean",
            describe:
              "When set, overrides getUserMedia's autoGainControl constraint (takes precedence over disableAutogain); omit to leave it untouched.",
          },
          "microphone.overrideConstraints.channelCount": {
            type: "number",
            describe:
              "When set, pins the microphone channel count (typically 1 or 2); omit to leave it untouched.",
          },
          "microphone.overrideConstraints.sampleRate": {
            type: "number",
            describe:
              "When set, pins the microphone sample rate in Hz (e.g. 48000); omit to leave it untouched.",
          },
          "camera.resolution.enabled": {
            type: "boolean",
            describe: "Enable camera resolution control.",
          },
          "camera.resolution.mode": {
            type: "string",
            describe:
              "Resolution mode: remove strips Teams' constraints to allow native camera resolution, override sets a specific width/height.",
            choices: ["remove", "override"],
          },
          "camera.resolution.width": {
            type: "number",
            describe: "Target camera width when mode is override.",
          },
          "camera.resolution.height": {
            type: "number",
            describe: "Target camera height when mode is override.",
          },
          "camera.autoAdjustAspectRatio.enabled": {
            type: "boolean",
            describe:
              "Reapply proper aspect ratio constraints to fix camera video stretching when moving Teams between monitors with different orientations.",
          },
          "video.menuEnabled": {
            type: "boolean",
            describe:
              "Enable the menu entry for controlling video elements (PiP mode, video controls).",
          },
          "showStatusOnDockIcon": {
            type: "boolean",
            describe:
              "Overlay the user presence status on the Dock icon on macOS.",
          },
          "macPerformanceMode": {
            type: "boolean",
            describe:
              "On macOS, force-enable native hardware/rendering optimizations (Metal ANGLE, GPU rasterization, hardware WebRTC codecs) at startup; set false to opt out without disabling the GPU entirely.",
          },
        },
        applyMode: "restart",
      },
      mqtt: {
        default: {
          enabled: false,
          brokerUrl: "",
          username: "",
          password: "",
          clientId: "teams-for-linux",
          topicPrefix: "teams",
          statusTopic: "status",
          commandTopic: "",
          statusCheckInterval: 10000,
          homeAssistant: {
            enabled: false,
            discoveryPrefix: "homeassistant",
            deviceName: "Teams for Linux",
          },
        },
        describe: "MQTT configuration for publishing Teams status updates and receiving action commands",
        type: "object",
        fields: {
          "enabled": {
            type: "boolean",
            describe:
              "Enable the MQTT integration (status publishing and command reception).",
          },
          "brokerUrl": {
            type: "string",
            describe:
              "MQTT broker URL, e.g. mqtt://host:1883 or mqtts://host:8883 for TLS.",
          },
          "username": {
            type: "string",
            describe: "MQTT username for authentication (optional).",
          },
          "password": {
            type: "string",
            describe: "MQTT password for authentication (optional).",
          },
          "clientId": {
            type: "string",
            describe: "Unique MQTT client identifier.",
          },
          "topicPrefix": {
            type: "string",
            describe: "Topic prefix for all MQTT messages.",
          },
          "statusTopic": {
            type: "string",
            describe:
              "Topic name for outbound status messages, combined with topicPrefix.",
          },
          "commandTopic": {
            type: "string",
            describe:
              "Topic name for receiving inbound commands; leave empty to disable (status-only mode).",
          },
          "statusCheckInterval": {
            type: "number",
            describe:
              "Polling interval in milliseconds for the status detection fallback.",
          },
          "homeAssistant.enabled": {
            type: "boolean",
            describe:
              "Enable Home Assistant MQTT auto-discovery so entities are created automatically.",
          },
          "homeAssistant.discoveryPrefix": {
            type: "string",
            describe: "MQTT discovery topic prefix used by Home Assistant.",
          },
          "homeAssistant.deviceName": {
            type: "string",
            describe: "Device name shown in Home Assistant.",
          },
        },
        applyMode: "restart",
      },
      quickChat: {
        default: {
          enabled: false,
        },
        describe: "Quick Chat configuration for quick access to chat contacts and inline messaging via Graph API",
        type: "object",
        fields: {
          "enabled": {
            type: "boolean",
            describe:
              "Enable the Quick Chat feature for quick contact search and chat access.",
          },
          "shortcut": {
            type: "string",
            describe:
              "Keyboard shortcut to toggle the Quick Chat modal (e.g. CommandOrControl+Alt+Q); unset by default.",
          },
        },
        applyMode: "restart",
      },
      graphApi: {
        default: {
          enabled: false,
        },
        describe: "Microsoft Graph API integration for enhanced Teams functionality (calendar, user profile, etc.)",
        type: "object",
        fields: {
          "enabled": {
            type: "boolean",
            describe:
              "Enable the Microsoft Graph API integration for calendar and mail access.",
          },
        },
        applyMode: "restart",
      },
      auth: {
        default: {
          intune: {
            enabled: false,
            user: "",
          },
          webauthn: {
            enabled: false,
            debug: false,
          },
          reauthRecovery: {
            enabled: false,
          },
        },
        describe: "Authentication configuration. auth.webauthn.enabled turns on hardware security key support on Linux (requires fido2-tools). auth.webauthn.debug enables verbose diagnostic logs, intended for beta testers only. auth.reauthRecovery.enabled opts into the in-app re-authentication recovery feature and is off by default; while off, renderer auth-failure signals are ignored and Teams' own stale 'sign in again' banner is left untouched (you re-authenticate by relaunching, as before this feature existed). When on, a reliable MSAL InteractionRequired signal automatically clears stale auth state and reloads to force a fresh interactive login, and clicking the stale 'sign in again' banner is intercepted to recover in-app instead of opening the login popup externally. Uncaught Teams worker 'UPR' errors are noisy and fire on healthy sessions, so they never trigger an automatic reload on their own; they only help recognise a genuinely broken session for the banner interception. Interception only happens when the session has emitted a trusted auth-failure signal within the last hour, so login popups from healthy flows (initial sign-in, consent and step-up prompts, adding an account) are never diverted. During an active call, recovery is never run silently (it would end the call): the user is asked whether to sign in now, after the call, or not at all.",
        type: "object",
        fields: {
          "intune.enabled": {
            type: "boolean",
            describe: "Enable Single-Sign-On using Microsoft Intune.",
          },
          "intune.user": {
            type: "string",
            describe: "User (e-mail) to use for Intune SSO.",
          },
          "webauthn.enabled": {
            type: "boolean",
            describe:
              "Enable FIDO2 hardware security key support for WebAuthn authentication on Linux (requires fido2-tools).",
          },
          "webauthn.debug": {
            type: "boolean",
            describe:
              "Enable verbose WebAuthn diagnostic logging, intended for beta testers troubleshooting key registration.",
          },
          "reauthRecovery.enabled": {
            type: "boolean",
            describe:
              "Opt into in-app recovery from stale sessions by intercepting the stale 'sign in again' login popup and recovering in-app.",
          },
        },
        applyMode: "restart",
      },
      multiAccount: {
        default: {
          enabled: false,
        },
        describe:
          "Multi-account profile switcher configuration (see ADR-020). enabled: opt-in flag for the single-window multi-tenant switcher. Mutually exclusive with auth.intune.enabled; when both are true a startup warning is logged and multi-account is disabled for the session.",
        type: "object",
        fields: {
          "enabled": {
            type: "boolean",
            describe:
              "Opt-in flag for the single-window multi-account profile switcher; mutually exclusive with auth.intune.enabled.",
          },
        },
        applyMode: "restart",
      },
      wayland: {
        default: {
          xwaylandOptimizations: false,
        },
        describe: "Wayland display server configuration. xwaylandOptimizations: keeps GPU enabled and skips fake media UI flag under XWayland (may fix camera issues but can break screen sharing)",
        type: "object",
        fields: {
          "xwaylandOptimizations": {
            type: "boolean",
            describe:
              "Keep GPU enabled and skip the fake media UI flag under XWayland; may fix camera issues but can break screen sharing.",
          },
        },
        applyMode: "restart",
      },
};
