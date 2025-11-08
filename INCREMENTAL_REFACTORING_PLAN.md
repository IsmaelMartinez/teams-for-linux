# Incremental Refactoring Plan

**Alternative to**: DDD+Plugin Architecture Modernization
**Based on**: Critical Analysis of actual codebase pain points
**Timeline**: 4-8 weeks (incremental delivery)
**Risk Level**: Low to Medium

---

## Philosophy

> "Make the change easy, then make the easy change." - Kent Beck

Instead of a 10-week big-bang architectural overhaul, we extract functionality incrementally:

- ✅ **Small, independent changes**
- ✅ **Continuous value delivery**
- ✅ **Low-risk, reversible steps**
- ✅ **Test as you go**
- ✅ **Production-ready at each step**

---

## Phase 1: Extract Pure Functions (Weeks 1-4)

**Goal**: Reduce `app/index.js` from 755 lines to <400 lines

### Week 1: Command Line Logic

**New File**: `app/startup/commandLine.js`

**Extract these functions from index.js:**

1. `addCommandLineSwitchesBeforeConfigLoad()` - Lines 316-335 (20 lines)
2. `addCommandLineSwitchesAfterConfigLoad()` - Lines 337-387 (51 lines)
3. `addElectronCLIFlagsFromConfig()` - Lines 389-411 (23 lines)

**Total extraction**: 94 lines

**Implementation**:

```javascript
// app/startup/commandLine.js
const { app } = require("electron");
const os = require("node:os");
const isMac = os.platform() === "darwin";
const isWayland = process.env.XDG_SESSION_TYPE === "wayland";

class CommandLineManager {
  /**
   * Add command line switches before config is loaded
   * Must be called before app.getPath('userData')
   */
  static addSwitchesBeforeConfigLoad() {
    // Move lines 318-335 from index.js
    if (process.argv.includes("--sandbox")) {
      app.enableSandbox();
    }
  }

  /**
   * Add command line switches after config is loaded
   * @param {Object} config - Application configuration
   */
  static addSwitchesAfterConfigLoad(config) {
    // Move lines 339-387 from index.js
    // Wayland detection and GPU config
  }

  /**
   * Add Electron CLI flags from config
   * @param {Object} config - Application configuration
   */
  static addElectronCLIFlags(config) {
    // Move lines 391-411 from index.js
  }
}

module.exports = CommandLineManager;
```

**Changes to index.js**:

```javascript
// BEFORE (Line 27):
addCommandLineSwitchesBeforeConfigLoad();

// AFTER:
const CommandLineManager = require("./startup/commandLine");
CommandLineManager.addSwitchesBeforeConfigLoad();

// BEFORE (Line 39):
addCommandLineSwitchesAfterConfigLoad();

// AFTER:
CommandLineManager.addSwitchesAfterConfigLoad(config);
```

**Testing**:

```bash
# Manual testing
npm start  # Verify app starts normally

# E2E test (add to tests/e2e/)
test('app starts with correct command line switches', async () => {
  // Use existing Playwright E2E framework
  const { electronApp } = await launchElectronApp();
  expect(electronApp).toBeTruthy();
});
```

**Success Criteria**:
- ✅ App starts normally
- ✅ All command line flags work
- ✅ No regressions in Wayland/X11
- ✅ index.js reduced by 94 lines

---

### Week 2: Notification System

**New Files**:
- `app/notifications/service.js` (main process notification logic)
- `app/notifications/sound.js` (sound playback)

**Extract from index.js:**

1. `showNotification()` - Lines 413-463 (51 lines)
2. `playNotificationSound()` - Lines 465-494 (30 lines)
3. Move IPC handler registration: Lines 143-144

**Total extraction**: 83 lines

**Implementation**:

