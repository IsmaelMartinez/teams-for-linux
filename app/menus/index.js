const {
  app,
  Menu,
  MenuItem,
  clipboard,
  dialog,
  session,
  ipcMain,
} = require("electron");
const fs = require("node:fs"),
  path = require("node:path");
const appMenu = require("./appMenu");
const Tray = require("./tray");
const { SpellCheckProvider } = require("../spellCheckProvider");
const DocumentationWindow = require("../documentationWindow");
const GpuInfoWindow = require("../gpuInfoWindow");
const JoinMeetingDialog = require("../joinMeetingDialog");
const autoUpdaterModule = require("../autoUpdater");

let _Menus_onSpellCheckerLanguageChanged = new WeakMap();
class Menus {
  constructor(window, configGroup, iconPath, connectionManager) {
    this.window = window;
    this.iconPath = iconPath;
    this.configGroup = configGroup;
    this.connectionManager = connectionManager;
    this.allowQuit = false;
    this.documentationWindow = new DocumentationWindow();
    this.gpuInfoWindow = new GpuInfoWindow();
    this.joinMeetingDialog = new JoinMeetingDialog(
      this.window,
      this.configGroup.startupConfig.meetupJoinRegEx
    );
    this.initialize();
  }

  get onSpellCheckerLanguageChanged() {
    return _Menus_onSpellCheckerLanguageChanged.get(this);
  }

  set onSpellCheckerLanguageChanged(value) {
    if (typeof value === "function") {
      _Menus_onSpellCheckerLanguageChanged.set(this, value);
    }
  }

  async quit(clearStorage = false) {
    this.allowQuit = true;

    clearStorage =
      clearStorage &&
      dialog.showMessageBoxSync(this.window, {
        buttons: ["Yes", "No"],
        title: "Quit",
        normalizeAccessKeys: true,
        defaultId: 1,
        cancelId: 1,
        message:
          "Are you sure you want to clear the storage before quitting? If you have clearStorageData set in the config, it will use that configuration.",
        type: "question",
      }) === 0;

    if (clearStorage) {
      const defSession = session.fromPartition(
        this.configGroup.startupConfig.partition
      );
      if (this.configGroup.clearStorageData) {
        console.debug(
          "Clearing storage data on quit",
          this.config.clearStorageData
        );
        await defSession.clearStorageData(this.configGroup.clearStorageData);
      } else {
        console.debug(
          "Clearing storage on quit",
          this.configGroup.clearStorageData
        );
        await defSession.clearStorageData();
      }
    }

    this.window.close();
  }

  open() {
    if (!this.window.isVisible()) {
      this.window.show();
    }

    this.window.focus();
  }

  about() {
    const appInfo = [];
    appInfo.push(`teams-for-linux@${app.getVersion()}\n`);
    for (const prop in process.versions) {
      if (
        prop === "node" ||
        prop === "v8" ||
        prop === "electron" ||
        prop === "chrome"
      ) {
        appInfo.push(`${prop}: ${process.versions[prop]}`);
      }
    }
    dialog.showMessageBoxSync(this.window, {
      buttons: ["OK"],
      title: "About",
      normalizeAccessKeys: true,
      defaultId: 0,
      cancelId: 0,
      message: appInfo.join("\n"),
      type: "info",
    });
  }

  reload(show = true) {
    if (show) {
      this.window.show();
    }

    this.connectionManager.refresh();
  }

  debug() {
    this.window.openDevTools();
  }

  hide() {
    this.window.hide();
  }

  initialize() {
    const menu = appMenu(this);

    if (this.configGroup.startupConfig.menubar == "hidden") {
      this.window.removeMenu();
    } else {
      this.window.setMenu(Menu.buildFromTemplate([menu]));
    }

    this.initializeEventHandlers();

    if (this.configGroup.startupConfig.trayIconEnabled) {
      this.tray = new Tray(
        this.window,
        menu.submenu,
        this.iconPath,
        this.configGroup.startupConfig
      );
      this.tray.initialize();
    }
    this.spellCheckProvider = new SpellCheckProvider(this.window);
  }

  initializeEventHandlers() {
    app.on("before-quit", () => this.onBeforeQuit());
    this.window.on("close", (event) => this.onClose(event));
    this.window.webContents.on("context-menu", assignContextMenuHandler(this));
  }

  onBeforeQuit() {
    console.debug("before-quit");
    this.allowQuit = true;
  }

  onClose(event) {
    console.debug("window close");
    if (!this.allowQuit && !this.configGroup.startupConfig.closeAppOnCross) {
      event.preventDefault();
      this.hide();
    } else {
      if (this.tray) {
        this.tray.close();
      }
      this.window.webContents.session.flushStorageData();
    }
  }

  saveSettings() {
    // Receive Teams settings from renderer to save to file
    ipcMain.once("get-teams-settings", saveSettingsInternal);
    this.window.webContents.send("get-teams-settings");
  }

