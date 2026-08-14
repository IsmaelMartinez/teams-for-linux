const { app, ipcMain } = require("electron");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const path = require("node:path");
const registry = require("./registry");
const launcher = require("./launcher");
const identity = require("./identity");

/**
 * ConcurrentAccountsManager — separate-process accounts with a hard cap of 3
 * (ADR-027). Each account is a full Electron instance with its own
 * `--user-data-dir`, so sessions, trays, notifications, and calls stay
 * isolated. This is not the ADR-020 in-window switcher.
 */
class ConcurrentAccountsManager {
  #userDataDir;
  #homeUserDataDir;
  #config;
  #spawnFn;
  #emitter = new EventEmitter();
  #initialized = false;

  constructor({ userDataDir, config, spawnFn } = {}) {
    this.#userDataDir = userDataDir;
    this.#config = config || {};
    this.#spawnFn = spawnFn;
    this.#homeUserDataDir =
      registry.readFamilyMarker(userDataDir) || userDataDir;
  }

  on(event, handler) {
    this.#emitter.on(event, handler);
  }

  off(event, handler) {
    this.#emitter.off(event, handler);
  }

  get homeUserDataDir() {
    return this.#homeUserDataDir;
  }

  get currentUserDataDir() {
    return this.#userDataDir;
  }

  isEnabled() {
    return this.#config.instances?.enabled !== false;
  }