```javascript
// app/notifications/service.js
const { Notification, nativeImage, ipcMain } = require("electron");

class NotificationService {
  #soundPlayer;
  #config;
  #mainWindow;
  #getUserStatus; // Function to get current user status

  constructor(soundPlayer, config, mainWindow, getUserStatus) {
    this.#soundPlayer = soundPlayer;
    this.#config = config;
    this.#mainWindow = mainWindow;
    this.#getUserStatus = getUserStatus;
  }

  /**
   * Register IPC handlers for notifications
   */
  initialize() {
    ipcMain.handle("play-notification-sound", this.#playSound.bind(this));
    ipcMain.handle("show-notification", this.#showNotification.bind(this));
  }

  async #showNotification(_event, options) {
    // Move implementation from index.js:413-463
    const startTime = Date.now();
    console.debug("[TRAY_DIAG] Native notification request received", {
      title: options.title,
      bodyLength: options.body?.length || 0,
      hasIcon: !!options.icon,
      type: options.type,
      urgency: this.#config.defaultNotificationUrgency,
      timestamp: new Date().toISOString()
    });

    try {
      await this.#playSound(null, {
        type: options.type,
        audio: "default",
        title: options.title,
        body: options.body,
      });

      const notification = new Notification({
        icon: nativeImage.createFromDataURL(options.icon),
        title: options.title,
        body: options.body,
        urgency: this.#config.defaultNotificationUrgency,
      });

      notification.on("click", () => {
        console.debug("[TRAY_DIAG] Notification clicked, showing main window");
        this.#mainWindow.show();
      });

      notification.show();

      const totalTime = Date.now() - startTime;
      console.debug("[TRAY_DIAG] Native notification displayed successfully", {
        title: options.title,
        totalTimeMs: totalTime,
        performanceNote: totalTime > 500 ? "Slow notification display detected" : "Normal notification speed"
      });

    } catch (error) {
      console.error("[TRAY_DIAG] Failed to show native notification", {
        error: error.message,
        title: options.title,
        suggestion: "Check if notification permissions are granted or icon data is valid"
      });
    }
  }

  async #playSound(_event, options) {
    // Move implementation from index.js:465-494
    // Inject user status via this.#getUserStatus()
    const userStatus = this.#getUserStatus();

    if (!this.#soundPlayer || this.#config.disableNotificationSound) {
      console.debug("Notification sounds are disabled");
      return;
    }

    if (this.#config.disableNotificationSoundIfNotAvailable &&
        userStatus !== 1 && userStatus !== -1) {
      console.debug("Notification sounds are disabled when user is not active");
      return;
    }

    // ... rest of sound playback logic
  }
}

module.exports = NotificationService;
```

**Changes to index.js**:

```javascript
// AFTER config loading (around line 50):
const NotificationService = require("./notifications/service");

// Create service (around line 70, after player initialization):
const notificationService = new NotificationService(
  player,
  config,
  mainAppWindow,
  () => userStatus  // Getter function for user status
);

// In handleAppReady (around line 540):
notificationService.initialize();

// REMOVE Lines 143-144 (IPC registration)
// REMOVE Lines 413-494 (function definitions)
```

**Benefits**:
- ✅ Breaks coupling between notifications and user status (now injected)
- ✅ Testable (can mock soundPlayer, mainWindow, getUserStatus)
- ✅ Single Responsibility (notification concerns isolated)

**Testing**:

```javascript
// tests/unit/notifications/service.test.js
const NotificationService = require("../../../app/notifications/service");

test('shows notification when user status is available', async () => {
  const mockPlayer = { play: jest.fn() };
  const mockConfig = { disableNotificationSound: false };
  const mockMainWindow = { show: jest.fn() };
  const getUserStatus = () => 1; // Available

  const service = new NotificationService(mockPlayer, mockConfig, mockMainWindow, getUserStatus);

  await service.showNotification(null, {
    title: "Test",
    body: "Test notification",
    type: "new-message"
  });

  expect(mockPlayer.play).toHaveBeenCalled();
});
```

**Success Criteria**:
- ✅ Notifications work normally
- ✅ Sound playback respects user status
- ✅ Unit tests pass
- ✅ index.js reduced by 83 lines

---

### Week 3: Screen Sharing Handlers

**New File**: `app/screenSharing/ipcHandlers.js`

**Extract from index.js:**

