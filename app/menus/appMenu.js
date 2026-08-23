const { shell } = require("electron");
const buildProfilesMenu = require("./profilesMenu");

exports = module.exports = (Menus) => ({
  label: "Teams for Linux",
  submenu: [
    {
      label: "Open",
      accelerator: "ctrl+O",
      click: () => Menus.open(),
    },
    {
      label: "Join Meeting",
      accelerator: "ctrl+J",
      click: () => Menus.joinMeeting(),
    },
    {
      label: "Return to Teams",
      click: () => Menus.returnToTeams(),
    },
    ...(Menus.configGroup.startupConfig.quickChat?.enabled
      ? [
          {
            label: "Quick Chat",
            accelerator: Menus.configGroup.startupConfig.quickChat?.shortcut || undefined,
            click: () => Menus.showQuickChat(),
          },
        ]
      : []),
    {
      label: "Refresh",
      accelerator: "ctrl+R",
      click: () => Menus.reload(),
    },
    ...(process.env.APPIMAGE
      ? [
          {
            label: "Check for Updates",
            click: () => Menus.checkForUpdates(),
          },
        ]
      : []),
    {
      label: "Hide",
      accelerator: "ctrl+H",
      click: () => Menus.hide(),
    },
    {
      label: "Debug",
      submenu: [
        {
          label: "Open DevTools",
          accelerator: "ctrl+D",
          click: () => Menus.debug(),
        },
        {
          label: "Open GPU Info",
          click: () => Menus.showGpuInfo(),
        },
      ],
    },
    {
      type: "separator",
    },
    getSettingsMenu(Menus),
    getPreferencesMenu(),
    getNotificationsMenu(Menus),
    ...(Menus.configGroup.startupConfig.multiAccount?.enabled
      ? [buildProfilesMenu(Menus)].filter(Boolean)
      : []),
    {
      type: "separator",
    },
    {
      label: "About",
      click: () => Menus.about(),
    },
    getHelpMenu(Menus),
    ...(Menus.configGroup.startupConfig.media?.video?.menuEnabled
      ? [
          {
            type: "separator",
          },
          getVideoMenu(Menus),
        ]
      : []),
    {
      type: "separator",
    },
    {
      label: "Quit (Clear Storage)",
      click: () => Menus.quit(true),
    },
    {
      label: "Quit",
      accelerator: "ctrl+Q",
      click: () => Menus.quit(),
    },
  ],
});

function getSettingsMenu(Menus) {
  return {
    label: "Settings",
    submenu: [
      {
        label: "Save",
        click: () => Menus.saveSettings(),
      },
      {
        label: "Restore",
        click: () => Menus.restoreSettings(),
      },
    ],
  };
}

function getPreferencesMenu() {
  return {
    label: "Zoom",
    submenu: [
      { role: "resetZoom" },
      { role: "zoomIn" },
      { role: "zoomOut" },
      { role: "togglefullscreen" },
    ],
  };
}

// The legacy disableBadgeCount switch still hides both badges until a badge
// toggle is used, at which point Menus folds it into the per-surface leaves.
// The two leaves have opposite defaults: the tray badge is on unless set to
// false, the taskbar badge ships off and needs an explicit true.
function isBadgeDisabled(Menus, leaf) {
  const config = Menus.configGroup.startupConfig;
  if (config.disableBadgeCount) return true;
  const value = config.notifications?.[leaf];
  return leaf === "taskbarBadgeEnabled" ? value !== true : value === false;
}

function getNotificationsMenu(Menus) {
  return {
    label: "Notifications",
    submenu: [
      {
        label: "Disable All Notifications",
        type: "checkbox",
        checked: Menus.configGroup.startupConfig.disableNotifications,
        click: () => Menus.toggleDisableNotifications(),
      },
      {
        label: "Disable Notifications Sound",
        type: "checkbox",
        checked: Menus.configGroup.startupConfig.disableNotificationSound,
        click: () => Menus.toggleDisableNotificationSound(),
      },
      {
        label: "Disable Sound when Not Available (e.g: busy, in a call)",
        type: "checkbox",
        checked:
          Menus.configGroup.startupConfig
            .disableNotificationSoundIfNotAvailable,
        click: () => Menus.toggleDisableNotificationSoundIfNotAvailable(),
      },
      {
        label: "Disables Window Flash on New Notifications",
        type: "checkbox",
        checked: Menus.configGroup.startupConfig.disableNotificationWindowFlash,
        click: () => Menus.toggleDisableNotificationWindowFlash(),
      },
      {
        label: "Disable Tray Icon Badge",
        type: "checkbox",
        checked: isBadgeDisabled(Menus, "trayBadgeEnabled"),
        click: () => Menus.toggleTrayBadge(),
      },
      {
        label: "Disable Taskbar Badge",
        type: "checkbox",
        checked: isBadgeDisabled(Menus, "taskbarBadgeEnabled"),
        click: () => Menus.toggleTaskbarBadge(),
      },
      {
        label: "Urgency",
        submenu: [
          {
            label: "Low",
            type: "checkbox",
            checked:
              Menus.configGroup.startupConfig.defaultNotificationUrgency ===
              "low",
            click: () => Menus.setNotificationUrgency("low"),
          },
          {
            label: "Normal",
            type: "checkbox",
            checked:
              Menus.configGroup.startupConfig.defaultNotificationUrgency ===
              "normal",
            click: () => Menus.setNotificationUrgency("normal"),
          },
          {
            label: "Critical",
            type: "checkbox",
            checked:
              Menus.configGroup.startupConfig.defaultNotificationUrgency ===
              "critical",
            click: () => Menus.setNotificationUrgency("critical"),
          },
        ],
      },
    ],
  };
}

function getHelpMenu(Menus) {
  return {
    label: "Help",
    submenu: [
      {
        label: "Teams for Linux Documentation",
        click: () => Menus.showDocumentation(),
      },
      {
        type: "separator",
      },
      {
        label: "Online Documentation",
        click: () =>
          shell.openExternal("https://support.office.com/en-us/teams"),
      },
      {
        label: "Github Project",
        click: () =>
          shell.openExternal(
            "https://github.com/IsmaelMartinez/teams-for-linux"
          ),
      },
      {
        label: "Microsoft Teams Support",
        click: () =>
          shell.openExternal(
            "https://answers.microsoft.com/en-us/msteams/forum"
          ),
      },
    ],
  };
}

function getVideoMenu(Menus) {
  return {
    label: "Video",
    submenu: [
      {
        label: "Force enable PiP mode for shared screen",
        click: () => {
          Menus.forcePip();
        },
      },
      {
        label: "Force toggle controls for all video elements",
        click: () => {
          Menus.forceVideoControls();
        },
      },
    ],
  };
}
