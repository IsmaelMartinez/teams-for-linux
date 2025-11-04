# Migration Completion Plan - Full Cleanup & Simplification

**Status**: 🚧 In Progress
**Goal**: Complete the architecture migration by removing all legacy code and simplifying the plugin system
**Target**: app/index.js reduced to <100 lines, permissions system removed

---

## Current State Analysis

### app/index.js (836 lines)

**Legacy Code to Migrate** (664 lines of actual logic):

1. **Notification System** (Lines 104-127, 501-602)
   - notificationSounds array
   - NodeSound player setup
   - `showNotification()` function
   - `playNotificationSound()` function
   - **Target**: Already has NotificationPlugin - migrate fully and remove from index.js

2. **State Variables** (Lines 129-137)
   - `userStatus`, `idleTimeUserStatus`, `picker`
   - **Target**: Already in StateManager via CompatibilityBridge - remove variables

3. **Legacy Modules** (Lines 140-158)
   - `certificateModule` - certificate error handling
   - `CacheManager` - cache management
   - `mainAppWindow` - window management
   - **Status**:
     - CacheManager: Already reused in InfrastructureDomain
     - mainAppWindow: Should migrate to ShellDomain
     - certificateModule: Should migrate to InfrastructureDomain

4. **IPC Handlers** (Lines 200-383)
   - `config-file-changed` → ConfigurationDomain
   - `get-config` → ConfigurationDomain
   - `get-system-idle-state` → InfrastructureDomain
   - `get-zoom-level`, `save-zoom-level` → ConfigurationDomain
   - `desktop-capturer-get-sources`, `choose-desktop-media` → ShellDomain (screen sharing)
   - `play-notification-sound`, `show-notification` → NotificationPlugin
   - `user-status-changed`, `set-badge-count` → TeamsIntegrationDomain
   - Screen sharing handlers → ShellDomain

5. **Helper Functions** (Lines 394-836)
   - `restartApp()` → Application shutdown/restart
   - `addCommandLineSwitchesBeforeConfigLoad()` → ConfigurationDomain
   - `addCommandLineSwitchesAfterConfigLoad()` → ConfigurationDomain
   - `addElectronCLIFlagsFromConfig()` → ConfigurationDomain
   - `handleAppReady()` → Application startup
   - `handleGetSystemIdleState()` → InfrastructureDomain
   - `handleGetZoomLevel()`, `handleSaveZoomLevel()` → ConfigurationDomain
   - `getPartitions()`, `getPartition()`, `savePartition()` → ConfigurationDomain
   - `handleCertificateError()` → InfrastructureDomain
   - `requestMediaAccess()` → ShellDomain
   - `userStatusChangedHandler()` → TeamsIntegrationDomain
   - `setBadgeCountHandler()` → NotificationPlugin
   - `handleGlobalShortcutDisabled()`, `handleGlobalShortcutDisabledRevert()` → ShellDomain
   - `showScreenPicker()` → ShellDomain
   - `onRenderProcessGone()` → InfrastructureDomain
   - `onAppTerminated()` → Application

---

## Permissions System Analysis

### Current Implementation

**Files with Permissions**:
1. `app/plugins/PluginAPI.js` - Permissions checking
2. `app/plugins/BasePlugin.js` - Permissions property
3. `app/core/PluginManager.js` - Manifest validation includes permissions
4. `app/plugins/core/notifications/manifest.json` - Declares permissions

**Permissions Used**:
- `events:subscribe` - Listen to EventBus
- `events:emit` - Emit to EventBus
- `config:read` - Read configuration
- `config:write` - Write configuration
- `logging` - Use logger
- `*` - Wildcard (all permissions)

### Why Remove?

For **internal plugins only** (v3.0 scope), permissions add unnecessary complexity:

1. **Trust Model**: All core plugins are trusted (built into the app)
2. **No Sandboxing**: Plugins run in same process, no real isolation
3. **Maintenance Burden**: Need to maintain permission checks, tests, documentation
4. **Developer Friction**: Forces developers to declare permissions for every operation
5. **False Security**: Doesn't prevent malicious code (no real security boundary)

