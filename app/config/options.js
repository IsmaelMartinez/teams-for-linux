// Configuration option definitions for Teams for Linux.
//
// This is the single source of truth for the wrapper's config schema. It is
// consumed at runtime by the yargs parser in ./index.js, and by the docs/schema
// generator in scripts/generateConfigDocs.js. Each entry carries a `default`,
// a `describe` string, and a `type`. Keep it a plain data module with no
// imports so the generator can require it outside Electron.
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
      },
      appIcon: {
        default: "",
        describe: "Teams app icon to show in the tray",
        type: "string",
      },
      appIconType: {
        default: "default",
        describe: "Type of tray icon to be used",
        type: "string",
        choices: ["default", "light", "dark"],
      },
      appIdleTimeout: {
        default: 300,
        describe:
          "A numeric value in seconds as duration before app considers the system as idle",
        type: "number",
      },
      appIdleTimeoutCheckInterval: {
        default: 10,
        describe:
          "A numeric value in seconds as poll interval to check if the appIdleTimeout is reached",
        type: "number",
      },
      appTitle: {
        default: "Microsoft Teams",
        describe: "A text to be suffixed with page title",
        type: "string",
      },
      alwaysOnTop: {
        default: true,
        describe: "Keep the pop-out window always on top of other windows.",
        type: "boolean",
      },
      authServerWhitelist: {
        default: "*",
        describe: "Set auth-server-whitelist value",
        type: "string",
      },
      awayOnSystemIdle: {
        default: false,
        describe: "Sets the user status as away when system goes idle",
        type: "boolean",
      },
      idleDetection: {
        default: {
          forceState: false,
          stateFile: "/tmp/teams-for-linux-idle-state-$USER",
        },
        describe: "Idle detection configuration. forceState: enables state file-based idle control (workaround for Wayland/Hyprland). stateFile: path to state file with $USER expansion support.",
        type: "object",
      },
      chromeUserAgent: {
        default: `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`,
        describe: "Google Chrome User Agent",
        type: "string",
      },
      customBGServiceBaseUrl: {
        default: "http://localhost",
        describe:
          "Base URL of the server which provides custom background images",
        type: "string",
      },
      customBGServiceConfigFetchInterval: {
        default: 0,
        describe:
          "A numeric value in seconds as poll interval to download background service config download",
        type: "number",
      },
      customCACertsFingerprints: {
        default: [],
        describe:
          "Array of custom CA Certs Fingerprints to allow SSL unrecognized signer or self signed certificate",
        type: "array",
      },
      customCSSName: {
        default: "",
        describe:
          'custom CSS name for the packaged available css files. Currently those are: "compactDark", "compactLight", "tweaks", "condensedDark" and "condensedLight" ',
        type: "string",
      },
      customCSSLocation: {
        default: "",
        describe: "custom CSS styles file location",
        type: "string",
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
      },
      disableTimestampOnCopy: {
        default: false,
        describe:
          "Controls whether timestamps are included when copying messages in chats",
        type: "boolean",
      },
      class: {
        default: null,
        describe: "A custom value for the WM_CLASS property",
        type: "string",
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
      },
      clearStorageData: {
        default: null,
        describe:
          "Flag to clear storage data. Expects an object of the type https://www.electronjs.org/docs/latest/api/session#sesclearstoragedataoptions",
        type: "boolean",
      },
      clientCertPath: {
        default: "",
        describe:
          "Custom Client Certs for corporate authentication (certificate must be in pkcs12 format)",
        type: "string",
      },
      clientCertPassword: {
        default: "",
        describe:
          "Custom Client Certs password for corporate authentication (certificate must be in pkcs12 format)",
        type: "string",
      },
      closeAppOnCross: {
        default: false,
        describe: "Close the app when clicking the close (X) cross",
        type: "boolean",
      },
      defaultNotificationUrgency: {
        default: "normal",
        describe: "Default urgency for new notifications (low/normal/critical)",
        type: "string",
        choices: ["low", "normal", "critical"],
      },
      defaultURLHandler: {
        default: "",
        describe: "Default application to be used to open the HTTP URLs",
        type: "string",
      },
      disableGpu: {
        default: false,
        describe:
          "A flag to disable GPU and hardware acceleration (can be useful if the window remains blank)",
        type: "boolean",
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
      },
      disableNotifications: {
        default: false,
        describe: "A flag to disable all notifications",
        type: "boolean",
      },
      disableNotificationSound: {
        default: false,
        describe: "Disable chat/meeting start notification sound",
        type: "boolean",
      },
      disableNotificationSoundIfNotAvailable: {
        default: false,
        describe:
          "Disables notification sound unless status is Available (e.g. while in a call, busy, etc.)",
        type: "boolean",
      },
      disableNotificationWindowFlash: {
        default: false,
        describe:
          "A flag indicates whether to disable window flashing when there is a notification",
        type: "boolean",
      },
      notifications: {
        default: {
          timeoutType: "default",
        },
        describe:
          "Notification behaviour. timeoutType: how long notifications stay in the system notification center (Linux/Windows only). Choices: `default` (auto-clear per system policy) or `never` (persist until the user dismisses, useful on GNOME and other desktops that auto-remove notifications). Mirrors Electron's Notification timeoutType. May not be honoured by every notification daemon.",
        type: "object",
      },
      disableBadgeCount: {
        default: false,
        describe:
          "A flag indicates whether to disable the badge counter on the taskbar/dock icon",
        type: "boolean",
      },
      disableGlobalShortcuts: {
        default: [],
        describe:
          "Array of global shortcuts to disable while the app is in focus. See https://www.electronjs.org/docs/latest/api/accelerator for available accelerators to use",
        type: "array",
      },
      globalShortcuts: {
        default: [],
        describe:
          "Global keyboard shortcuts that work system-wide. Disabled by default (opt-in). See configuration docs for details and limitations",
        type: "array",
      },
      electronCLIFlags: {
        default: [],
        describe: "Electron CLI flags",
        type: "array",
      },
      emulateWinChromiumPlatform: {
        default: false,
        describe:
          "Use windows platform information in chromium. This is helpful if MFA app does not support Linux.",
        type: "boolean",
      },
      enableIncomingCallToast: {
        default: false,
        describe: "Enable incoming call toast",
        type: "boolean",
      },
      followSystemTheme: {
        default: true,
        describe:
          "Follow the operating-system dark/light theme preference. Default is true; set false to keep Teams's own theme regardless of OS changes.",
        type: "boolean",
      },
      frame: {
        default: true,
        describe: "Specify false to create a Frameless Window. Default is true",
        type: "boolean",
      },
      incomingCallCommand: {
        default: null,
        describe:
          'Command to execute on an incoming call. (caution: "~" in path is not supported)',
        type: "string",
      },
      incomingCallCommandArgs: {
        default: [],
        describe: "Arguments for the incoming call command.",
        type: "array",
      },
      isCustomBackgroundEnabled: {
        default: false,
        describe: "A flag indicates whether to enable custom background or not",
        type: "boolean",
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
      },
      meetupJoinRegEx: {
        default: defaults.meetupJoinRegEx,
        describe: "Regex for Teams meetup-join and related links",
        type: "string",
      },
      menubar: {
        default: "auto",
        describe: "A value controls the menu bar behaviour",
        type: "string",
        choices: ["auto", "visible", "hidden"],
      },
      minimized: {
        default: false,
        describe: "Start the application minimized",
        type: "boolean",
      },
      minimizeOnClose: {
        default: false,
        describe:
          "Minimize the window when clicking the close (X) cross instead of hiding it to the tray (ignored when closeAppOnCross is true)",
        type: "boolean",
      },
      notificationMethod: {
        default: "web",
        describe:
          "Notification method to be used by the application (web/electron/custom)",
        type: "string",
        choices: ["web", "electron", "custom"],
      },
      customNotification: {
        default: {
          toastDuration: 5000,
        },
        describe:
          "Custom in-app notification system configuration",
        type: "object",
      },
      onNewWindowOpenMeetupJoinUrlInApp: {
        default: true,
        describe:
          "Open meetupJoinRegEx URLs in the app instead of the default browser",
        type: "boolean",
      },
      partition: {
        default: "persist:teams-4-linux",
        describe: "BrowserWindow webpreferences partition",
        type: "string",
      },
      proxyServer: {
        default: null,
        describe: "Proxy Server with format address:port",
        type: "string",
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
      },
      spellCheckerLanguages: {
        default: [],
        describe:
          "Array of languages to use with Electron's spell checker (experimental)",
        type: "array",
      },
      ssoBasicAuthUser: {
        default: "",
        describe: "User to use for SSO basic auth.",
        type: "string",
      },
      ssoBasicAuthPasswordCommand: {
        default: "",
        describe: "Command to execute to retrieve password for SSO basic auth.",
        type: "string",
      },
      trayIconEnabled: {
        default: true,
        describe: "Enable tray icon",
        type: "boolean",
      },
      msTeamsProtocols: {
        default: {
          v1: "^msteams:/(?:meet/|l/(?:app|call|channel|chat|entity|file|meet(?:ing|up-join)|message|task|team)/)",
          v2: String.raw`^msteams://teams\.(?:microsoft\.com|live\.com|cloud\.microsoft)/(?:meet/|l/(?:app|call|channel|chat|entity|file|meet(?:ing|up-join)|message|task|team)/)`,
        },
        describe:
          "Regular expressions for Microsoft Teams protocol links (v1 and v2).",
        type: "object",
      },
      url: {
        default: "https://teams.cloud.microsoft",
        describe: "Microsoft Teams URL",
        type: "string",
      },
      useMutationTitleLogic: {
        default: true,
        describe: "Use MutationObserver to update counter from title",
        type: "boolean",
      },
      watchConfigFile: {
        default: false,
        describe: "Watch for changes in the config file and reload the app",
        type: "boolean",
      },
      webDebug: {
        default: false,
        describe: "Enable debug at start",
        type: "boolean",
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
        },
        describe: "Media settings for microphone, camera, and video",
        type: "object",
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
      },
      quickChat: {
        default: {
          enabled: false,
        },
        describe: "Quick Chat configuration for quick access to chat contacts and inline messaging via Graph API",
        type: "object",
      },
      graphApi: {
        default: {
          enabled: false,
        },
        describe: "Microsoft Graph API integration for enhanced Teams functionality (calendar, user profile, etc.)",
        type: "object",
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
        describe: "Authentication configuration. auth.webauthn.enabled turns on hardware security key support on Linux (requires fido2-tools). auth.webauthn.debug enables verbose diagnostic logs, intended for beta testers only. auth.reauthRecovery.enabled opts into in-app recovery from stale sessions and is off by default. When on, it intercepts the Microsoft login popup opened by the stale 'sign in again' banner and recovers in-app (clearing stale auth state and reloading) instead of opening the popup externally. Uncaught Teams worker 'UPR' errors are used only to recognise a genuinely broken session for this interception — they are noisy and fire on healthy sessions, so they never trigger an automatic reload on their own; the reliable MSAL InteractionRequired signal is what drives automatic recovery, regardless of this flag. Interception only happens when the session has emitted a trusted auth-failure signal within the last hour, so login popups from healthy flows (initial sign-in, consent and step-up prompts, adding an account) are never diverted. During an active call, recovery is never run silently (it would end the call): the user is asked whether to sign in now, after the call, or not at all.",
        type: "object",
      },
      multiAccount: {
        default: {
          enabled: false,
        },
        describe:
          "Multi-account profile switcher configuration (see ADR-020). enabled: opt-in flag for the single-window multi-tenant switcher. Mutually exclusive with auth.intune.enabled; when both are true a startup warning is logged and multi-account is disabled for the session.",
        type: "object",
      },
      wayland: {
        default: {
          xwaylandOptimizations: false,
        },
        describe: "Wayland display server configuration. xwaylandOptimizations: keeps GPU enabled and skips fake media UI flag under XWayland (may fix camera issues but can break screen sharing)",
        type: "object",
      },
};
