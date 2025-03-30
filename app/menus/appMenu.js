const { shell } = require("electron");

exports = module.exports = (Menus) => ({
  label: "Teams for Linux",
  submenu: [
    {
      label: "Open",
      accelerator: "ctrl+O",
      click: () => Menus.open(),
    },
    {
      label: "Refresh",
      accelerator: "ctrl+R",
      click: () => Menus.reload(),
    },
    {
      label: "Hide",
      accelerator: "ctrl+H",
      click: () => Menus.hide(),
    },
    {
      label: "Debug",
      accelerator: "ctrl+D",
      click: () => Menus.debug(),
    },
    {
      type: "separator",
    },
    getSettingsMenu(Menus),
    getPreferencesMenu(),
    getNotificationsMenu(Menus),
    {
      type: "separator",
    },
    {
      label: "About",
      click: () => Menus.about(),
    },
    getHelpMenu(),
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
        label: "Disable Meeting Notifications",
        type: "checkbox",
        checked: Menus.configGroup.startupConfig.disableMeetingNotifications,
        click: () => Menus.toggleDisableMeetingNotifications(),
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

function getHelpMenu() {
  return {
    label: "Help",
    submenu: [
      {
        label: "Online Documentation",
        click: () =>
          shell.openExternal("https://support.office.com/en-us/teams"),
      },
      {
        label: "Github Project",
        click: () =>
          shell.openExternal(
            "https://github.com/IsmaelMartinez/teams-for-linux",
          ),
      },
      {
        label: "Microsoft Teams Support",
        click: () =>
          shell.openExternal(
            "https://answers.microsoft.com/en-us/msteams/forum",
          ),
      },
    ],
  };
}
