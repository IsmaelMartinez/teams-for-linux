/**
 * Call Management IPC Handlers
 * 
 * Handles call-related IPC events including incoming calls, call states,
 * power management during calls, and call toast notifications.
 */

const { spawn } = require('child_process');

/**
 * Call management handlers module
 * 
 * @param {Object} dependencies - Required dependencies
 * @param {Object} dependencies.config - Application configuration object
 * @param {Object} dependencies.powerSaveBlocker - Electron powerSaveBlocker instance
 * @param {Object} dependencies.incomingCallToast - Incoming call toast manager
 * @param {Object} dependencies.window - Main browser window instance
 * @param {Object} dependencies.globals - Global state object for call management
 */
function createCallHandlers(dependencies) {
  const { config, powerSaveBlocker, incomingCallToast, window, globals } = dependencies;

  const handlers = {
    'incoming-call-created': {
      type: 'handle',
      handler: async (event, data) => {
        console.info('[Calls] Incoming call created');
        console.debug('[Calls] Call data:', { 
          caller: data.caller, 
          hasImage: !!data.image,
          textLength: data.text?.length || 0
        });
        
        try {
          // Execute incoming call command if configured
          if (config.incomingCallCommand) {
            await handleIncomingCallCommand(data);
          }
          
          // Show incoming call toast if enabled
          if (config.enableIncomingCallToast && incomingCallToast) {
            console.debug('[Calls] Showing incoming call toast');
            incomingCallToast.show(data);
          }
          
          return { success: true, handled: true };
          
        } catch (error) {
          console.error('[Calls] Failed to handle incoming call:', error);
          return { success: false, error: error.message };
        }
      },
      options: { logArgs: false } // Don't log call data (may contain sensitive info)
    },

    'incoming-call-ended': {
      type: 'handle',
      handler: async (event) => {
        console.info('[Calls] Incoming call ended');
        
        try {
          await handleIncomingCallEnded();
          return { success: true };
        } catch (error) {
          console.error('[Calls] Failed to handle call end:', error);
          return { success: false, error: error.message };
        }
      }
    },

    'call-connected': {
      type: 'handle',
      handler: async (event) => {
        console.info('[Calls] Call connected - disabling screen lock');
        
        try {
          globals.isOnCall = true;
          
          const success = config.screenLockInhibitionMethod === "Electron"
            ? await disableScreenLockElectron()
            : await disableScreenLockWakeLockSentinel();
          
          return { 
            success, 
            method: config.screenLockInhibitionMethod,
            isOnCall: globals.isOnCall
          };
        } catch (error) {
          console.error('[Calls] Failed to disable screen lock:', error);
          return { success: false, error: error.message };
        }
      },
      options: { logResult: true }
    },

    'call-disconnected': {
      type: 'handle',
      handler: async (event) => {
        console.info('[Calls] Call disconnected - restoring screen lock');
        
        try {
          globals.isOnCall = false;
          
          const success = config.screenLockInhibitionMethod === "Electron"
            ? await enableScreenLockElectron()
            : await enableScreenLockWakeLockSentinel();
          
          return { 
            success, 
            method: config.screenLockInhibitionMethod,
            isOnCall: globals.isOnCall
          };
        } catch (error) {
          console.error('[Calls] Failed to restore screen lock:', error);
          return { success: false, error: error.message };
        }
      },
      options: { logResult: true }
    },

    'get-call-status': {
      type: 'handle',
      handler: async (event) => {
        console.debug('[Calls] Getting call status');
        
        return {
          isOnCall: globals.isOnCall,
          blockerId: globals.blockerId,
          screenLockMethod: config.screenLockInhibitionMethod
        };
      },
      options: { logResult: true }
    },

    'incoming-call-action': {
      type: 'on',
      handler: (event, action) => {
        console.debug(`[Calls] Incoming call action: ${action}`);
        
        // Hide the incoming call toast
        if (incomingCallToast) {
          incomingCallToast.hide();
        }
        
        // Forward action to main window
        if (window && !window.isDestroyed()) {
          window.webContents.send("incoming-call-action", action);
        }
      },
      options: { logArgs: true }
    },

    'incoming-call-toast-ready': {
      type: 'once',
      handler: (event) => {
        console.debug('[Calls] Incoming call toast ready');
        // This is handled by the toast manager
      }
    }
  };

  /**
   * Handle incoming call command execution
   */
  async function handleIncomingCallCommand(data) {
    console.debug('[Calls] Executing incoming call command');
    
    // Clean up any existing process first
    await handleIncomingCallEnded();
    
    const commandArgs = [
      ...config.incomingCallCommandArgs,
      data.caller,
      data.text,
      data.image,
    ];
    
    console.debug('[Calls] Command:', config.incomingCallCommand);
    console.debug('[Calls] Args:', commandArgs.map(arg => typeof arg === 'string' ? arg.substring(0, 50) : arg));
    
    globals.incomingCallCommandProcess = spawn(
      config.incomingCallCommand,
      commandArgs
    );
    
    globals.incomingCallCommandProcess.on('error', (error) => {
      console.error('[Calls] Incoming call command error:', error);
    });
    
    globals.incomingCallCommandProcess.on('exit', (code) => {
      console.debug(`[Calls] Incoming call command exited with code: ${code}`);
      globals.incomingCallCommandProcess = null;
    });
  }

  /**
   * Handle incoming call ended cleanup
   */
  async function handleIncomingCallEnded() {
    console.debug('[Calls] Cleaning up incoming call resources');
    
    // Kill any running incoming call command process
    if (globals.incomingCallCommandProcess) {
      try {
        globals.incomingCallCommandProcess.kill();
        globals.incomingCallCommandProcess = null;
        console.debug('[Calls] Incoming call command process terminated');
      } catch (error) {
        console.error('[Calls] Failed to kill incoming call command process:', error);
      }
    }
    
    // Hide incoming call toast
    if (incomingCallToast) {
      try {
        incomingCallToast.hide();
        console.debug('[Calls] Incoming call toast hidden');
      } catch (error) {
        console.error('[Calls] Failed to hide incoming call toast:', error);
      }
    }
  }

  /**
   * Disable screen lock using Electron powerSaveBlocker
   */
  async function disableScreenLockElectron() {
    if (globals.blockerId !== null) {
      console.debug('[Calls] Screen lock already disabled');
      return true;
    }
    
    try {
      globals.blockerId = powerSaveBlocker.start('prevent-display-sleep');
      console.debug(`[Calls] Screen lock disabled using Electron API (blocker ID: ${globals.blockerId})`);
      return true;
    } catch (error) {
      console.error('[Calls] Failed to disable screen lock with Electron:', error);
      return false;
    }
  }

  /**
   * Enable screen lock using Electron powerSaveBlocker
   */
  async function enableScreenLockElectron() {
    if (globals.blockerId === null) {
      console.debug('[Calls] Screen lock already enabled');
      return false;
    }
    
    try {
      powerSaveBlocker.stop(globals.blockerId);
      globals.blockerId = null;
      console.debug('[Calls] Screen lock restored using Electron API');
      return true;
    } catch (error) {
      console.error('[Calls] Failed to enable screen lock with Electron:', error);
      return false;
    }
  }

  /**
   * Disable screen lock using WakeLock Sentinel (browser API)
   */
  async function disableScreenLockWakeLockSentinel() {
    if (!window || window.isDestroyed()) {
      console.warn('[Calls] Cannot disable screen lock - window not available');
      return false;
    }
    
    try {
      window.webContents.send("enable-wakelock");
      console.debug('[Calls] Screen lock disabled using WakeLock Sentinel API');
      return true;
    } catch (error) {
      console.error('[Calls] Failed to disable screen lock with WakeLock:', error);
      return false;
    }
  }

  /**
   * Enable screen lock using WakeLock Sentinel (browser API)
   */
  async function enableScreenLockWakeLockSentinel() {
    if (!window || window.isDestroyed()) {
      console.warn('[Calls] Cannot enable screen lock - window not available');
      return false;
    }
    
    try {
      window.webContents.send("disable-wakelock");
      console.debug('[Calls] Screen lock restored using WakeLock Sentinel API');
      return true;
    } catch (error) {
      console.error('[Calls] Failed to enable screen lock with WakeLock:', error);
      return false;
    }
  }

  /**
   * Enable wake lock when window is restored (if on call)
   */
  function enableWakeLockOnWindowRestore() {
    if (globals.isOnCall && window && !window.isDestroyed()) {
      window.webContents.send("enable-wakelock");
      console.debug('[Calls] Wake lock re-enabled after window restore');
    }
  }

  return handlers;
}

/**
 * Initialize global state for call management
 */
function initializeCallGlobals() {
  return {
    isOnCall: false,
    blockerId: null,
    incomingCallCommandProcess: null
  };
}

/**
 * Example dependencies for documentation
 */
const exampleDependencies = {
  config: {
    incomingCallCommand: '/usr/bin/notify-send',
    incomingCallCommandArgs: ['--urgency=critical'],
    enableIncomingCallToast: true,
    screenLockInhibitionMethod: 'Electron' // or 'WakeLock'
  },
  powerSaveBlocker: {
    start: (type) => { /* Electron powerSaveBlocker.start */ },
    stop: (id) => { /* Electron powerSaveBlocker.stop */ }
  },
  incomingCallToast: {
    show: (data) => { /* Show toast notification */ },
    hide: () => { /* Hide toast notification */ }
  },
  window: {
    isDestroyed: () => false,
    webContents: {
      send: (channel, data) => { /* Send to renderer */ }
    }
  },
  globals: {
    isOnCall: false,
    blockerId: null,
    incomingCallCommandProcess: null
  }
};

module.exports = {
  createCallHandlers,
  initializeCallGlobals,
  
  // Export examples for documentation
  examples: {
    dependencies: exampleDependencies
  }
};