1. All screen sharing IPC handlers - Lines 152-275 (124 lines)
2. Encapsulate `globalThis.selectedScreenShareSource` state

**Total extraction**: 124 lines

**Implementation**:

```javascript
// app/screenSharing/ipcHandlers.js
const { ipcMain } = require("electron");

class ScreenSharingService {
  #selectedSource = null;
  #previewWindow = null;

  /**
   * Register all screen sharing IPC handlers
   */
  initialize() {
    // Screen sharing lifecycle
    ipcMain.on("screen-sharing-started", this.#handleStarted.bind(this));
    ipcMain.on("screen-sharing-stopped", this.#handleStopped.bind(this));

    // Preview window management
    ipcMain.handle("get-screen-sharing-status", this.#getStatus.bind(this));
    ipcMain.handle("get-screen-share-stream", this.#getStream.bind(this));
    ipcMain.handle("get-screen-share-screen", this.#getScreen.bind(this));
    ipcMain.on("resize-preview-window", this.#resizePreview.bind(this));
    ipcMain.on("stop-screen-sharing-from-thumbnail", this.#stopFromThumbnail.bind(this));
  }

  /**
   * Set the preview window reference (called from mainAppWindow)
   */
  setPreviewWindow(window) {
    this.#previewWindow = window;
  }

  /**
   * Set the selected source
   */
  setSource(sourceId) {
    this.#selectedSource = sourceId;
  }

  /**
   * Get the selected source
   */
  getSource() {
    return this.#selectedSource;
  }

  /**
   * Clear the selected source
   */
  clearSource() {
    this.#selectedSource = null;
  }

  #handleStarted(event, sourceId) {
    // Move implementation from index.js:152-203
    try {
      console.debug("[SCREEN_SHARE_DIAG] Screen sharing session started", {
        receivedSourceId: sourceId,
        existingSourceId: this.#selectedSource,
        timestamp: new Date().toISOString()
      });

      if (sourceId) {
        const isValidFormat = sourceId.startsWith('screen:') || sourceId.startsWith('window:');
        if (isValidFormat) {
          this.#selectedSource = sourceId;
        } else {
          console.warn("[SCREEN_SHARE_DIAG] Received invalid source ID format");
        }
      }
    } catch (error) {
      console.error("[SCREEN_SHARE_DIAG] Error handling screen-sharing-started", error);
    }
  }

  #handleStopped() {
    // Move implementation from index.js:205-225
    console.debug("[SCREEN_SHARE_DIAG] Screen sharing session stopped");
    this.#selectedSource = null;

    if (this.#previewWindow && !this.#previewWindow.isDestroyed()) {
      this.#previewWindow.close();
    }
  }

  #getStatus() {
    return this.#selectedSource !== null;
  }

  #getStream() {
    if (typeof this.#selectedSource === "string") {
      return this.#selectedSource;
    } else if (this.#selectedSource?.id) {
      return this.#selectedSource.id;
    }
    return null;
  }

  #getScreen() {
    // Move implementation from index.js:242-258
    if (this.#selectedSource && typeof this.#selectedSource === "object") {
      const { screen } = require("electron");
      const displays = screen.getAllDisplays();

      if (this.#selectedSource?.id?.startsWith("screen:")) {
        const display = displays[0] || { size: { width: 1920, height: 1080 } };
        return { width: display.size.width, height: display.size.height };
      }
    }
    return { width: 1920, height: 1080 };
  }

  #resizePreview(event, { width, height }) {
    // Move implementation from index.js:260-268
    if (this.#previewWindow && !this.#previewWindow.isDestroyed()) {
      const [minWidth, minHeight] = this.#previewWindow.getMinimumSize();
      const newWidth = Math.max(minWidth, Math.min(width, 480));
      const newHeight = Math.max(minHeight, Math.min(height, 360));
      this.#previewWindow.setSize(newWidth, newHeight);
      this.#previewWindow.center();
    }
  }

  #stopFromThumbnail() {
    // Move implementation from index.js:270-275
    this.#selectedSource = null;
    if (this.#previewWindow && !this.#previewWindow.isDestroyed()) {
      this.#previewWindow.webContents.send("screen-sharing-status-changed");
    }
  }
}

// Export singleton
module.exports = new ScreenSharingService();
```

