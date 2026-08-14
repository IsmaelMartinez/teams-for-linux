const identity = require("../../concurrentAccounts/identity");
const ReactHandler = require("./reactHandler");

/**
 * Discovers the signed-in Microsoft account (email) after Teams loads and
 * tells the main process so the Accounts UI can replace the "This account"
 * placeholder. The email is never logged.
 */
class AccountIdentity {
  init(config, ipcRenderer) {
    if (config.instances?.enabled === false) return;
    this.ipcRenderer = ipcRenderer;
    this.reported = null;
    this.attempts = 0;
    this.timer = setInterval(() => this.#tick(), 3000);
    this.#tick();
  }

  #stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  #tick() {
    this.attempts += 1;
    const value = this.#discover();
    if (value && value !== this.reported) {
      this.reported = value;
      this.ipcRenderer.send("account-report-identity", value);
      this.#stop();
      return;
    }
    if (this.attempts >= 40) {
      this.#stop();
    }
  }

  #discover() {
    return (
      this.#fromReact() ||
      this.#fromWebStorage(globalThis.localStorage) ||
      this.#fromWebStorage(globalThis.sessionStorage)
    );
  }

  #fromReact() {
    try {
      const core = ReactHandler._getTeams2CoreServices?.();
      if (!core) return null;
      const auth = core.authenticationService?._coreAuthService;
      const candidates = [
        auth?._authProvider?.account,
        auth?._account,
        core.user,
      ];
      for (const candidate of candidates) {
        const found = identity.identityFromUnknown(candidate);
        if (found) return found;
      }
    } catch {
      // Teams internals are best-effort.
    }
    return null;
  }

  #fromWebStorage(storage) {
    if (!storage || typeof storage.length !== "number") return null;
    const keys = [];
    try {
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key) keys.push(key);
      }
    } catch {
      return null;
    }
    return identity.identityFromStorage((k) => storage.getItem(k), keys);
  }
}

module.exports = new AccountIdentity();