  restoreSettings() {
    // Acknowledge settings restoration completion from renderer
    ipcMain.once("set-teams-settings", restoreSettingsInternal);
    const settingsPath = path.join(
      app.getPath("userData"),
      "teams_settings.json"
    );
    if (fs.existsSync(settingsPath)) {
      this.window.webContents.send(
        "set-teams-settings",
        JSON.parse(fs.readFileSync(settingsPath))
      );
    } else {
      dialog.showMessageBoxSync(this.window, {
        message: "Settings file not found. Using default settings.",
        title: "Restore settings",
        type: "warning",
      });
    }
  }

  updateMenu() {
    const menu = appMenu(this);
    this.window.setMenu(Menu.buildFromTemplate([menu]));
    if (this.tray) {
      this.tray.setContextMenu(menu.submenu);
    }

    // Notify renderer process of config changes that affect renderer behavior
    // This allows menu toggles to take effect immediately without restart
    this.window.webContents.send("config-changed", {
      disableNotifications: this.configGroup.startupConfig.disableNotifications,
      disableNotificationSound: this.configGroup.startupConfig.disableNotificationSound,
      disableNotificationSoundIfNotAvailable: this.configGroup.startupConfig.disableNotificationSoundIfNotAvailable,
      disableNotificationWindowFlash: this.configGroup.startupConfig.disableNotificationWindowFlash,
      disableBadgeCount: this.configGroup.startupConfig.disableBadgeCount,
      defaultNotificationUrgency: this.configGroup.startupConfig.defaultNotificationUrgency,
    });
  }

  toggleDisableNotifications() {
    this.configGroup.startupConfig.disableNotifications =
      !this.configGroup.startupConfig.disableNotifications;
    this.configGroup.legacyConfigStore.set(
      "disableNotifications",
      this.configGroup.startupConfig.disableNotifications
    );
    this.updateMenu();
  }

  toggleDisableNotificationSound() {
    this.configGroup.startupConfig.disableNotificationSound =
      !this.configGroup.startupConfig.disableNotificationSound;
    this.configGroup.legacyConfigStore.set(
      "disableNotificationSound",
      this.configGroup.startupConfig.disableNotificationSound
    );
    this.updateMenu();
  }

  toggleDisableNotificationSoundIfNotAvailable() {
    this.configGroup.startupConfig.disableNotificationSoundIfNotAvailable =
      !this.configGroup.startupConfig.disableNotificationSoundIfNotAvailable;
    this.configGroup.legacyConfigStore.set(
      "disableNotificationSoundIfNotAvailable",
      this.configGroup.startupConfig.disableNotificationSoundIfNotAvailable
    );
    this.updateMenu();
  }

  toggleDisableNotificationWindowFlash() {
    this.configGroup.startupConfig.disableNotificationWindowFlash =
      !this.configGroup.startupConfig.disableNotificationWindowFlash;
    this.configGroup.legacyConfigStore.set(
      "disableNotificationWindowFlash",
      this.configGroup.startupConfig.disableNotificationWindowFlash
    );
    this.updateMenu();
  }

  toggleDisableBadgeCount() {
    this.configGroup.startupConfig.disableBadgeCount =
      !this.configGroup.startupConfig.disableBadgeCount;
    this.configGroup.legacyConfigStore.set(
      "disableBadgeCount",
      this.configGroup.startupConfig.disableBadgeCount
    );
    this.updateMenu();
  }

  setNotificationUrgency(value) {
    this.configGroup.startupConfig.defaultNotificationUrgency = value;
    this.configGroup.legacyConfigStore.set("defaultNotificationUrgency", value);
    this.updateMenu();
  }

  forcePip() {
    const script = `document.querySelectorAll('div[data-type="screen-sharing"] video').forEach(v => {v.removeAttribute("disablepictureinpicture"); v.requestPictureInPicture();})`;
    this.window.webContents.executeJavaScript(script, true);
  }

  forceVideoControls() {
    const script = `document.querySelectorAll('video').forEach(v => {v.removeAttribute("disablepictureinpicture"); v.toggleAttribute("controls");})`;
    this.window.webContents.executeJavaScript(script, true);
  }

  joinMeeting() {
    let clipboardText = '';
    try {
      clipboardText = clipboard.readText();
    } catch (error) {
      console.error('Error reading clipboard:', error);
    }

    this.joinMeetingDialog.show(clipboardText, (meetingUrl) => {
      this.joinMeetingWithUrl(meetingUrl);
    });
  }

  joinMeetingWithUrl(meetingUrl) {
    try {
      this.window.webContents.loadURL(meetingUrl);
      this.window.show();
      this.window.focus();
    } catch (error) {
      console.error('Error loading meeting URL:', error);
      dialog.showErrorBox('Error', 'Failed to join meeting. Please check the URL.');
    }
  }

  showDocumentation() {
    this.documentationWindow.show();
  }

  showGpuInfo() {
    this.gpuInfoWindow.show();
  }

  setQuickChatManager(quickChatManager) {
    this.quickChatManager = quickChatManager;
  }