**Changes to index.js**:

```javascript
// Top of file:
const screenSharingService = require("./screenSharing/ipcHandlers");

// In handleAppReady:
screenSharingService.initialize();

// REMOVE Lines 152-275 (all screen sharing IPC handlers)

// Replace all occurrences of globalThis.selectedScreenShareSource:
// - globalThis.selectedScreenShareSource = X  →  screenSharingService.setSource(X)
// - globalThis.selectedScreenShareSource       →  screenSharingService.getSource()
```

**Changes to mainAppWindow/index.js**:

```javascript
// Replace globalThis.selectedScreenShareSource usages:
const screenSharingService = require("../screenSharing/ipcHandlers");

// Line 51: globalThis.selectedScreenShareSource = sourceId;
screenSharingService.setSource(sourceId);

// Line 117: globalThis.previewWindow = previewWindow;
screenSharingService.setPreviewWindow(previewWindow);

// Other usages: screenSharingService.getSource() / clearSource()
```

**Benefits**:
- ✅ Encapsulates global state (no more globalThis)
- ✅ All screen sharing logic in one module
- ✅ Testable (can create fresh instances for tests if we export class)

**Testing**:

```javascript
// tests/e2e/screenSharing.test.js
test('screen sharing starts and stops correctly', async () => {
  const { electronApp } = await launchElectronApp();

  // Trigger screen sharing
  await page.click('[aria-label="Share screen"]');

  // Select a source
  await page.click('.screen-source:first-child');

  // Verify preview window appears
  const windows = await electronApp.windows();
  expect(windows.length).toBe(2); // Main + preview

  // Stop sharing
  await page.click('[aria-label="Stop sharing"]');

  // Verify preview window closes
  await page.waitForTimeout(500);
  const finalWindows = await electronApp.windows();
  expect(finalWindows.length).toBe(1); // Main only
});
```

**Success Criteria**:
- ✅ Screen sharing works normally
- ✅ Preview window functions correctly
- ✅ No global state leaks
- ✅ index.js reduced by 124 lines

---

### Week 4: Additional Extractions

#### 4a. Partition Management

**New File**: `app/partitions/manager.js`

**Extract from index.js:**
- `getPartitions()` - Lines 639-641 (3 lines)
- `getPartition()` - Lines 643-648 (6 lines)
- `savePartition()` - Lines 650-662 (13 lines)
- Handlers: Lines 627-637 (11 lines)

**Total**: 33 lines

**Implementation**:

```javascript
// app/partitions/manager.js
class PartitionManager {
  #settingsStore;

  constructor(settingsStore) {
    this.#settingsStore = settingsStore;
  }

  getPartitions() {
    return this.#settingsStore.get("app.partitions") || [];
  }

  getPartition(name) {
    const partitions = this.getPartitions();
    return partitions.find((p) => p.name === name);
  }

  savePartition(partition) {
    const partitions = this.getPartitions();
    const partitionIndex = partitions.findIndex((p) => p.name === partition.name);

    if (partitionIndex >= 0) {
      partitions[partitionIndex] = partition;
    } else {
      partitions.push(partition);
    }
    this.#settingsStore.set("app.partitions", partitions);
  }

  initialize() {
    const { ipcMain } = require("electron");
    ipcMain.handle("get-zoom-level", this.#handleGetZoomLevel.bind(this));
    ipcMain.handle("save-zoom-level", this.#handleSaveZoomLevel.bind(this));
  }

  async #handleGetZoomLevel(_, name) {
    const partition = this.getPartition(name) || {};
    return partition.zoomLevel ? partition.zoomLevel : 0;
  }

  async #handleSaveZoomLevel(_, args) {
    let partition = this.getPartition(args.partition) || {};
    partition.name = args.partition;
    partition.zoomLevel = args.zoomLevel;
    this.savePartition(partition);
  }
}

module.exports = PartitionManager;
```

