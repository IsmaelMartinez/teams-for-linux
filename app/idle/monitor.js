const { ipcMain, powerMonitor } = require("electron");
const fs = require("node:fs");

class IdleMonitor {
  // State file content values (what users write in the state file)
  static #STATE_FILE_INACTIVE = 'inactive';
  static #STATE_FILE_ACTIVE = 'active';
  
  // System state values (what the system returns and uses internally)
  static #SYSTEM_STATE_IDLE = 'idle';
  static #SYSTEM_STATE_ACTIVE = 'active';

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
    this.#stateFilePath = stateFilePath.replace('$USER', process.env.USER || process.env.USERNAME || 'unknown');
  }

  initialize() {
    // Get system idle state to sync with Teams presence
    ipcMain.handle("get-system-idle-state", this.#handleGetSystemIdleState.bind(this));
    
    // Setup cleanup handler for state file
    process.on('exit', this.#cleanupStateFile.bind(this));
    
    ['SIGINT', 'SIGTERM'].forEach(signal => {
      process.on(signal, () => process.exit(0));
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
        console.debug(`[IDLE] Failed to cleanup state file: ${err.message}`);
      }
    }
  }

  #getStateFileOverride() {
    try {
      if (fs.existsSync(this.#stateFilePath)) {
        const content = fs.readFileSync(this.#stateFilePath, 'utf8').trim();
        
        if (content === IdleMonitor.#STATE_FILE_INACTIVE) {
          return IdleMonitor.#SYSTEM_STATE_IDLE;
        } else if (content === IdleMonitor.#STATE_FILE_ACTIVE) {
          return IdleMonitor.#SYSTEM_STATE_ACTIVE;
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

  #handleStateFileOverride() {
    const stateFileOverride = this.#getStateFileOverride();
    
    // Log only on state transitions
    if (stateFileOverride !== this.#lastStateFileOverride) {
      if (stateFileOverride === null) {
        console.info('[IDLE] State file override: none (file absent or invalid)');
      } else {
        console.info(`[IDLE] State file override: ${stateFileOverride}`);
      }
      this.#lastStateFileOverride = stateFileOverride;
    }
    
    if (stateFileOverride === IdleMonitor.#SYSTEM_STATE_IDLE) {
      // Force idle state
      if (this.#idleTimeUserStatus === -1) {
        this.#idleTimeUserStatus = this.#getUserStatus();
      }
      
      return {
        system: IdleMonitor.#SYSTEM_STATE_IDLE,
        userIdle: this.#idleTimeUserStatus,
        userCurrent: this.#getUserStatus(),
      };
    } else if (stateFileOverride === IdleMonitor.#SYSTEM_STATE_ACTIVE) {
      // Force active state
      if (this.#idleTimeUserStatus !== -1) {
        console.debug(`[IDLE] State file active: transitioning from idle to active`);
        this.#idleTimeUserStatus = -1;
      }
      
      return {
        system: IdleMonitor.#SYSTEM_STATE_ACTIVE,
        userIdle: -1,
        userCurrent: this.#getUserStatus(),
      };
    }
    
    // No override - return null to indicate fall through to powerMonitor
    return null;
  }

  async #handleGetSystemIdleState() {

    // If forceState is enabled, check state file for override
    if (this.#config.idleDetection?.forceState) {
      const stateFileResult = this.#handleStateFileOverride();
      if (stateFileResult !== null) {
        return stateFileResult;
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

    if (systemIdleState === IdleMonitor.#SYSTEM_STATE_ACTIVE) {
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
