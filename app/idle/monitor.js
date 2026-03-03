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
    console.info('--------------------------------------------------  IDLE INIT -------------------------');
    ipcMain.handle("get-system-idle-state", this.#handleGetSystemIdleState.bind(this));
  }

  async #handleGetSystemIdleState() {

    console.info('----- GET IDLE STATE -----');

    // If forceIdleState is enabled, always return idle
    if (this.#config.forceIdleState) {
      console.info('[IDLE] Force idle mode enabled - always reporting idle state');
      
      // Set userIdle status on first transition if not already set
      if (this.#idleTimeUserStatus === -1) {
        this.#idleTimeUserStatus = this.#getUserStatus();
        console.debug(`[IDLE] Force idle: capturing user status at idle transition: ${this.#idleTimeUserStatus}`);
      }
      
      return {
        system: "idle",
        userIdle: this.#idleTimeUserStatus,
        userCurrent: this.#getUserStatus(),
      };
    }

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

    if (systemIdleState === "active") {
      if (this.#idleTimeUserStatus !== -1) {
        console.debug(`GetSystemIdleState => ${logDetails()}`);
        this.#idleTimeUserStatus = -1;
      }
    } else if (this.#idleTimeUserStatus === -1) {
      console.debug(`GetSystemIdleState => ${logDetails()}`);
      this.#idleTimeUserStatus = this.#getUserStatus();
    }

    return {
      system: systemIdleState,
      userIdle: this.#idleTimeUserStatus,
      userCurrent: this.#getUserStatus(),
    };
  }
}

module.exports = IdleMonitor;