#### 4b. Idle State Monitor

**New File**: `app/idle/monitor.js`

**Extract from index.js:**
- `handleGetSystemIdleState()` - Lines 587-625 (39 lines)
- Handler registration: Line 126

**Total**: 40 lines

**Implementation**:

```javascript
// app/idle/monitor.js
const { powerMonitor } = require("electron");

class IdleStateMonitor {
  #config;
  #idleTimeUserStatus = -1;
  #getUserStatus; // Function to get current user status

  constructor(config, getUserStatus) {
    this.#config = config;
    this.#getUserStatus = getUserStatus;
  }

  initialize() {
    const { ipcMain } = require("electron");
    ipcMain.handle("get-system-idle-state", this.#handleGetSystemIdleState.bind(this));
  }

  async #handleGetSystemIdleState() {
    // Move implementation from index.js:587-625
    const currentIdleTime = powerMonitor.getSystemIdleTime();
    const userStatus = this.#getUserStatus();

    let systemIdleState = currentIdleTime >= this.#config.appIdleTimeout ? "idle" : "active";

    if (systemIdleState === "idle" && this.#idleTimeUserStatus === -1) {
      console.debug(
        `GetSystemIdleState => IdleTimeout: ${this.#config.appIdleTimeout}s, ` +
        `IdleTime: ${currentIdleTime}s, IdleState: '${systemIdleState}'`
      );
      this.#idleTimeUserStatus = userStatus;
    }

    const state = {
      system: systemIdleState,
      userIdle: this.#idleTimeUserStatus,
      userCurrent: userStatus,
    };

    if (systemIdleState === "active") {
      this.#idleTimeUserStatus = -1;
    }

    return state;
  }
}

module.exports = IdleStateMonitor;
```

#### 4c. Window Helper Functions

**New File**: `app/windows/helpers.js`

**Consolidate 3 duplicate implementations**:
- `menus/tray.js:43-45` - showAndFocusWindow
- `mainAppWindow/index.js:416-427` - restoreWindow
- `menus/index.js:79-85` - open

**Implementation**:

```javascript
// app/windows/helpers.js

/**
 * Restore and focus a window, handling minimized/hidden states
 * @param {BrowserWindow} window - The window to restore and focus
 */
function restoreAndFocusWindow(window) {
  if (!window || window.isDestroyed()) {
    console.warn("Cannot restore destroyed or null window");
    return;
  }

  if (window.isMinimized()) {
    window.restore();
  } else if (!window.isVisible()) {
    window.show();
  }

  window.focus();
}

module.exports = {
  restoreAndFocusWindow
};
```

**Replace usages**:

```javascript
// In menus/tray.js:
const { restoreAndFocusWindow } = require("../windows/helpers");

showAndFocusWindow() {
  restoreAndFocusWindow(this.window);
}

// In mainAppWindow/index.js:
const { restoreAndFocusWindow } = require("../windows/helpers");

function restoreWindow() {
  restoreAndFocusWindow(window);
}

// In menus/index.js:
const { restoreAndFocusWindow } = require("../windows/helpers");

open() {
  restoreAndFocusWindow(this.window);
}
```

---

## Phase 1 Summary

**Total Impact**:

| Extraction | Lines Removed from index.js |
|------------|----------------------------|
| Command Line Logic | 94 |
| Notification System | 83 |
| Screen Sharing Handlers | 124 |
| Partition Management | 33 |
| Idle State Monitor | 40 |
| **TOTAL** | **374** |

**index.js Reduction**: 755 → 381 lines (**49% reduction**)

**New Files Created**: 7
**Code Duplication Eliminated**: 3 instances (window show/focus)
**Global State Removed**: 2 instances (screen sharing encapsulated)
**Testability Improved**: All extracted modules testable in isolation

---

## Phase 2: Testability & Quality (Weeks 5-8)

### Week 5: Singleton Refactoring

**Current Singletons**:

1. `app/connectionManager/index.js:236` - `module.exports = new ConnectionManager();`
2. `app/screenSharing/ipcHandlers.js` - (created in Phase 1, export singleton)

**Refactor Pattern**:

```javascript
// BEFORE:
class ConnectionManager {
  // ...
}
module.exports = new ConnectionManager();

