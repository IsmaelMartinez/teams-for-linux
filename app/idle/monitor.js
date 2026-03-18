const { ipcMain, powerMonitor } = require("electron");
const fs = require("fs");

class IdleMonitor {
  #config;
  #getUserStatus;
  #idleTimeUserStatus = -1;
  #stateFilePath;
  #lastStateFileOverride = null;

  constructor(config, getUserStatus) {
    this.#config = config;
    this.#getUserStatus = getUserStatus;
    // Expand $USER in the state file path
    const stateFilePath = config.idleDetection?.stateFile || "/tmp/teams-for-linux-idle-state-$USER";
    this.#stateFilePath = stateFilePath.replace('$USER', process.env.USER);
  }

  initialize() {
    // Get system idle state to sync with Teams presence
    ipcMain.handle("get-system-idle-state", this.#handleGetSystemIdleState.bind(this));
    
    // Setup cleanup handler for state file
    process.on('exit', this.#cleanupStateFile.bind(this));
    process.on('SIGINT', () => {
      this.#cleanupStateFile();
      process.exit(0);
    });
    process.on('SIGTERM', () => {
      this.#cleanupStateFile();
      process.exit(0);
    });
  }

  #cleanupStateFile() {
    if (this.#config.idleDetection?.forceState) {
      try {
        if (fs.existsSync(this.#stateFilePath)) {
          fs.unlinkSync(this.#stateFilePath);
          console.debug('[IDLE] Cleaned up state file on exit');
        }
      } catch (err) {
        // Ignore cleanup errors
      }
    }
  }

  #getStateFileOverride() {
    try {
      if (fs.existsSync(this.#stateFilePath)) {
        const content = fs.readFileSync(this.#stateFilePath, 'utf8').trim();
        
        if (content === 'inactive') {
          return 'idle';
        } else if (content === 'active') {
          return 'active';
        } else {
          console.warn(`[IDLE] Unknown state file content: '${content}', ignoring`);
          return null;
        }
      }
    } catch (err) {
      console.warn(`[IDLE] Failed to read state file: ${err.message}`);
    }
    
    return null; // No override
  }

  async #handleGetSystemIdleState() {

    // If forceState is enabled, check state file for override
    if (this.#config.idleDetection?.forceState) {
      const stateFileOverride = this.#getStateFileOverride();
      
      // Log only on state transitions
      if (stateFileOverride !== this.#lastStateFileOverride) {
        if (stateFileOverride !== null) {
          console.info(`[IDLE] State file override: ${stateFileOverride}`);
        } else {
          console.info('[IDLE] State file override: none (file absent or invalid)');
        }
        this.#lastStateFileOverride = stateFileOverride;
      }
      
      if (stateFileOverride === 'idle') {
        // Force idle state
        if (this.#idleTimeUserStatus === -1) {
          this.#idleTimeUserStatus = this.#getUserStatus();
        }
        
        return {
          system: "idle",
          userIdle: this.#idleTimeUserStatus,
          userCurrent: this.#getUserStatus(),
        };
      } else if (stateFileOverride === 'active') {
        // Force active state
        if (this.#idleTimeUserStatus !== -1) {
          console.debug(`[IDLE] State file active: transitioning from idle to active`);
          this.#idleTimeUserStatus = -1;
        }
        
        return {
          system: "active",
          userIdle: -1,
          userCurrent: this.#getUserStatus(),
        };
      }
      
      // If forceState is enabled but no state file exists, fall through to powerMonitor
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
