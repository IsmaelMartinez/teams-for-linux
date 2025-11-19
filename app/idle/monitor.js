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
    // Get system idle state to sync with Teams presence
    ipcMain.handle("get-system-idle-state", this.#handleGetSystemIdleState.bind(this));
  }

  async #handleGetSystemIdleState() {
    const systemIdleState = powerMonitor.getSystemIdleState(
      this.#config.appIdleTimeout
    );

    const logDetails = () => `IdleTimeout: ${
        this.#config.appIdleTimeout
      }s, IdleTimeoutPollInterval: ${
        this.#config.appIdleTimeoutCheckInterval
      }s, ActiveCheckPollInterval: ${
        this.#config.appActiveCheckInterval
      }s, IdleTime: ${powerMonitor.getSystemIdleTime()}s, IdleState: '${systemIdleState}'`;

    if (systemIdleState !== "active") {
      if (this.#idleTimeUserStatus === -1) {
        console.debug(`GetSystemIdleState => ${logDetails()}`);
        this.#idleTimeUserStatus = this.#getUserStatus();
      }
    } else {
      if (this.#idleTimeUserStatus !== -1) {
        console.debug(`GetSystemIdleState => ${logDetails()}`);
        this.#idleTimeUserStatus = -1;
      }
    }

    return {
      system: systemIdleState,
      userIdle: this.#idleTimeUserStatus,
      userCurrent: this.#getUserStatus(),
    };
  }
}

module.exports = IdleMonitor;
