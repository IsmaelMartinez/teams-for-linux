const { ipcMain, powerMonitor } = require("electron");

class IdleMonitor {
  #config;
  #getUserStatus;
  #idleTimeUserStatus = -1;

  constructor(config, getUserStatus) {
    this.#config = config;
    this.#getUserStatus = getUserStatus;
  }

  initialize() {
    ipcMain.handle("get-system-idle-state", this.#handleGetSystemIdleState.bind(this));
  }

  async #handleGetSystemIdleState() {
    const systemIdleState = powerMonitor.getSystemIdleState(
      this.#config.appIdleTimeout
    );

    if (systemIdleState !== "active" && this.#idleTimeUserStatus === -1) {
      console.debug(
        `GetSystemIdleState => IdleTimeout: ${
          this.#config.appIdleTimeout
        }s, IdleTimeoutPollInterval: ${
          this.#config.appIdleTimeoutCheckInterval
        }s, ActiveCheckPollInterval: ${
          this.#config.appActiveCheckInterval
        }s, IdleTime: ${powerMonitor.getSystemIdleTime()}s, IdleState: '${systemIdleState}'`
      );
      this.#idleTimeUserStatus = this.#getUserStatus();
    }

    const state = {
      system: systemIdleState,
      userIdle: this.#idleTimeUserStatus,
      userCurrent: this.#getUserStatus(),
    };

    if (systemIdleState === "active") {
      console.debug(
        `GetSystemIdleState => IdleTimeout: ${
          this.#config.appIdleTimeout
        }s, IdleTimeoutPollInterval: ${
          this.#config.appIdleTimeoutCheckInterval
        }s, ActiveCheckPollInterval: ${
          this.#config.appActiveCheckInterval
        }s, IdleTime: ${powerMonitor.getSystemIdleTime()}s, IdleState: '${systemIdleState}'`
      );
      this.#idleTimeUserStatus = -1;
    }

    return state;
  }
}

module.exports = IdleMonitor;