**Conclusion**: Remove for v3.0, reconsider if/when external plugins are supported (post-v3.0).

---

## Migration Plan

### Phase 1: Simplify Plugin System ✅ (Current Task)

**Objective**: Remove permissions system to reduce complexity.

#### 1.1 Remove Permissions from PluginAPI
- [ ] Remove `_permissions` set from constructor
- [ ] Remove `_hasPermission()` method
- [ ] Remove `_requirePermission()` method
- [ ] Remove all `this._requirePermission()` calls from methods
- [ ] Update tests to remove permission-related tests

#### 1.2 Remove Permissions from BasePlugin
- [ ] Remove `permissions` property
- [ ] Remove permissions getter
- [ ] Update tests to remove permission-related tests

#### 1.3 Remove Permissions from PluginManager
- [ ] Remove permissions validation from manifest validation
- [ ] Remove permissions from plugin state
- [ ] Update tests to remove permission validation tests

#### 1.4 Remove Permissions from Manifests
- [ ] Remove `permissions` field from notifications/manifest.json
- [ ] Update manifest schema documentation

#### 1.5 Update Tests
- [ ] Remove 26 manifest validation tests for permissions
- [ ] Remove permission-related tests from PluginAPI tests
- [ ] Remove permission-related tests from BasePlugin tests

**Estimated Lines Removed**: ~200 lines of code + ~150 lines of tests

---

### Phase 2: Migrate Configuration Operations

**Objective**: Move all config operations to ConfigurationDomain.

#### 2.1 Command Line Switches
- [ ] Move `addCommandLineSwitchesBeforeConfigLoad()` → ConfigurationDomain.initializeEarlyCommandSwitches()
- [ ] Move `addCommandLineSwitchesAfterConfigLoad()` → ConfigurationDomain.initializeCommandSwitches()
- [ ] Move `addElectronCLIFlagsFromConfig()` → ConfigurationDomain.applyElectronFlags()

#### 2.2 Zoom Level Management
- [ ] Move `handleGetZoomLevel()` → ConfigurationDomain.getZoomLevel()
- [ ] Move `handleSaveZoomLevel()` → ConfigurationDomain.saveZoomLevel()
- [ ] Update IPC handlers to call ConfigurationDomain methods

#### 2.3 Partitions Management
- [ ] Move `getPartitions()` → ConfigurationDomain.getPartitions()
- [ ] Move `getPartition()` → ConfigurationDomain.getPartition()
- [ ] Move `savePartition()` → ConfigurationDomain.savePartition()

#### 2.4 IPC Handlers
- [ ] `config-file-changed` → ConfigurationDomain.handleConfigFileChanged()
- [ ] `get-config` → ConfigurationDomain.getConfig()

**Lines to Move**: ~150 lines

---

### Phase 3: Migrate Infrastructure Operations

**Objective**: Move system-level operations to InfrastructureDomain.

#### 3.1 Certificate Handling
- [ ] Move certificate module logic → InfrastructureDomain.CertificateManager service
- [ ] Move `handleCertificateError()` → CertificateManager.handleError()
- [ ] Register app.on('certificate-error') in InfrastructureDomain

#### 3.2 System Monitoring
- [ ] Move `handleGetSystemIdleState()` → InfrastructureDomain.getSystemIdleState()
- [ ] Move `onRenderProcessGone()` → InfrastructureDomain.handleProcessCrash()

#### 3.3 IPC Handlers
- [ ] `get-system-idle-state` → InfrastructureDomain.getSystemIdleState()

**Lines to Move**: ~100 lines

---

### Phase 4: Migrate Shell Operations

**Objective**: Move all window/tray/screen operations to ShellDomain.

#### 4.1 Screen Sharing
- [ ] Move `showScreenPicker()` → ShellDomain.showScreenPicker()
- [ ] Move screen sharing IPC handlers → ShellDomain.registerScreenSharingHandlers()
- [ ] IPC: `desktop-capturer-get-sources`, `choose-desktop-media`, `cancel-desktop-media`
- [ ] IPC: `screen-sharing-started`, `screen-sharing-stopped`

