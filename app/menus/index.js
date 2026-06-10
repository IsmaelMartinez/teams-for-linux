const {
  app,
  BrowserWindow,
  Menu,
  MenuItem,
  clipboard,
  dialog,
  session,
  ipcMain,
  Notification,
} = require("electron");
const fs = require("node:fs"),
  path = require("node:path");
const { pathToFileURL } = require("node:url");
const appMenu = require("./appMenu");
const Tray = require("./tray");
const { SpellCheckProvider } = require("../spellCheckProvider");
const DocumentationWindow = require("../documentationWindow");
const GpuInfoWindow = require("../gpuInfoWindow");
const JoinMeetingDialog = require("../joinMeetingDialog");
const AddProfileDialog = require("../profileDialogs/addProfile");
const ManageProfileDialog = require("../profileDialogs/manageProfile");
const autoUpdaterModule = require("../autoUpdater");

let _Menus_onSpellCheckerLanguageChanged = new WeakMap();
class Menus {
  #preJoinUrl = null;
  #profileChangeHandler = null;

  constructor(window, configGroup, iconPath, connectionManager, profilesManager = null) {
    this.window = window;
    this.iconPath = iconPath;
    this.configGroup = configGroup;
    this.connectionManager = connectionManager;
    this.profilesManager = profilesManager;
    this.allowQuit = false;
    this.documentationWindow = new DocumentationWindow();
    this.gpuInfoWindow = new GpuInfoWindow();
    this.joinMeetingDialog = new JoinMeetingDialog(
      this.window,
      this.configGroup.startupConfig.meetupJoinRegEx
    );
    // Only allocate the Add-profile / Manage-profiles dialogs when multi-
    // account is enabled. The Profiles menu entries that trigger them are
    // themselves gated on the same flag, so with the flag off these objects
    // are never reachable from the UI.
    const multiAccountReady =
      this.profilesManager &&
      this.configGroup.startupConfig.multiAccount?.enabled;
    this.addProfileDialog = multiAccountReady
      ? new AddProfileDialog(this.window, this.profilesManager)
      : null;
    this.manageProfileDialog = multiAccountReady
      ? new ManageProfileDialog(this.window, this.profilesManager)
      : null;
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

    // Phase 1c.2: rebuild the menu when ProfilesManager state changes
    // (add/remove/switch/update) so the Profiles submenu and the active-
    // profile checkmark stay in sync. Listener subscription is gated on
    // the multi-account flag — with the flag off, ProfilesManager events
    // would never fire and the Profiles submenu is not in the template.
    if (
      this.profilesManager &&
      this.configGroup.startupConfig.multiAccount?.enabled
    ) {
      this.#profileChangeHandler = () => this.updateMenu();
      this.profilesManager.on("add", this.#profileChangeHandler);
      this.profilesManager.on("remove", this.#profileChangeHandler);
      this.profilesManager.on("switch", this.#profileChangeHandler);
      this.profilesManager.on("update", this.#profileChangeHandler);

      // Detach the listeners when the window is destroyed so the
      // long-lived ProfilesManager (a process-wide singleton) does not
      // hold references into a stale Menus instance if the window is
      // ever recreated. `once` because the window is destroyed exactly
      // once. Mirrors `ProfileViewManager.initialize`'s `mainWindow.once(
      // 'closed', () => this.dispose())` pattern from PR #2483.
      this.window.once("closed", () => {
        if (this.#profileChangeHandler) {
          this.profilesManager.off("add", this.#profileChangeHandler);
          this.profilesManager.off("remove", this.#profileChangeHandler);
          this.profilesManager.off("switch", this.#profileChangeHandler);
          this.profilesManager.off("update", this.#profileChangeHandler);
          this.#profileChangeHandler = null;
        }
      });
    }

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
      if (this.configGroup.startupConfig.minimizeOnClose) {
        this.window.minimize();
      } else {
        this.hide();
      }
    } else {
      this.tray?.close();
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

  addProfile() {
    this.addProfileDialog?.show();
  }

  manageProfiles() {
    this.manageProfileDialog?.show();
  }

  // Switch the active profile via ProfilesManager. The emitter then fires
  // `switch` and the menu rebuilds via the listener wired in initialize().
  // ProfileViewManager's own listener (in app/mainAppWindow/profileViewManager.js)
  // handles the actual WebContentsView visibility swap.
  switchProfile(id) {
    try {
      this.profilesManager.switch(id);
    } catch (error) {
      console.error("[Menus] switchProfile failed", {
        id,
        message: error.message,
      });
    }
  }

  updateMenu() {
    const menu = appMenu(this);
    this.window.setMenu(Menu.buildFromTemplate([menu]));
    this.tray?.setContextMenu(menu.submenu);

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

  async joinMeetingWithUrl(meetingUrl) {
    try {
      // Validate the incoming URL up front so a parse failure or a
      // non-matching URL falls through to the outer catch rather than
      // ending up assigned raw inside the Teams window.
      const parsed = new URL(meetingUrl);
      if (!this.#isMeetingUrl(meetingUrl)) {
        throw new Error('Not a recognised meeting URL');
      }

      // Snapshot the current Teams URL so the user can jump back after the
      // meeting ends (see #2322). Skip the snapshot if we're already on a
      // meeting URL (e.g. a prior takeover page) so repeat joins don't
      // overwrite the last known good Teams location.
      const currentUrl = this.window.webContents.getURL();
      if (!this.#isMeetingUrl(currentUrl)) {
        this.#preJoinUrl = currentUrl;
      }

      // Navigate inside the loaded Teams SPA (same-origin) so the app shell
      // is preserved when the org allows authenticated join. Only rewrite
      // to the current origin when the current page is actually on a Teams
      // host; otherwise (login page, error page) navigate to the URL as-is.
      const target = this.#isValidTeamsUrl(currentUrl)
        ? new URL(currentUrl).origin + parsed.pathname + parsed.search + parsed.hash
        : parsed.href;
      const script = `window.location.assign(${JSON.stringify(target)});`;
      this.window.show();
      this.window.focus();
      await this.window.webContents.executeJavaScript(script, true);
    } catch {
      // Avoid logging the error object: URL query parameters may contain tokens.
      console.error('[JOIN_MEETING] Failed to navigate to meeting URL');
      dialog.showErrorBox('Error', 'Failed to join meeting. Please check the URL.');
    }
  }

  async returnToTeams() {
    const fallbackUrl = this.configGroup.startupConfig.url;
    const target = this.#isValidTeamsUrl(this.#preJoinUrl)
      ? this.#preJoinUrl
      : fallbackUrl;
    try {
      this.window.show();
      this.window.focus();
      await this.window.webContents.loadURL(target, {
        userAgent: this.configGroup.startupConfig.chromeUserAgent,
      });
    } catch {
      console.error('[RETURN_TO_TEAMS] Navigation failed');
      dialog.showErrorBox('Error', 'Failed to return to Teams.');
    }
  }

  #isMeetingUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const pattern = this.configGroup.startupConfig.meetupJoinRegEx;
    if (!pattern) return false;
    try {
      return new RegExp(pattern).test(url);
    } catch {
      return false;
    }
  }

  #isValidTeamsUrl(url) {
    if (!url || typeof url !== 'string') return false;
    try {
      const { protocol, hostname } = new URL(url);
      return (
        protocol === 'https:' &&
        /(^|\.)teams\.(microsoft\.com|live\.com|cloud\.microsoft)$/.test(hostname)
      );
    } catch {
      return false;
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

    // Fallback: if context menu is empty, show at least "Reload Page" so a menu is always shown
    if (menu.items.length === 0) {
      menu.append(
        new MenuItem({
          label: "Reload Page",
          click: () => menus.window.webContents.reload(),
        })
      );
    }

    menu.popup();
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
    return;
  }

  // If text is selected, allow user to copy it
  if (params.selectionText && params.selectionText.trim() !== "") {
    menu.append(
      new MenuItem({
        role: "copy",
      })
    );
  }

  if (params.linkURL !== "") {
    menu.append(
      new MenuItem({
        label: "Copy Link URL",
        click: () => clipboard.writeText(params.linkURL),
      })
    );

    menu.append(
      new MenuItem({
        label: "Download Attachment & Copy to Clipboard",
        click: () => {
          const activeSession = menus.window.webContents.session;
          const mainWindowUrl = menus.window.webContents.getURL();
          copyAttachmentAsFile(params.linkURL, activeSession, mainWindowUrl);
        },
      })
    );
  }

  addClipboardLinkMenuItem(menu, menus);
}

// Offer to download a link previously copied to the clipboard (e.g. from a
// Teams message menu). Non-editable areas only; checks availableFormats()
// first so the (synchronous) clipboard text read is skipped when the
// clipboard holds no text at all.
function addClipboardLinkMenuItem(menu, menus) {
  try {
    if (!clipboard.availableFormats().includes("text/plain")) {
      return;
    }
    const clipboardText = clipboard.readText().trim();
    if (!clipboardText.startsWith("http://") && !clipboardText.startsWith("https://")) {
      return;
    }
    if (menu.items.length > 0) {
      menu.append(
        new MenuItem({
          type: "separator",
        })
      );
    }
    menu.append(
      new MenuItem({
        label: "Download File from Clipboard Link",
        click: () => {
          const activeSession = menus.window.webContents.session;
          const mainWindowUrl = menus.window.webContents.getURL();
          copyAttachmentAsFile(clipboardText, activeSession, mainWindowUrl);
        },
      })
    );
  } catch (error) {
    console.debug("[Menus] Could not inspect clipboard for link download", error?.message);
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

// Microsoft 365 / SharePoint / OneDrive hosts get the hidden-window download
// treatment (they need the authenticated session and viewer redirects).
// Suffix matching only — a substring test would also match lookalike hosts
// like "mymicrosoft.evil.com". "mcas.ms" covers Defender for Cloud Apps
// proxied hosts ("contoso.sharepoint.com.<region>.mcas.ms").
const MS_HOST_SUFFIXES = [
  "sharepoint.com",
  "sharepoint-df.com",
  "officeapps.live.com",
  "office.com",
  "office.net",
  "microsoft.com",
  "onedrive.com",
  "1drv.ms",
  "svc.ms",
  "mcas.ms",
];

function isMicrosoftHost(urlStr) {
  try {
    const url = new URL(urlStr);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return false;
    }
    const host = url.hostname.toLowerCase();
    return MS_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith("." + suffix));
  } catch {
    return false;
  }
}

// Strip any path components from a filename coming from an untrusted source
// (Content-Disposition header, page title, URL path) so it can never escape
// the target directory.
function sanitizeFilename(candidate, fallback = "attachment") {
  if (typeof candidate !== "string") {
    return fallback;
  }
  const base = path.basename(candidate.replaceAll("\\", "/")).trim();
  if (!base || base === "." || base === "..") {
    return fallback;
  }
  return base;
}

// Mirror Chromium's "name (1).ext" de-duplication for direct writes into
// Teams-Downloads, so an existing file is never silently overwritten.
function uniqueFilePath(directory, filename) {
  const ext = path.extname(filename);
  const stem = path.basename(filename, ext);
  let candidate = path.join(directory, filename);
  for (let i = 1; fs.existsSync(candidate); i++) {
    candidate = path.join(directory, `${stem} (${i})${ext}`);
  }
  return candidate;
}

// Strip the viewer suffix from a page title ("notes.txt - SharePoint" →
// "notes.txt"). Plain string operations instead of regexes: the title is
// page-controlled and the previous /\s+-\s+…$/ patterns were flagged as
// backtracking-prone (Sonar S5852).
const VIEWER_TITLE_SUFFIXES = new Set(["sharepoint", "onedrive", "microsoft 365"]);

function stripViewerTitleSuffix(title) {
  const trimmed = title.trim();
  const idx = trimmed.lastIndexOf(" - ");
  if (idx > 0) {
    const suffix = trimmed.slice(idx + 3).trim().toLowerCase();
    if (VIEWER_TITLE_SUFFIXES.has(suffix)) {
      return trimmed.slice(0, idx).trim();
    }
  }
  return trimmed;
}

// Electron's clipboard.write() has no cross-platform "file" type (an unknown
// key like `filenames` is silently ignored), so write the platform-native
// format that file managers actually paste from.
function copyFilePathToClipboard(filePath) {
  try {
    if (process.platform === "darwin") {
      const escaped = filePath
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
      const plist =
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">' +
        `<plist version="1.0"><array><string>${escaped}</string></array></plist>`;
      clipboard.writeBuffer("NSFilenamesPboardType", Buffer.from(plist));
    } else if (process.platform === "linux") {
      const uri = pathToFileURL(filePath).toString();
      clipboard.writeBuffer("text/uri-list", Buffer.from(uri + "\n"));
    } else {
      clipboard.writeText(filePath);
    }
  } catch (error) {
    console.warn("[CopyAttachment] Could not place file on clipboard", {
      message: error?.message,
    });
  }
}

function getDirectDownloadUrl(urlStr) {
  try {
    if (isMicrosoftHost(urlStr)) {
      const url = new URL(urlStr);
      if (!url.searchParams.has("download")) {
        url.searchParams.set("download", "1");
        return url.toString();
      }
    }
  } catch {
    // ignore
  }
  return urlStr;
}

async function copyAttachmentAsFile(linkURL, session, mainWindowUrl = "") {
  const progressNotification = new Notification({
    title: "Downloading attachment...",
    body: "Downloading attachment in the background...",
    silent: true,
  });
  progressNotification.show();

  try {
    let downloadURL = getDirectDownloadUrl(linkURL);
    
    // Convert direct path view URLs to direct layout download URLs if possible
    const spDownloadURL = getSharePointDownloadUrl(downloadURL);
    if (spDownloadURL) {
      downloadURL = spDownloadURL;
    }

    // Apply corporate MCAS proxy if active
    if (mainWindowUrl) {
      downloadURL = applyMcasProxy(downloadURL, mainWindowUrl);
    }
    
    const isMS = isMicrosoftHost(downloadURL);

    let result;
    if (isMS) {
      if (isTextFile(downloadURL)) {
        // Load the viewer URL instead of direct download, so Monaco editor renders
        let viewerURL = linkURL;
        if (mainWindowUrl) {
          viewerURL = applyMcasProxy(viewerURL, mainWindowUrl);
        }
        result = await extractTextFromBrowserWindow(viewerURL, session);
      } else {
        result = await downloadWithBrowserWindow(downloadURL, session);
      }
    } else {
      const response = await session.fetch(downloadURL);
      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status} ${response.statusText}`);
      }

      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("text/html")) {
        if (isTextFile(downloadURL)) {
          let viewerURL = linkURL;
          if (mainWindowUrl) {
            viewerURL = applyMcasProxy(viewerURL, mainWindowUrl);
          }
          result = await extractTextFromBrowserWindow(viewerURL, session);
        } else {
          result = await downloadWithBrowserWindow(downloadURL, session);
        }
      } else {
        let filename = "attachment";
        const contentDisposition = response.headers.get("content-disposition");
        if (contentDisposition) {
          const match = contentDisposition.match(/filename\*?=["']?(?:UTF-8'')?([^;"']+)["']?/i);
          if (match && match[1]) {
            filename = decodeURIComponent(match[1]);
          } else {
            const fallbackMatch = contentDisposition.match(/filename=["']?([^;"']+)["']?/i);
            if (fallbackMatch && fallbackMatch[1]) {
              filename = fallbackMatch[1];
            }
          }
        } else {
          try {
            const urlObj = new URL(linkURL);
            const pathname = urlObj.pathname;
            const lastPart = pathname.substring(pathname.lastIndexOf('/') + 1);
            if (lastPart) {
              filename = decodeURIComponent(lastPart);
            }
          } catch (e) {
            // ignore
          }
        }

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const documentsDir = path.join(app.getPath("documents"), "Teams-Downloads");
        fs.mkdirSync(documentsDir, { recursive: true });
        // The filename came from a server header or URL — never let it carry
        // path segments out of the target directory.
        filename = sanitizeFilename(filename);
        const targetFilePath = uniqueFilePath(documentsDir, filename);
        fs.writeFileSync(targetFilePath, buffer);

        copyFilePathToClipboard(targetFilePath);
        result = { filename: path.basename(targetFilePath), targetFilePath };
      }
    }

    const successNotification = new Notification({
      title: "Downloaded & Copied!",
      body: `Saved to Documents/Teams-Downloads/${result.filename} and copied to clipboard.`,
    });
    successNotification.show();
  } catch (error) {
    // Log the message only — the full error can embed the download URL.
    console.error("[CopyAttachment] Error:", error?.message);
    const errorNotification = new Notification({
      title: "Download Error",
      body: `Failed to save attachment: ${error.message}`,
    });
    errorNotification.show();
  } finally {
    // Always dismiss the progress toast, also when the download failed.
    progressNotification.close();
  }
}

function isTextFile(urlStr) {
  try {
    const url = new URL(urlStr);
    const pathname = url.pathname;
    
    if (pathname.includes("/:t:/")) {
      return true;
    }
    
    const lastPart = pathname.substring(pathname.lastIndexOf('/') + 1);
    const extMatch = lastPart.match(/\.([a-zA-Z0-9]+)$/);
    if (extMatch) {
      const ext = extMatch[1].toLowerCase();
      const TEXT_EXTENSIONS = [
        "txt", "json", "csv", "log", "xml", "html", "htm", "css", "js", "ts",
        "py", "sh", "bat", "ps1", "yml", "yaml", "md", "ini", "conf", "sql"
      ];
      return TEXT_EXTENSIONS.includes(ext);
    }
  } catch (e) {
    // ignore
  }
  return false;
}

function extractTextFromBrowserWindow(downloadURL, activeSession) {
  return new Promise((resolve, reject) => {
    // The window shares the authenticated Teams session, so the renderer must
    // stay fully locked down: same-origin policy, context isolation, and the
    // sandbox all enabled. executeJavaScript still works with all of these.
    const tempWin = new BrowserWindow({
      show: false,
      width: 800,
      height: 600,
      webPreferences: {
        session: activeSession,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        backgroundThrottling: false,
        webSecurity: true,
      },
    });

    const cleanUserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
    tempWin.webContents.setUserAgent(cleanUserAgent);


    const documentsDir = path.join(app.getPath("documents"), "Teams-Downloads");
    fs.mkdirSync(documentsDir, { recursive: true });

    let resolved = false;
    let cleanupTimeout;

    const cleanup = () => {
      if (cleanupTimeout) {
        clearTimeout(cleanupTimeout);
      }
      if (!tempWin.isDestroyed()) {
        tempWin.destroy();
      }
    };

    cleanupTimeout = setTimeout(() => {
      if (!resolved) {
        cleanup();
        reject(new Error("Text extraction timed out (30 seconds)"));
      }
    }, 30000);

    tempWin.webContents.on("did-finish-load", async () => {
      try {
        let pageInfo = { success: false };
        for (let i = 0; i < 40; i++) {
          if (tempWin.isDestroyed()) return;
          
          pageInfo = await tempWin.webContents.executeJavaScript(`
            (function() {
              let textVal = "";
              let found = false;
              
              try {
                if (typeof monaco !== 'undefined' && monaco.editor) {
                  const models = monaco.editor.getModels();
                  if (models && models.length > 0) {
                    const val = models[0].getValue();
                    if (val) {
                      textVal = val;
                      found = true;
                    }
                  }
                }
              } catch (e) {}
              
              if (!found) {
                try {
                  const pre = document.querySelector('pre');
                  if (pre && pre.innerText && pre.innerText.trim().length > 0) {
                    textVal = pre.innerText;
                    found = true;
                  }
                } catch (e) {}
              }
              
              if (!found) {
                try {
                  const container = document.querySelector('.text-container') || document.querySelector('.file-viewer');
                  if (container && container.innerText && container.innerText.trim().length > 0) {
                    textVal = container.innerText;
                    found = true;
                  }
                } catch (e) {}
              }
              
              if (found) {
                return { success: true, text: textVal, title: document.title };
              }
              
              return { success: false };
            })()
          `);

          if (pageInfo && pageInfo.success) {
            break;
          }
          await new Promise(r => setTimeout(r, 500));
        }

        if (pageInfo && pageInfo.success) {
          let filename = stripViewerTitleSuffix(pageInfo.title || "attachment.txt");
          // The title is page-controlled — strip any path segments before
          // building the save path.
          filename = sanitizeFilename(filename, "attachment.txt");
          if (!filename.includes(".")) {
            filename += ".txt";
          }

          const targetFilePath = uniqueFilePath(documentsDir, filename);
          fs.writeFileSync(targetFilePath, pageInfo.text, "utf8");

          // Copy the extracted text; a file reference would overwrite it
          // (the clipboard holds one payload at a time).
          clipboard.writeText(pageInfo.text);

          resolved = true;
          cleanup();
          resolve({ filename: path.basename(targetFilePath), targetFilePath });
        }
      } catch (e) {
        console.error("[TextExtract] Error during extraction:", e?.message);
        // Settle now instead of leaving the caller to hit the 30s timeout
        // (or hang forever once `resolved` is set).
        if (!resolved) {
          resolved = true;
          cleanup();
          reject(e);
        }
      }
    });

    tempWin.loadURL(downloadURL).catch((err) => {
      setTimeout(() => {
        if (!resolved) {
          cleanup();
          reject(new Error(`Failed to load URL: ${err.message}`));
        }
      }, 500);
    });
  });
}

function getSharePointDownloadUrl(urlStr) {
  try {
    const url = new URL(urlStr);
    const host = url.hostname.toLowerCase();
    
    // Only target SharePoint and OneDrive domains
    if (host.includes("sharepoint.com") || host.includes("onedrive.com") || host.includes("mcas.ms")) {
      const pathname = url.pathname;
      // Match viewer prefix: /:x:/r/ or /:w:/g/ etc. (supporting sites or personal)
      const viewerRegex = /^\/:[a-z]:\/[rg]\/(personal|sites)\/([^\/]+)\/(.+)$/i;
      const match = pathname.match(viewerRegex);
      
      if (match) {
        const filePath = match[3];
        // Only convert if the file path has a standard file extension
        const hasExtension = /\.[a-zA-Z0-9]{2,5}$/.test(filePath);
        if (hasExtension) {
          const type = match[1];
          const ownerOrSite = match[2];
          
          const directPath = `${url.origin}/${type}/${ownerOrSite}/${filePath}`;
          const siteRoot = `${url.origin}/${type}/${ownerOrSite}`;
          
          const downloadUrl = new URL(`${siteRoot}/_layouts/15/download.aspx`);
          downloadUrl.searchParams.set("SourceUrl", directPath);
          return downloadUrl.toString();
        }
      }
    }
  } catch (e) {
    // ignore
  }
  return null;
}

function applyMcasProxy(urlStr, mainWindowUrl) {
  try {
    const mainUrl = new URL(mainWindowUrl);
    if (mainUrl.hostname.endsWith(".mcas.ms")) {
      const targetUrl = new URL(urlStr);
      const origHost = targetUrl.hostname;
      if (!origHost.endsWith(".mcas.ms")) {
        const proxiedHost = origHost + ".mcas.ms";
        // String replace to rewrite both the main domain and any URL-encoded SourceUrl domains
        return urlStr.replaceAll(origHost, proxiedHost);
      }
    }
  } catch (e) {
    // ignore
  }
  return urlStr;
}

function downloadWithBrowserWindow(downloadURL, activeSession) {
  return new Promise((resolve, reject) => {
    // The window shares the authenticated Teams session, so the renderer must
    // stay fully locked down: same-origin policy, context isolation, and the
    // sandbox all enabled.
    const tempWin = new BrowserWindow({
      show: false,
      width: 800,
      height: 600,
      webPreferences: {
        session: activeSession,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        backgroundThrottling: false,
        webSecurity: true,
      },
    });

    const cleanUserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
    tempWin.webContents.setUserAgent(cleanUserAgent);

    const documentsDir = path.join(app.getPath("documents"), "Teams-Downloads");
    fs.mkdirSync(documentsDir, { recursive: true });

    let downloadInitiated = false;
    let settled = false;
    let cleanupTimeout;

    const cleanup = () => {
      if (cleanupTimeout) {
        clearTimeout(cleanupTimeout);
        cleanupTimeout = null;
      }
      activeSession.removeListener("will-download", handleWillDownload);
      if (!tempWin.isDestroyed()) {
        tempWin.destroy();
      }
    };

    const fail = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    cleanupTimeout = setTimeout(() => {
      fail(new Error("Download timed out (no download started within 30 seconds)"));
    }, 30000);

    const handleWillDownload = (event, item, webContents) => {
      if (webContents && webContents.id === tempWin.webContents.id) {
        downloadInitiated = true;
        // The navigation did its job; give the transfer itself a longer
        // backstop so a stalled download can't leak the hidden window and
        // the session listener forever.
        if (cleanupTimeout) {
          clearTimeout(cleanupTimeout);
        }
        cleanupTimeout = setTimeout(() => {
          fail(new Error("Download timed out"));
        }, 10 * 60 * 1000);

        // Tell DownloadManager (which listens on the same session) to skip
        // its own save path, notifications and openWhenDone for this item.
        item.teamsForLinuxExternallyManaged = true;

        const filename = sanitizeFilename(item.getFilename(), "attachment");
        const targetFilePath = uniqueFilePath(documentsDir, filename);

        item.setSavePath(targetFilePath);

        // A transient "interrupted" in `updated` can auto-resume; only the
        // final state in `done` decides the outcome.
        item.once("done", (event, state) => {
          if (settled) return;
          settled = true;
          cleanup();
          if (state === "completed") {
            copyFilePathToClipboard(targetFilePath);
            resolve({ filename: path.basename(targetFilePath), targetFilePath });
          } else {
            reject(new Error(`Download failed with state: ${state}`));
          }
        });
      }
    };

    activeSession.on("will-download", handleWillDownload);

    tempWin.loadURL(downloadURL).catch((err) => {
      setTimeout(() => {
        if (!downloadInitiated) {
          fail(new Error(`Failed to load URL: ${err.message}`));
        }
      }, 500);
    });
  });
}

exports = module.exports = Menus;