  initialize() {
    if (this.#initialized) return;
    this.#initialized = true;

    try {
      registry.writePid(this.#userDataDir, process.pid);
    } catch (error) {
      console.warn("[ConcurrentAccounts] Failed to write instance pid", {
        message: error.message,
      });
    }

    // List configured accounts (home plus extras). Used by the Manage dialog.
    ipcMain.handle("account-list", async () => this.list());
    // Return the account matching this process's userData directory.
    ipcMain.handle("account-get-current", async () => this.getCurrent());
    // Signed-in email discovered in the Teams renderer. Used to replace the
    // "This account" placeholder. Payload is validated; never logged.
    ipcMain.on("account-report-identity", (_event, value) => {
      this.reportIdentity(value);
    });

    if (
      this.isEnabled() &&
      this.#config.instances?.autoLaunch !== false &&
      !launcher.shouldSkipAutoLaunch()
    ) {
      this.launchOthers();
    }
  }

  dispose() {
    if (!this.#initialized) return;
    registry.clearPid(this.#userDataDir);
    this.#initialized = false;
  }

  list() {
    const data = registry.loadRegistry(this.#homeUserDataDir);
    if (data.accounts.length === 0) {
      return [this.#decorate(this.#syntheticHome())];
    }
    return data.accounts.map((account) => this.#decorate(account));
  }

  getCurrent() {
    return (
      this.list().find((account) =>
        registry.samePath(account.userDataDir, this.#userDataDir)
      ) || this.#decorate(this.#syntheticHome())
    );
  }

  isAtCap() {
    return this.list().length >= registry.MAX_ACCOUNTS;
  }

  add({ name }) {
    const data = registry.loadRegistry(this.#homeUserDataDir);
    registry.ensureHome(data, this.#homeUserDataDir, {
      name: identity.PLACEHOLDER_NAME,
      wmClass: this.#config.class || "teams-for-linux",
      appTitle: this.#config.appTitle,
    });
    const account = registry.addAccount(data, {
      name,
      homeUserDataDir: this.#homeUserDataDir,
    });
    registry.saveRegistry(this.#homeUserDataDir, data);
    try {
      registry.writeFamilyMarker(account.userDataDir, this.#homeUserDataDir);
    } catch (error) {
      console.warn("[ConcurrentAccounts] Failed to write family marker", {
        message: error.message,
      });
    }
    this.#emitter.emit("add", this.#decorate(account));
    this.launch(account.id);
    return this.#decorate(account);
  }

  update(id, patch) {
    const data = registry.loadRegistry(this.#homeUserDataDir);
    const account = registry.updateAccount(data, id, patch);
    registry.saveRegistry(this.#homeUserDataDir, data);
    const decorated = this.#decorate(account);
    this.#emitter.emit("update", decorated);
    return decorated;
  }

  remove(id) {
    const data = registry.loadRegistry(this.#homeUserDataDir);
    const account = data.accounts.find((entry) => entry.id === id);
    if (!account) {
      throw new Error("[ConcurrentAccounts] Unknown account.");
    }
    if (registry.samePath(account.userDataDir, this.#userDataDir)) {
      throw new Error(
        "[ConcurrentAccounts] Cannot remove the account that is currently running."
      );
    }
    if (registry.isAccountRunning(account.userDataDir)) {
      throw new Error(
        "[ConcurrentAccounts] Quit that account first, then remove it."
      );
    }
    const removed = registry.removeAccount(data, id);
    registry.saveRegistry(this.#homeUserDataDir, data);
    if (!removed.isHome) {
      this.#deleteUserDataDir(removed.userDataDir);
    }
    this.#emitter.emit("remove", { removedId: removed.id });
    return { removedId: removed.id };
  }

  launch(id) {
    const account = this.list().find((entry) => entry.id === id);
    if (!account) {
      throw new Error("[ConcurrentAccounts] Unknown account.");
    }
    if (registry.samePath(account.userDataDir, this.#userDataDir)) {
      return { alreadyCurrent: true };
    }
    this.#spawn(account);
    return { spawned: true };
  }

  launchOthers() {
    const current = this.getCurrent();
    for (const account of this.list()) {
      if (account.id === current.id) continue;
      try {
        this.#spawn(account);
      } catch (error) {
        console.warn("[ConcurrentAccounts] Failed to launch sibling account", {
          message: error.message,
        });
      }
    }
  }

  reportIdentity(raw) {
    const value = identity.normalizeIdentity(raw);
    if (!value) return;
    const data = registry.loadRegistry(this.#homeUserDataDir);
    registry.ensureHome(data, this.#homeUserDataDir, {
      name: identity.PLACEHOLDER_NAME,
      wmClass: this.#config.class || "teams-for-linux",
      appTitle: this.#config.appTitle,
    });
    const account = data.accounts.find((entry) =>
      registry.samePath(entry.userDataDir, this.#userDataDir)
    );
    if (!account) return;
    if (account.identity === value) return;
    account.identity = value;
    registry.saveRegistry(this.#homeUserDataDir, data);
    this.#emitter.emit("update", this.#decorate(account));
  }

  #syntheticHome() {
    return {
      id: registry.HOME_ID,
      name: identity.PLACEHOLDER_NAME,
      userDataDir: this.#userDataDir,
      class: this.#config.class || "teams-for-linux",
      appTitle: this.#config.appTitle || "Microsoft Teams",
      isHome: true,
    };
  }

  #decorate(account) {
    return {
      ...account,
      label: identity.pickLabel(account),
      isCurrent: registry.samePath(account.userDataDir, this.#userDataDir),
      isRunning: registry.samePath(account.userDataDir, this.#userDataDir)
        ? true
        : registry.isAccountRunning(account.userDataDir),
    };
  }

  #spawn(account) {
    const plan = launcher.buildLaunchPlan({
      isPackaged: app.isPackaged,
      execPath: process.execPath,
      appPath: app.getAppPath(),
      appImage: process.env.APPIMAGE,
      userDataDir: account.userDataDir,
      wmClass: account.class,
      appTitle: account.appTitle,
    });
    launcher.spawnInstance(plan, this.#spawnFn);
    console.info("[ConcurrentAccounts] Launched account instance", {
      id: account.id,
    });
  }

  #deleteUserDataDir(userDataDir) {
    const root = registry.getInstancesRoot(this.#homeUserDataDir);
    const resolved = path.resolve(userDataDir);
    if (!resolved.startsWith(path.resolve(root) + path.sep)) {
      console.warn(
        "[ConcurrentAccounts] Refusing to delete userData outside the instances root"
      );
      return;
    }
    fs.rmSync(resolved, { recursive: true, force: true });
  }
}

module.exports = ConcurrentAccountsManager;
module.exports.MAX_ACCOUNTS = registry.MAX_ACCOUNTS;
module.exports.HOME_ID = registry.HOME_ID;