#### 4.2 Global Shortcuts
- [ ] Move `handleGlobalShortcutDisabled()` → ShellDomain.disableGlobalShortcuts()
- [ ] Move `handleGlobalShortcutDisabledRevert()` → ShellDomain.revertGlobalShortcuts()
- [ ] Register browser-window-focus/blur in ShellDomain

#### 4.3 Media Access (macOS)
- [ ] Move `requestMediaAccess()` → ShellDomain.requestMediaAccess()
- [ ] Call during ShellDomain initialization

#### 4.4 Main Window Management
- [ ] Fully migrate `mainAppWindow` module → ShellDomain.WindowManager
- [ ] Move `onAppSecondInstance` handler → ShellDomain

**Lines to Move**: ~250 lines

---

### Phase 5: Migrate Teams Integration Operations

**Objective**: Move Teams-specific operations to TeamsIntegrationDomain.

#### 5.1 User Status
- [ ] Move `userStatusChangedHandler()` → TeamsIntegrationDomain.handleUserStatusChanged()
- [ ] IPC: `user-status-changed` → TeamsIntegrationDomain

#### 5.2 Badge Count
- [ ] Move `setBadgeCountHandler()` → NotificationPlugin or TeamsIntegrationDomain
- [ ] IPC: `set-badge-count` → appropriate domain

**Lines to Move**: ~30 lines

---

### Phase 6: Complete Notification Plugin Migration

**Objective**: Remove all notification code from app/index.js.

#### 6.1 Remove Legacy Code
- [ ] Remove `notificationSounds` array (already in plugin)
- [ ] Remove `player` setup (already in plugin)
- [ ] Remove `showNotification()` function (already in plugin)
- [ ] Remove `playNotificationSound()` function (already in plugin)

#### 6.2 IPC Handlers
- [ ] Verify IPC handlers call plugin methods
- [ ] Remove handlers from index.js (should be in plugin)

**Lines to Remove**: ~100 lines

---

### Phase 7: Refactor Application Startup

**Objective**: Streamline app/index.js to minimal orchestration.

#### 7.1 Application.js Enhancements
- [ ] Add `Application.registerElectronHandlers()` for app lifecycle events
- [ ] Move `handleAppReady()` logic → Application.onReady()
- [ ] Move `onAppTerminated()` → Application.onTerminated()
- [ ] Move `restartApp()` → Application.restart()

#### 7.2 IPC Security
- [ ] Move IPC security wrappers → InfrastructureDomain.IPCValidator
- [ ] Auto-wrap during InfrastructureDomain initialization

#### 7.3 Single Instance Lock
- [ ] Move lock logic → Application.ensureSingleInstance()

**Lines to Move**: ~150 lines

---

### Phase 8: Remove CompatibilityBridge

**Objective**: Remove temporary bridge once all code uses domains directly.

#### 8.1 Verify No Dependencies
- [ ] Search codebase for CompatibilityBridge usage
- [ ] Verify all global variables replaced with StateManager calls
- [ ] Verify all legacy functions migrated to domains

#### 8.2 Remove Files
- [ ] Delete `app/core/CompatibilityBridge.js`
- [ ] Delete `app/core/ConfigAdapter.js` (if only used by bridge)
- [ ] Remove bridge initialization from app/index.js

**Lines to Remove**: ~400 lines (279 from bridge + cleanup)

---

## Target app/index.js Structure (<100 lines)

