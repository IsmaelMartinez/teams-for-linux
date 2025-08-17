/**
 * Screen Sharing IPC Handlers
 * 
 * Handles screen sharing related IPC events including desktop capturer,
 * source selection, preview window management, and sharing status.
 */

const { BrowserWindow } = require('electron');
const path = require('path');

/**
 * Screen sharing handlers module
 * 
 * @param {Object} dependencies - Required dependencies
 * @param {Object} dependencies.desktopCapturer - Electron desktopCapturer instance
 * @param {Object} dependencies.screen - Electron screen instance
 * @param {Object} dependencies.globals - Global state object for screen sharing
 * @param {string} dependencies.appPath - Application path for screen picker
 * @param {Object} dependencies.ipcMain - Electron ipcMain instance for screen picker
 */
function createScreenSharingHandlers(dependencies) {
  const { desktopCapturer, screen, globals, appPath, config } = dependencies;

  // Internal state for screen picker
  let picker = null;

  const handlers = {
    'desktop-capturer-get-sources': {
      type: 'handle',
      handler: async (event, opts) => {
        console.debug('[ScreenSharing] Getting desktop capturer sources');
        console.debug(`[ScreenSharing] Options:`, opts);
        
        try {
          const sources = await desktopCapturer.getSources(opts);
          console.debug(`[ScreenSharing] Found ${sources.length} sources`);
          return sources;
        } catch (error) {
          console.error('[ScreenSharing] Failed to get desktop sources:', error);
          throw error;
        }
      },
      options: { logArgs: true, logResult: false } // Don't log sources data (can be large)
    },

    'choose-desktop-media': {
      type: 'handle',
      handler: async (event, sourceTypes) => {
        console.debug('[ScreenSharing] Opening screen picker for source types:', sourceTypes);
        
        try {
          const sources = await desktopCapturer.getSources({ types: sourceTypes });
          const chosen = await showScreenPicker(sources);
          
          if (chosen) {
            console.debug(`[ScreenSharing] User selected source: ${chosen.id}`);
            globals.selectedScreenShareSource = chosen;
            return chosen.id;
          } else {
            console.debug('[ScreenSharing] User cancelled source selection');
            return null;
          }
        } catch (error) {
          console.error('[ScreenSharing] Failed to choose desktop media:', error);
          throw error;
        }
      },
      options: { logArgs: true }
    },

    'cancel-desktop-media': {
      type: 'on',
      handler: (event) => {
        console.debug('[ScreenSharing] Cancelling desktop media selection');
        
        if (picker) {
          picker.close();
          picker = null;
        }
      }
    },

    'get-screen-sharing-status': {
      type: 'handle',
      handler: async (event) => {
        const isSharing = globals.selectedScreenShareSource !== null;
        console.debug(`[ScreenSharing] Screen sharing status: ${isSharing}`);
        
        return {
          isSharing,
          sourceId: isSharing ? getSourceId(globals.selectedScreenShareSource) : null,
          sourceName: isSharing ? getSourceName(globals.selectedScreenShareSource) : null
        };
      },
      options: { logResult: true }
    },

    'get-screen-share-stream': {
      type: 'handle', 
      handler: async (event) => {
        console.debug('[ScreenSharing] Getting screen share stream ID');
        
        const sourceId = getSourceId(globals.selectedScreenShareSource);
        if (sourceId) {
          console.debug(`[ScreenSharing] Returning stream ID: ${sourceId}`);
          return sourceId;
        } else {
          console.debug('[ScreenSharing] No active screen share stream');
          return null;
        }
      },
      options: { logResult: true }
    },

    'get-screen-share-screen': {
      type: 'handle',
      handler: async (event) => {
        console.debug('[ScreenSharing] Getting screen share dimensions');
        
        // Return screen dimensions if available from selected source
        if (globals.selectedScreenShareSource && 
            typeof globals.selectedScreenShareSource === "object") {
          
          const displays = screen.getAllDisplays();
          
          if (globals.selectedScreenShareSource?.id?.startsWith("screen:")) {
            const display = displays[0] || { size: { width: 1920, height: 1080 } };
            const dimensions = { width: display.size.width, height: display.size.height };
            console.debug('[ScreenSharing] Screen dimensions:', dimensions);
            return dimensions;
          }
        }
        
        // Default dimensions
        const defaultDimensions = { width: 1920, height: 1080 };
        console.debug('[ScreenSharing] Using default dimensions:', defaultDimensions);
        return defaultDimensions;
      },
      options: { logResult: true }
    },

    'screen-sharing-stopped': {
      type: 'on',
      handler: (event) => {
        console.info('[ScreenSharing] Screen sharing stopped');
        
        globals.selectedScreenShareSource = null;
        
        // Close preview window when screen sharing stops
        if (globals.previewWindow && !globals.previewWindow.isDestroyed()) {
          console.debug('[ScreenSharing] Closing preview window');
          globals.previewWindow.close();
        }
      }
    },

    'resize-preview-window': {
      type: 'on',
      handler: (event, { width, height }) => {
        console.debug(`[ScreenSharing] Resizing preview window to ${width}x${height}`);
        
        if (globals.previewWindow && !globals.previewWindow.isDestroyed()) {
          const [minWidth, minHeight] = globals.previewWindow.getMinimumSize();
          const newWidth = Math.max(minWidth, Math.min(width, 480));
          const newHeight = Math.max(minHeight, Math.min(height, 360));
          
          globals.previewWindow.setSize(newWidth, newHeight);
          globals.previewWindow.center();
          
          console.debug(`[ScreenSharing] Preview window resized to ${newWidth}x${newHeight}`);
        } else {
          console.warn('[ScreenSharing] Cannot resize preview window - window not available');
        }
      },
      options: { logArgs: true }
    },

    'stop-screen-sharing-from-thumbnail': {
      type: 'on',
      handler: (event) => {
        console.info('[ScreenSharing] Stopping screen sharing from thumbnail');
        
        globals.selectedScreenShareSource = null;
        
        if (globals.previewWindow && !globals.previewWindow.isDestroyed()) {
          globals.previewWindow.webContents.send("screen-sharing-status-changed");
        }
      }
    },

    'screen-sharing-started': {
      type: 'on',
      handler: (event, sourceId) => {
        console.info('[ScreenSharing] Screen sharing started with source:', sourceId);
        
        globals.selectedScreenShareSource = sourceId;
        
        // Create preview window if enabled
        if (config.screenSharingThumbnail?.enabled) {
          createPreviewWindow(sourceId);
        }
      },
      options: { logArgs: true }
    },

    'select-source': {
      type: 'on', 
      handler: (event) => {
        console.debug('[ScreenSharing] Source selection requested');
        
        // Get available sources and show screen picker
        event.reply('select-source', globals.selectedScreenShareSource);
      }
    }
  };

  /**
   * Show screen picker window for source selection
   */
  async function showScreenPicker(sources) {
    return new Promise((resolve) => {
      console.debug('[ScreenSharing] Creating screen picker window');
      
      picker = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
          preload: path.join(appPath, "screenPicker", "preload.js"),
        },
      });
      
      picker.loadFile(path.join(appPath, "screenPicker", "index.html"));
      
      // Set up source selection listener
      // NOTE: This should be handled by the dependency injection pattern
      // For now, we'll use the provided ipcMain dependency
      const { ipcMain } = dependencies;
      if (ipcMain) {
        ipcMain.once("source-selected", (event, source) => {
          console.debug('[ScreenSharing] Source selected from picker:', source?.name);
          picker = null;
          resolve(source);
        });
      } else {
        console.error('[ScreenSharing] ipcMain dependency not provided');
        picker = null;
        resolve(null);
      }
      
      // Handle window close
      picker.on('closed', () => {
        console.debug('[ScreenSharing] Screen picker window closed');
        picker = null;
        resolve(null);
      });
      
      // Send sources to picker
      picker.webContents.once('did-finish-load', () => {
        picker.webContents.send('sources', sources);
      });
    });
  }

  /**
   * Get source ID from selected source (handles both string and object formats)
   */
  function getSourceId(selectedSource) {
    if (typeof selectedSource === "string") {
      return selectedSource;
    } else if (selectedSource?.id) {
      return selectedSource.id;
    }
    return null;
  }

  /**
   * Get source name from selected source
   */
  function getSourceName(selectedSource) {
    if (typeof selectedSource === "object" && selectedSource?.name) {
      return selectedSource.name;
    }
    return null;
  }

  /**
   * Create preview window for screen sharing
   */
  function createPreviewWindow(sourceId) {
    console.debug('[ScreenSharing] Creating preview window for source:', sourceId);
    
    // Don't create if preview already exists
    if (globals.previewWindow && !globals.previewWindow.isDestroyed()) {
      console.debug('[ScreenSharing] Preview window already exists');
      return;
    }
    
    globals.previewWindow = new BrowserWindow({
      width: 320,
      height: 240,
      minWidth: 200,
      minHeight: 150,
      maxWidth: 480,
      maxHeight: 360,
      show: false,
      frame: true,
      title: "Screen Share Preview",
      alwaysOnTop: config.screenSharingThumbnail?.alwaysOnTop || true,
      skipTaskbar: false,
      resizable: true,
      webPreferences: {
        preload: path.join(appPath, "screenSharing", "previewWindowPreload.js"),
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    globals.previewWindow.loadFile(
      path.join(appPath, "screenSharing", "previewWindow.html")
    );

    globals.previewWindow.once("ready-to-show", () => {
      console.debug('[ScreenSharing] Preview window ready, showing');
      globals.previewWindow.show();
    });

    globals.previewWindow.on("closed", () => {
      console.debug('[ScreenSharing] Preview window closed');
      globals.previewWindow = null;
      globals.selectedScreenShareSource = null;
    });
  }

  return handlers;
}

/**
 * Initialize global state for screen sharing
 */
function initializeScreenSharingGlobals() {
  return {
    selectedScreenShareSource: null,
    previewWindow: null
  };
}

/**
 * Example dependencies for documentation
 */
const exampleDependencies = {
  desktopCapturer: {
    getSources: (options) => { /* Electron desktopCapturer.getSources */ }
  },
  screen: {
    getAllDisplays: () => { /* Electron screen.getAllDisplays */ }
  },
  globals: {
    selectedScreenShareSource: null,
    previewWindow: null
  },
  appPath: '/path/to/app'
};

module.exports = {
  createScreenSharingHandlers,
  initializeScreenSharingGlobals,
  
  // Export examples for documentation
  examples: {
    dependencies: exampleDependencies
  }
};