// AFTER:
class ConnectionManager {
  // ...
}
module.exports = ConnectionManager;

// In index.js:
const ConnectionManager = require("./connectionManager");
const connectionManager = new ConnectionManager();
```

**Benefits**:
- ✅ Can create fresh instances for testing
- ✅ No shared state between tests
- ✅ Explicit dependency injection

### Week 6: IPC Registration Pattern

**Problem**: Constructor-time IPC registration

**Current** (`menus/tray.js:19`):
```javascript
constructor(window, appMenu, iconPath, config) {
  // ... other init ...
  ipcMain.on("tray-update", (_event, data) => {
    this.updateTrayImage(icon, flash, count);
  });
}
```

**Refactored**:
```javascript
constructor(window, appMenu, iconPath, config) {
  // NO IPC registration in constructor
}

initialize() {
  ipcMain.on("tray-update", this.#handleTrayUpdate.bind(this));
}

#handleTrayUpdate(_event, data) {
  this.updateTrayImage(data.icon, data.flash, data.count);
}
```

**Apply to**:
- `menus/tray.js`
- Any other modules with constructor IPC registration

### Week 7: Automated Testing

**Add E2E Tests** (Playwright framework already exists from PR #1880):

```javascript
// tests/e2e/startup.test.js
test('app starts successfully', async () => {
  const { electronApp } = await launchElectronApp();
  const window = await electronApp.firstWindow();
  expect(await window.title()).toContain("Teams for Linux");
});

// tests/e2e/notifications.test.js
test('notification shows when message received', async () => {
  // Test notification flow
});

// tests/e2e/screenSharing.test.js
test('screen sharing lifecycle works', async () => {
  // Test screen sharing
});
```

**Add Unit Tests**:

```javascript
// tests/unit/notifications/service.test.js
// tests/unit/screenSharing/ipcHandlers.test.js
// tests/unit/partitions/manager.test.js
// tests/unit/idle/monitor.test.js
```

**Target**: 20+ automated tests covering critical paths

### Week 8: Documentation & IPC Registry

**Auto-generate IPC documentation**:

```javascript
// scripts/generateIpcDocs.js
// Scan all ipcMain.handle/on calls
// Generate docs/ipc-api.md automatically
```

**Keep docs in sync with code** - no manual updates

---

## Success Metrics

### After Phase 1 (Week 4)

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| index.js LOC | 755 | 381 | -49% |
| Extractable LOC | 374 | <50 | -87% |
| IPC in index.js | 27/42 | 7/42 | -74% |
| Global variables | 10 | 6 | -40% |
| Modules with tests | 0 | 5 | +5 |

### After Phase 2 (Week 8)

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Singleton exports | 3 | 0 | -100% |
| Constructor IPC | 2+ | 0 | -100% |
| Automated tests | 0 | 20+ | +20 |
| Code duplication | 9 | 3 | -67% |

---

## Rollback Plan

Each week's changes are independent:

- **Week 1 fails**: Revert command line extraction
- **Week 2 fails**: Revert notification extraction
- **Week 3 fails**: Revert screen sharing extraction
- **Week 4 fails**: Revert partition/idle extractions

**No cascading failures** - each extraction stands alone

---

## Migration Guide

For each extraction:

1. **Create new file** in appropriate directory
2. **Copy implementation** from index.js
3. **Update index.js** to use new module
4. **Test manually** - verify no regressions
5. **Add automated test** - unit or E2E
6. **Commit** - single, focused commit
7. **Deploy** - can go to production immediately

---

## Next Steps

1. **Review and approve** this plan
2. **Create feature branch**: `feature/incremental-refactoring`
3. **Start Week 1**: Extract command line logic
4. **Daily check-ins**: Monitor progress
5. **Weekly retrospectives**: Adjust plan as needed

---

*Plan Version: 1.0*
*Date: 2025-11-08*
*Based on: Critical Analysis of codebase*