```javascript
/**
 * app/index.js - Teams for Linux v3.0 Entry Point
 * Minimal orchestration - all logic in domains/plugins
 */

const { app } = require('electron');
const Application = require('./core/Application');

// =============================================================================
// EARLY INITIALIZATION (before app ready)
// =============================================================================

// Support for E2E testing
if (process.env.E2E_USER_DATA_DIR) {
  app.setPath('userData', process.env.E2E_USER_DATA_DIR);
}

// =============================================================================
// APPLICATION INITIALIZATION
// =============================================================================

let application;

async function main() {
  try {
    // Create Application instance
    application = new Application({
      appVersion: app.getVersion(),
      userDataPath: app.getPath('userData'),
      appPath: __dirname,
      isPackaged: app.isPackaged,
      domains: ['infrastructure', 'configuration', 'shell', 'teams-integration'],
      plugins: ['core/notifications'] // Auto-load core plugins
    });

    // Initialize application (loads domains and plugins)
    await application.init();

    // Start application (registers handlers, creates windows)
    await application.start();

    console.info('✓ Teams for Linux v3.0 started successfully');
  } catch (error) {
    console.error('Failed to start application:', error);
    app.quit();
  }
}

// =============================================================================
// ELECTRON LIFECYCLE
// =============================================================================

// Ensure single instance
if (!application.ensureSingleInstance()) {
  app.quit();
} else {
  app.on('ready', main);
  app.on('quit', () => application?.shutdown());
  app.on('will-quit', () => console.debug('will-quit'));

  // Graceful shutdown on signals
  process.on('SIGTERM', () => application?.shutdown());
  process.on('SIGINT', () => application?.shutdown());
}
```

**Target**: ~70 lines (down from 836)

---

## Files to Delete After Migration

1. ✅ `app/index.js.backup-phase1` - No longer needed
2. ✅ `app/core/CompatibilityBridge.js` - Temporary migration helper
3. ✅ `app/core/ConfigAdapter.js` - Temporary migration helper
4. ⏳ `app/mainAppWindow/` - Migrated to ShellDomain.WindowManager
5. ⏳ `app/certificate/` - Migrated to InfrastructureDomain.CertificateManager

---

## Testing Strategy

### For Each Migration Step

1. **Before Migration**:
   - Run full test suite (unit + integration)
   - Document current behavior
   - Identify IPC channels used

2. **During Migration**:
   - Move code to domain
   - Update IPC handlers to call domain methods
   - Add domain tests for new methods
   - Keep old code commented out

3. **After Migration**:
   - Run full test suite
   - Test affected features manually
   - Verify IPC channels still work
   - Remove commented code

### Critical Paths to Validate

1. **Application Startup**: App launches successfully
2. **Teams Login**: Can log in and access Teams
3. **Notifications**: System notifications appear
4. **Screen Sharing**: Screen picker works, preview window appears
5. **Configuration**: Settings persist across restarts
6. **Tray**: Tray icon appears, menu works

---

## Timeline Estimate

| Phase | Effort | Duration |
|-------|--------|----------|
| Phase 1: Remove Permissions | Medium | 2 hours |
| Phase 2: Config Operations | Medium | 3 hours |
| Phase 3: Infrastructure Ops | Medium | 3 hours |
| Phase 4: Shell Operations | Large | 5 hours |
| Phase 5: Teams Integration | Small | 1 hour |
| Phase 6: Notifications Cleanup | Small | 1 hour |
| Phase 7: Application Refactor | Large | 4 hours |
| Phase 8: Remove Bridge | Small | 1 hour |
| **Testing & Validation** | Large | 4 hours |
| **Total** | | **24 hours** |

---

## Success Criteria

- ✅ app/index.js < 100 lines
- ✅ No permissions system in codebase
- ✅ All 99+ tests passing
- ✅ No CompatibilityBridge or ConfigAdapter
- ✅ All legacy modules migrated or deleted
- ✅ All IPC handlers registered through domains
- ✅ Application startup clean and simple
- ✅ E2E tests passing
- ✅ No regression in functionality

---

## Risks & Mitigations

### Risk 1: Breaking Existing Functionality
**Mitigation**: Comprehensive testing after each phase, keep commented backup code until validated

### Risk 2: IPC Channel Breakage
**Mitigation**: Keep IPC channel names identical, only change handler location

### Risk 3: Initialization Order Dependencies
**Mitigation**: Document dependencies, test startup sequence thoroughly

### Risk 4: State Management Issues
**Mitigation**: Use StateManager consistently, add logging for state changes

---

**Status**: Ready to begin Phase 1
**Next Step**: Remove permissions system from plugin architecture
