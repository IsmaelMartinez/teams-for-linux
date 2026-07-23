const TEAMS_HOSTS = ["teams.cloud.microsoft", "teams.microsoft.com", "teams.live.com"];
const isTeamsHost = (hostname) => {
  if (hostname.endsWith(".mcas.ms")) {
    hostname = hostname.slice(0, -".mcas.ms".length);
  }
  return TEAMS_HOSTS.some(
    (domain) =>
      hostname === domain ||
      (hostname.endsWith("." + domain) &&
        !hostname.slice(0, -(domain.length + 1)).includes(".")),
  );
};
// Substrings that mark an auth/token key. Auth keys are never persisted/restored.
const AUTH_KEY_PATTERNS = [
  "tmp.auth.v1.", "refresh_token", "msal.", "EncryptionKey", "authSessionId",
  "LogoutState", "accessToken", "idtoken", "Account", "Authority", "ClientInfo",
  "secure_teams_",
];
function isAuthKey(key) {
  return AUTH_KEY_PATTERNS.some((pattern) => key.includes(pattern));
}

class LocalStoragePersistence {
  #ipcRenderer;
  #partition = "";
  #saved = {};
  #saveTimer = null;
  #dirty = false;

  init(config, ipcRenderer) {
    this.#ipcRenderer = ipcRenderer;
    this.#partition = typeof config?.partition === "string" ? config.partition : "";

    if (!this.#ipcRenderer) {
      return;
    }

    // Only run on the Teams host (post-login)
    if (!isTeamsHost(globalThis.location?.hostname || "")) {
      console.debug("[LS_PERSIST] Not a Teams host; skipping", {
        host: globalThis.location?.hostname,
      });
      return;
    }

    this.#start().catch((err) => {
      console.error("[LS_PERSIST] Failed to start:", err?.message ?? err);
    });
  }

  async #start() {
    // https://stackoverflow.com/a/43634169/15060496
    const originalSetItem = localStorage.setItem;
    let self = this;
    localStorage.setItem = function(key, value) {
      originalSetItem.apply(this, arguments);
      self.#handleSetItem()
    };
  }

  #handleSetItem() {
    let length = 0;
    try {
      length = localStorage.length;
    } catch {
      // localStorage can throw if access is denied for the origin
      return;
    }
    for (let i = 0; i < length; i++) {
      const key = localStorage.key(i);
      // Never save auth keys
      if (!key || isAuthKey(key)) {
        continue;
      }
      const value = localStorage.getItem(key);
      if (value !== null && this.#saved[key] !== value) {
        this.#saved[key] = value;
        this.#dirty = true;
      }
    }
    if(this.#dirty){
      // Wait some seconds to not spam disk
      if (this.#saveTimer) {
        return;
      }
      this.#saveTimer = setTimeout(() => {
        this.#saveTimer = null;
        this.#flush();
      }, 10000);
    }
  }

  #flush() {
    if (!this.#dirty) {
      return;
    }
    this.#dirty = false;
    try {
      this.#ipcRenderer.send("save-persisted-localstorage", {
        partition: this.#partition,
        entries: this.#saved,
      });
    } catch (err) {
      console.warn("[LS_PERSIST] Failed to persist snapshot:", err?.message ?? err);
    }
  }
}

module.exports = new LocalStoragePersistence();
