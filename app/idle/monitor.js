const { ipcMain, powerMonitor } = require("electron");

/**
 * IdleMonitor
 *
 * Monitors system idle state for Teams for Linux.
 * This service is responsible for:
 * - Tracking system idle state via powerMonitor
 * - Maintaining user idle state and user status correlation
 * - Providing IPC handlers for idle state queries
 *
 * Dependencies are injected to improve testability and break coupling with global state.
 */
class IdleMonitor {
  #config;
  #getUserStatus; // Injected function to get current user status
  #idleTimeUserStatus = -1;

  /**
   * Create an IdleMonitor
   *
   * @param {Object} config - Application configuration object
   * @param {Function} getUserStatus - Function that returns current user status
   */
  constructor(config, getUserStatus) {
    this.#config = config;
    this.#getUserStatus = getUserStatus;
  }

  /**
   * Register IPC handlers for idle monitoring
   * Call this method after instantiation to set up IPC communication
   */
  initialize() {
    ipcMain.handle("get-system-idle-state", this.#handleGetSystemIdleState.bind(this));
  }

  /**
   * IPC handler for getting system idle state
   * Returns system idle state, user idle status, and current user status
   * @private
   */
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