  showQuickChat() {
    if (this.quickChatManager?.isEnabled()) {
      this.quickChatManager.toggle();
    }
  }

  checkForUpdates() {
    autoUpdaterModule.checkForUpdates();
  }
}

function saveSettingsInternal(_event, arg) {
  fs.writeFileSync(
    path.join(app.getPath("userData"), "teams_settings.json"),
    JSON.stringify(arg)
  );
  dialog.showMessageBoxSync(this.window, {
    message: "Settings have been saved successfully!",
    title: "Save settings",
    type: "info",
  });
}

function restoreSettingsInternal(_event, arg) {
  if (arg) {
    dialog.showMessageBoxSync(this.window, {
      message: "Settings have been restored successfully!",
      title: "Restore settings",
      type: "info",
    });
  }
}

function assignContextMenuHandler(menus) {
  return (_event, params) => {
    const menu = new Menu();

    // Add each spelling suggestion
    assignReplaceWordHandler(params, menu, menus);

    // Allow users to add the misspelled word to the dictionary
    assignAddToDictionaryHandler(params, menu, menus);

    if (menu.items.length > 0) {
      menu.popup();
    }
  };
}

function assignReplaceWordHandler(params, menu, menus) {
  for (const suggestion of params.dictionarySuggestions) {
    menu.append(
      new MenuItem({
        label: suggestion,
        click: () => menus.window.webContents.replaceMisspelling(suggestion),
      })
    );
  }
}

function assignAddToDictionaryHandler(params, menu, menus) {
  if (params.misspelledWord) {
    menu.append(
      new MenuItem({
        label: "Add to dictionary",
        click: () =>
          menus.window.webContents.session.addWordToSpellCheckerDictionary(
            params.misspelledWord
          ),
      })
    );

    menu.append(
      new MenuItem({
        type: "separator",
      })
    );
  }

  addTextEditMenuItems(params, menu, menus);
}

function addTextEditMenuItems(params, menu, menus) {
  if (params.isEditable) {
    buildEditContextMenu(menu, menus);
  } else if (params.linkURL !== "") {
    menu.append(
      new MenuItem({
        label: "Copy",
        click: () => clipboard.writeText(params.linkURL),
      })
    );
  }
}

function buildEditContextMenu(menu, menus) {
  menu.append(
    new MenuItem({
      role: "cut",
    })
  );

  menu.append(
    new MenuItem({
      role: "copy",
    })
  );

  menu.append(
    new MenuItem({
      role: "paste",
    })
  );

  addSpellCheckMenuItems(menu, menus);
}

function addSpellCheckMenuItems(menu, menus) {
  menu.append(
    new MenuItem({
      type: "separator",
    })
  );

  menu.append(
    new MenuItem({
      label: "Writing Languages",
      submenu: createSpellCheckLanguagesMenu(menus),
    })
  );
}

function createSpellCheckLanguagesMenu(menus) {
  const activeLanguages =
    menus.window.webContents.session.getSpellCheckerLanguages();
  const splChkMenu = new Menu();
  for (const group of menus.spellCheckProvider.supportedListByGroup) {
    const subMenu = new Menu();
    splChkMenu.append(
      new MenuItem({
        label: group.key,
        submenu: subMenu,
      })
    );
    for (const language of group.list) {
      subMenu.append(createLanguageMenuItem(language, activeLanguages, menus));
    }
  }

  createSpellCheckLanguagesNoneMenuEntry(splChkMenu, menus);

  return splChkMenu;
}

function createSpellCheckLanguagesNoneMenuEntry(menu, menus) {
  menu.append(
    new MenuItem({
      type: "separator",
    })
  );
  menu.append(
    new MenuItem({
      label: "None",
      click: () => chooseLanguage(null, menus),
    })
  );
}

function createLanguageMenuItem(language, activeLanguages, menus) {
  return new MenuItem({
    label: language.language,
    type: "checkbox",
    id: language.code,
    checked: activeLanguages.includes(language.code),
    click: (menuItem) => chooseLanguage(menuItem, menus),
  });
}

function chooseLanguage(item, menus) {
  const activeLanguages =
    menus.window.webContents.session.getSpellCheckerLanguages();
  if (item) {
    if (item.checked) {
      addToList(activeLanguages, item.id);
    } else {
      removeFromList(activeLanguages, item.id);
    }
  }

  const changes = menus.spellCheckProvider.setLanguages(
    item ? activeLanguages : []
  );

  if (menus.onSpellCheckerLanguageChanged) {
    menus.onSpellCheckerLanguageChanged.apply(menus, [changes]);
  }
}

function removeFromList(list, item) {
  const itemIndex = list.findIndex((l) => l == item);
  if (itemIndex >= 0) {
    list.splice(itemIndex, 1);
  }

  return list;
}

function addToList(list, item) {
  const itemIndex = list.findIndex((l) => l == item);
  if (itemIndex < 0) {
    list.push(item);
  }

  return list;
}

exports = module.exports = Menus;
