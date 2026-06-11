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

  // The default state file lives in world-writable /tmp. Open with O_NOFOLLOW
  // and fstat the descriptor to reject symlinks and files owned by another
  // user, so a planted file cannot control this user's presence.
  #readStateFile() {
    const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0);
    let fd;
    try {
      fd = fs.openSync(this.#stateFilePath, flags);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.warn(`[IDLE] Failed to open state file: ${err.code}`);
      }
      return null;
    }
    try {
      const stats = fs.fstatSync(fd);
      if (!stats.isFile()) {
        console.warn('[IDLE] State file is not a regular file, ignoring');
        return null;
      }
      // The file only ever holds "active" / "inactive". Cap the read so a
      // planted huge file in world-writable /tmp cannot OOM the process.
      if (stats.size > 1024) {
        console.warn('[IDLE] State file is too large, ignoring');
        return null;
      }
      if (typeof process.getuid === 'function' && stats.uid !== process.getuid()) {
        console.warn('[IDLE] State file is not owned by the current user, ignoring');
        return null;
      }
      return fs.readFileSync(fd, 'utf8').trim();
    } catch (err) {
      console.warn(`[IDLE] Failed to read state file: ${err.code}`);
      return null;
    } finally {
      fs.closeSync(fd);
    }
  }

  #getStateFileOverride() {
    const content = this.#readStateFile();
    if (content === null) {
      return null; // No override
    }

    if (content === IdleMonitor.#STATE_FILE_INACTIVE) {
      return IdleMonitor.#SYSTEM_STATE_IDLE;
    } else if (content === IdleMonitor.#STATE_FILE_ACTIVE) {
      return IdleMonitor.#SYSTEM_STATE_ACTIVE;
    }
    // Don't echo unexpected content: it may be arbitrary file data.
    console.warn('[IDLE] Unknown state file content, ignoring');
    return null;
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
