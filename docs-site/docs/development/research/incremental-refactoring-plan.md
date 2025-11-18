# Incremental Refactoring Plan

**Supersedes**: [#1799 - Architecture Modernization](https://github.com/IsmaelMartinez/teams-for-linux/issues/1799) (Closed - DDD+Plugin approach)
**Status**: Active Plan
**Created**: 2025-11-08
**Type**: Practical Implementation Guide

:::tip Active Architecture Plan
This is the **adopted approach** for modernizing the Teams for Linux architecture. It replaces the [archived DDD+Plugin plan](./architecture-modernization-research.md) with a lower-risk, incremental approach.

**Key Difference**: Delivers value continuously (week 1, 2, 3...) instead of all-or-nothing after 10 weeks.
:::

---

## Philosophy

> "Make the change easy, then make the easy change." - Kent Beck

Instead of a 10-week big-bang architectural overhaul, this plan extracts functionality incrementally:

- ✅ **Small, independent changes** - Each week's work stands alone
- ✅ **Continuous value delivery** - Improvements ship to production immediately
- ✅ **Low-risk, reversible steps** - Can roll back any change independently
- ✅ **Test as you go** - Add automated tests with each extraction
- ✅ **Production-ready at each step** - No "work in progress" branches

---

## Overview

### Problem Statement

The `app/index.js` file has grown to **755 lines** and contains:
- 27 IPC handlers (64% of all IPC handlers in the app)
- Global state management
- Notification logic
- Screen sharing handlers
- Command line configuration
- Partition management
- Idle state monitoring

**This is not catastrophic**, but it can be improved incrementally.

### Solution Approach

**Extract pure functions and cohesive modules** from `index.js` into dedicated files:

| Extraction | Lines Removed | Risk Level | Week |
|------------|---------------|------------|------|
| Command line logic | -94 | Zero | 1 |
| Notification system | -83 | Low | 2 |
| Screen sharing handlers | -124 | Medium | 3 |
| Partitions & idle state | -73 | Low | 4 |

**Total impact**: Reduce `index.js` from **755 → 381 lines (49% reduction)**

### Timeline

```
Phase 1: Extract Functions (Weeks 1-4)
├── Week 1: Command Line Logic
├── Week 2: Notification System
├── Week 3: Screen Sharing Handlers
└── Week 4: Partitions & Idle State

Phase 2: Improve Testability (Weeks 5-8)
├── Week 5: Refactor Singleton Exports
├── Week 6: Fix IPC Registration Pattern
├── Week 7: Add Automated Tests (20+)
└── Week 8: Auto-generate IPC Docs

Phase 3: Further Improvements (Future)
└── Only if Phase 1 & 2 reveal need for more structure
```

---

## Phase 1: Extract Pure Functions (Weeks 1-4)

**Goal**: Reduce `index.js` from 755 lines to less than 400 lines with minimal risk.

### Week 1: Command Line Logic

**New File**: `app/startup/commandLine.js`

**Extract from index.js:**
1. `addCommandLineSwitchesBeforeConfigLoad()` - Lines 316-335 (20 lines)
2. `addCommandLineSwitchesAfterConfigLoad()` - Lines 337-387 (51 lines)
3. `addElectronCLIFlagsFromConfig()` - Lines 389-411 (23 lines)

**Total extraction**: 94 lines

**Implementation pattern**:

```javascript
// app/startup/commandLine.js
const { app } = require("electron");

class CommandLineManager {
  /**
   * Add command line switches before config is loaded
   * Must be called before app.getPath('userData')
   */
  static addSwitchesBeforeConfigLoad() {
    if (process.argv.includes("--sandbox")) {
      app.enableSandbox();
    }
  }

  /**
   * Add command line switches after config is loaded
   * @param {Object} config - Application configuration
   */
  static addSwitchesAfterConfigLoad(config) {
    // Wayland detection and GPU config
    // ... implementation
  }

  /**
   * Add Electron CLI flags from config
   */
  static addElectronCLIFlags(config) {
    // ... implementation
  }
}

module.exports = CommandLineManager;
```

**Changes to index.js**:

```javascript
// Replace direct function calls with:
const CommandLineManager = require("./startup/commandLine");
CommandLineManager.addSwitchesBeforeConfigLoad();
// ... later ...
CommandLineManager.addSwitchesAfterConfigLoad(config);
```

**Testing**:
```bash
npm start  # Manual verification
npm run test:e2e  # Automated E2E test
```

**Success criteria**:
- ✅ App starts normally
- ✅ All command line flags work
- ✅ No regressions in Wayland/X11
- ✅ index.js reduced by 94 lines

---

### Week 2: Notification System

**New Files**:
- `app/notifications/service.js` - Main process notification logic
- `app/notifications/sound.js` - Sound playback (optional separation)

**Extract from index.js:**
1. `showNotification()` - Lines 413-463 (51 lines)
2. `playNotificationSound()` - Lines 465-494 (30 lines)
3. IPC handler registration - Lines 143-144 (2 lines)

**Total extraction**: 83 lines

**Key improvement**: Break coupling between notifications and user status by injecting status via dependency.

**Implementation pattern**:

```javascript
// app/notifications/service.js
const { Notification, nativeImage, ipcMain } = require("electron");

class NotificationService {
  #soundPlayer;
  #config;
  #mainWindow;
  #getUserStatus; // Injected function to get current user status

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
    // Implementation from index.js:413-463
  }

  async #playSound(_event, options) {
    // Implementation from index.js:465-494
    const userStatus = this.#getUserStatus(); // Use injected function
    // ... rest of logic
  }
}

module.exports = NotificationService;
```

**Benefits**:
- ✅ Breaks coupling (user status injected, not accessed globally)
- ✅ Testable (can mock dependencies)
- ✅ Single Responsibility (notification concerns isolated)

**Testing**: Unit tests for notification service with mocked dependencies

**Success criteria**:
- ✅ Notifications work normally
- ✅ Sound playback respects user status
- ✅ Unit tests pass
- ✅ index.js reduced by 83 lines

---

### Week 3: Screen Sharing Handlers

**New File**: `app/screenSharing/service.js`

**Extract from index.js:**
1. All 9 screen sharing IPC handlers - Lines 152-275 (124 lines)
2. Encapsulate `globalThis.selectedScreenShareSource` state

**Total extraction**: 124 lines

**Key improvement**: Eliminate global state by encapsulating in service class.

**Implementation pattern**:

```javascript
// app/screenSharing/service.js
const { ipcMain } = require("electron");

class ScreenSharingService {
  #selectedSource = null;
  #previewWindow = null;

  /**
   * Register all screen sharing IPC handlers
   */
  initialize() {
    ipcMain.on("screen-sharing-started", this.#handleStarted.bind(this));
    ipcMain.on("screen-sharing-stopped", this.#handleStopped.bind(this));
    ipcMain.handle("get-screen-sharing-status", this.#getStatus.bind(this));
    ipcMain.handle("get-screen-share-stream", this.#getStream.bind(this));
    ipcMain.handle("get-screen-share-screen", this.#getScreen.bind(this));
    ipcMain.on("resize-preview-window", this.#resizePreview.bind(this));
    ipcMain.on("stop-screen-sharing-from-thumbnail", this.#stopFromThumbnail.bind(this));
  }

  // Public API for main window to use
  setPreviewWindow(window) { this.#previewWindow = window; }
  setSource(sourceId) { this.#selectedSource = sourceId; }
  getSource() { return this.#selectedSource; }
  clearSource() { this.#selectedSource = null; }

  // Private IPC handlers
  #handleStarted(event, sourceId) { /* ... */ }
  #handleStopped() { /* ... */ }
  #getStatus() { return this.#selectedSource !== null; }
  // ... other handlers
}

module.exports = new ScreenSharingService();
```

**Changes to other files**:
```javascript
// Replace all globalThis.selectedScreenShareSource with:
const screenSharingService = require("./screenSharing/ipcHandlers");
screenSharingService.setSource(sourceId);
screenSharingService.getSource();
```

**Benefits**:
- ✅ Encapsulates global state (no more globalThis)
- ✅ All screen sharing logic in one module
- ✅ Clear API for other modules to use

**Testing**: E2E tests for screen sharing lifecycle

**Success criteria**:
- ✅ Screen sharing works normally
- ✅ Preview window functions correctly
- ✅ No global state leaks
- ✅ index.js reduced by 124 lines

---

### Week 4: Additional Extractions

#### Partition Management

**New File**: `app/partitions/manager.js`

**Extract from index.js:**
- `getPartitions()`, `getPartition()`, `savePartition()` - Lines 639-662 (24 lines)
- IPC handlers for zoom level - Lines 627-637 (11 lines)

**Total**: 33 lines

**Implementation**: Simple class with CRUD operations for partition data.

#### Idle State Monitor

**New File**: `app/idle/monitor.js`

**Extract from index.js:**
- `handleGetSystemIdleState()` - Lines 587-625 (39 lines)
- IPC handler registration - Line 126 (1 line)

**Total**: 40 lines

**Key improvement**: Encapsulate `idleTimeUserStatus` state, inject user status getter.

---

## Phase 1 Summary

**Total Impact After 4 Weeks**:

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| index.js LOC | 755 | 381 | **-49%** |
| IPC in index.js | 27/42 | 7/42 | **-74%** |
| Extractable LOC | 374 | less than 50 | **-87%** |
| Global variables | 10 | 6 | -40% |
| New modules | 0 | 7 | +7 |
| Code duplications | 9+ | 6 | -33% |
| Testable modules | 0 | 5 | +5 |

**Deliverables**:
- 7 new, focused modules
- 374 lines removed from index.js
- Zero breaking changes
- Production-ready at each step
- Foundation for Phase 2

---

## Phase 2: Testability & Quality (Weeks 5-8)

**Goal**: Make the codebase testable and add automated tests.

### Week 5: Singleton Refactoring ✅ COMPLETE

**Status**: ✅ **Completed** - 2025-11-18

**Problem**: Several modules export singleton instances, preventing fresh instances for testing.

**Current pattern**:
```javascript
// connectionManager/index.js
class ConnectionManager { /* ... */ }
module.exports = new ConnectionManager(); // Singleton export
```

**Refactored pattern**:
```javascript
// connectionManager/index.js
class ConnectionManager { /* ... */ }
module.exports = ConnectionManager; // Export class

// mainAppWindow/index.js
const ConnectionManager = require("./connectionManager");
const connectionManager = new ConnectionManager();

// menus/index.js - receives instance via dependency injection
class Menus {
  constructor(window, configGroup, iconPath, connectionManager) {
    this.connectionManager = connectionManager;
    // ...
  }
}
```

**Benefits**:
- ✅ Can create fresh instances for each test
- ✅ No shared state between tests
- ✅ Explicit dependency injection

**Completed Changes**:
- ✅ `connectionManager/index.js` - Exports class instead of singleton
- ✅ `mainAppWindow/index.js` - Creates ConnectionManager instance
- ✅ `menus/index.js` - Receives connectionManager via constructor dependency injection

---

### Week 6: IPC Registration Pattern ✅ COMPLETE

**Status**: ✅ **Completed** - 2025-11-18

**Problem**: Some modules register IPC handlers in constructors, creating side effects.

**Current anti-pattern**:
```javascript
// menus/tray.js
class Tray {
  constructor(window, appMenu, iconPath, config) {
    // ... other init ...
    ipcMain.on("tray-update", this.#handleTrayUpdate); // Side effect!
  }
}
```

**Refactored pattern**:
```javascript
class ApplicationTray {
  constructor(window, appMenu, iconPath, config) {
    // No IPC registration in constructor
    this.tray = new Tray(...);
    // Setup UI only
  }

  initialize() {
    ipcMain.on("tray-update", this.#handleTrayUpdate.bind(this));
  }

  #handleTrayUpdate(_event, data) {
    this.updateTrayImage(data.icon, data.flash, data.count);
  }
}

// menus/index.js - calls initialize() after construction
this.tray = new Tray(...);
this.tray.initialize();
```

**Benefits**:
- ✅ Can instantiate without side effects
- ✅ Testable in isolation
- ✅ Explicit initialization phase

**Completed Changes**:
- ✅ `menus/tray.js` - Moved IPC registration to `initialize()` method
- ✅ `menus/index.js` - Calls `tray.initialize()` after construction
- ✅ All Phase 1 modules already follow this pattern (notifications, screenSharing, partitions, idle)

---

### Week 7: Automated Testing

**Status**: ⚠️ **Reassessing Feasibility**

**Current Reality**:
- Existing Playwright setup (PR #1880) only verifies app loads
- No login or actual Teams flow testing
- **Blocker**: Microsoft authentication likely blocks automated login (bot detection)
- Full E2E testing may not be achievable or worth the effort

**What's Currently Testable**:

**Limited E2E tests** (already in place):
```javascript
// tests/e2e/startup.test.js - ✅ Working
test('app starts successfully', async () => {
  const { electronApp } = await launchElectronApp();
  const window = await electronApp.firstWindow();
  expect(await window.title()).toContain("Teams for Linux");
});
```

**Potential unit tests** for extracted modules:
```javascript
// tests/unit/partitions/manager.test.js
// Can test CRUD operations without MS Teams dependency

// tests/unit/idle/monitor.test.js
// Can test idle state logic in isolation

// tests/unit/startup/commandLine.test.js
// Can test command line flag parsing
```

**Cannot Reliably Test** (MS authentication required):
- ❌ Login flows (bot detection)
- ❌ Notification flows (requires authenticated Teams session)
- ❌ Screen sharing lifecycle (requires active meeting)
- ❌ Presence/status updates (requires Teams backend)

**Revised Approach**:
- Focus on unit tests for business logic that doesn't require MS authentication
- Keep basic E2E test (app startup verification)
- Consider manual testing checklist for authentication-dependent features
- Document testing limitations in ADR

**Benefits of Limited Testing**:
- ✅ Basic smoke tests prevent catastrophic breakage
- ✅ Unit tests for utility functions provide some confidence
- ⚠️ But won't catch integration issues or MS Teams-specific problems

---

### Week 8: Documentation Automation ✅ COMPLETE

**Status**: ✅ **Completed** - 2025-11-18

**Created IPC documentation generator**:

```javascript
// scripts/generateIpcDocs.js
// Scans all ipcMain.handle/on calls across codebase
// Generates docs-site/docs/development/ipc-api-generated.md automatically
// Keeps documentation in sync with code
```

**Usage**:
```bash
npm run generate-ipc-docs
```

**Output**: `docs-site/docs/development/ipc-api-generated.md`

**Features**:
- ✅ Automatically scans entire codebase for IPC registrations
- ✅ Categorizes channels by module (Notifications, Screen Sharing, etc.)
- ✅ Generates markdown table with channel name, type, description, and location
- ✅ Found 31 IPC channels across 11 categories
- ✅ Includes links to source code locations

**Benefits**:
- ✅ Always up-to-date IPC documentation
- ✅ No manual maintenance required
- ✅ Can be used to validate IPC security allowlist
- ✅ Provides comprehensive overview of all IPC communications

---

## Phase 2 Summary

**Status**: ✅ **Completed** (Partial - High-Value Items) - 2025-11-18

Phase 2 was originally designed to improve testability and add extensive automated testing. After Phase 1 completion, we focused on high-value, achievable improvements:

**Testability Improvements** ✅ **COMPLETED**:
- ✅ Singleton refactoring - Makes code more testable
- ✅ IPC registration patterns - Reduces side effects
- ✅ Documentation automation - Reduces maintenance burden

**Automated Testing** ⚠️ **DEFERRED** (Per user request - tests skipped):
- ⚠️ MS authentication blocks most E2E testing (bot detection)
- ⚠️ Current tests only verify app startup, not actual flows
- ⚠️ Target of "20+ tests" and "40% coverage" not realistic for this codebase
- ⚠️ Manual testing remains the practical approach for Teams-dependent features

**Phase 2 Achievements**:

| Metric | Before | After Phase 2 | Original Goal |
|--------|--------|---------------|---------------|
| Singleton exports | 1 | 0 | 0 ✅ |
| Constructor IPC registration | 1 | 0 | 0 ✅ |
| Automated tests | 1 (startup) | 1 (startup) | 20+ (deferred) |
| Test coverage | ~1% | ~1% | 40%+ (deferred) |
| IPC docs | Manual | Auto-generated ✅ | Auto-generated ✅ |

**Completed Deliverables**:
1. ✅ ConnectionManager refactored to export class (not singleton)
2. ✅ ApplicationTray IPC registration moved to initialize() method
3. ✅ IPC documentation generator script (`scripts/generateIpcDocs.js`)
4. ✅ All Phase 1 modules already follow best practices (no singleton exports, initialize() pattern)

**Outcome**: Successfully improved code quality and maintainability without the unrealistic goal of extensive automated testing for an Electron wrapper around a web application with authentication barriers.

---

## Phase 3: Further Improvements (Future)

**Only proceed if Phase 1 & 2 reveal need for more structure.**

Potential additions:
- Event bus for cross-module communication (if needed)
- Plugin system for community extensions (if requested)
- Domain boundaries (if complexity grows)

**Guiding principle**: Let the code guide the architecture, not theory.

---

## Success Metrics

### Definition of Success

**After Phase 1** (4 weeks):
- ✅ index.js reduced by 49%
- ✅ IPC handlers 74% less centralized
- ✅ No regressions in functionality
- ✅ Each change deployed to production

**After Phase 2** (8 weeks):
- ✅ 20+ automated tests passing
- ✅ All modules testable in isolation
- ✅ IPC documentation auto-generated
- ✅ Test coverage >40%

### Measuring Impact

**Code quality metrics**:
- Lines of code in index.js
- Number of IPC handlers in index.js
- Cyclomatic complexity of large functions
- Number of global variables

**Development velocity metrics**:
- Time to add new feature
- Time to fix bug
- Time to onboard new contributor

**Stability metrics**:
- Test pass rate
- Regression count per release
- Issue resolution time

---

## Risk Management

### Rollback Strategy

Each week's changes are **independent and reversible**:

- **Week 1 fails**: Revert command line extraction, continue with Week 2
- **Week 2 fails**: Revert notification extraction, continue with Week 3
- **Week 3 fails**: Revert screen sharing extraction, continue with Week 4
- **Week 4 fails**: Revert partition/idle extractions

**No cascading failures** - each extraction stands alone.

### Testing Strategy

For each extraction:

1. **Manual testing** - Verify no regressions
2. **E2E testing** - Add automated test for critical path
3. **Code review** - Peer review before merge
4. **Canary deployment** - Test with subset of users (if applicable)
5. **Monitor** - Watch for errors after deployment

### Known Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|---------|------------|
| Breaking IPC communication | Low | High | Thorough testing, gradual rollout |
| Performance regression | Very Low | Medium | Benchmark before/after |
| Global state issues | Low | Medium | Encapsulate state carefully |
| Test framework overhead | Low | Low | Use existing Playwright setup |

---

## Implementation Guidelines

### For Each Extraction

1. **Read the code** - Understand current implementation thoroughly
2. **Create new file** - Set up module structure
3. **Copy implementation** - Move code to new module
4. **Update imports** - Change index.js to use new module
5. **Test manually** - Verify no regressions
6. **Add automated test** - Create E2E or unit test
7. **Commit** - Single, focused commit with clear message
8. **Deploy** - Ship to production, monitor for issues

### Code Style

**Follow existing patterns**:
- Use `const` by default, `let` for reassignment
- Use `async/await` instead of promises
- Use `#privateField` syntax for private class members
- Use arrow functions for concise callbacks
- Document with JSDoc comments

**Maintain security**:
- All IPC channels must be in `ipcValidator.js` allowlist
- Validate all IPC inputs
- Maintain context isolation settings
- Follow existing CSP patterns

### Documentation

**Update as you go**:
- Update README.md in module directories
- Add JSDoc comments to public APIs
- Update IPC documentation (will be automated in Week 8)
- Cross-reference related modules

---

## Comparison to Archived Plan

### Why This Plan is Better

| Aspect | DDD+Plugin Plan (Archived) | Incremental Plan (Active) |
|--------|---------------------------|---------------------------|
| **Timeline** | 10 weeks (all-or-nothing) | 4-8 weeks (continuous delivery) |
| **Risk** | High (35 modules must convert) | Low (independent changes) |
| **Complexity** | Higher (8+ new abstractions) | Lower (extract existing code) |
| **First value** | Week 10 | Week 1 |
| **Rollback cost** | Very high (entire plan) | Low (per-week rollback) |
| **Lines changed** | 2000+ | 500 |
| **New patterns** | Many (DDD, plugins, events) | Few (classes, modules) |
| **Testing** | Theoretical | Practical (add as you go) |

### What We Keep from the Old Plan

The DDD+Plugin research wasn't wasted:

- ✅ **Module inventory** - Comprehensive list of all 35 modules
- ✅ **IPC analysis** - Understanding of all IPC patterns
- ✅ **Risk identification** - DOM access constraint documented
- ✅ **Testing strategy** - Framework selection (Playwright + Vitest)

We're taking the **best insights** (modular organization, testing) and applying them **incrementally**.

---

## Progress Tracking

### 🎉 Phase 1 Status: COMPLETE ✓

| Extraction | Task | Status | Lines Removed | Date Completed |
|------------|------|--------|---------------|----------------|
| Extraction 1 | Command Line Logic | 🟢 Completed | **96** (Target: 94) | 2025-11-13 |
| Extraction 2 | Notification System | 🟢 Completed | **~82** (Target: 83) | 2025-11-14 |
| Extraction 3 | Screen Sharing Handlers | 🟢 Completed | **~166** (Target: 124) | 2025-11-15 |
| Extraction 4 | Partitions & Idle State | 🟢 Completed | **~68** (Target: 73) | 2025-11-16 |

**Phase 1 Complete!**

**Phase 2 Tasks:**
| Task | Status | Completed Date |
|------|--------|----------------|
| Week 5: Singleton Refactoring | 🟢 Completed | 2025-11-18 |
| Week 6: IPC Registration Pattern | 🟢 Completed | 2025-11-18 |
| Week 7: Automated Testing | ⏸️ Deferred | N/A (Per user request) |
| Week 8: Documentation Automation | 🟢 Completed | 2025-11-18 |

**Note**: Phase 2 high-value improvements completed. Testing deferred due to MS authentication constraints and user request to skip tests.

**Legend**: 🟢 Completed | 🟡 In Progress | ⚪ Not Started | 🔴 Blocked | ⏸️ Deferred

**Overall Progress**: Phase 1 ✅ Complete | Phase 2 ✅ Complete (High-Value Items) | Phase 3 ⚪ Future

### Final Metrics

**index.js LOC**: 755 → **339** lines (**55% reduction**)
**Total Removed**: **416 lines** (Target: 374 lines - **111% of goal!**)
**Extractions**: 4 of 4 complete

**New Modules Created:**
- `app/startup/commandLine.js` - Command line switches and configuration
- `app/notifications/service.js` - Notification system and sounds
- `app/screenSharing/service.js` - Screen sharing IPC handlers and state
- `app/partitions/manager.js` - Partition zoom level management
- `app/idle/monitor.js` - System idle state monitoring

**Timeline Note**: This is a volunteer OSS project with work done as time permits. Phase 1 completed in ~3 days of actual work time.

---

## Related Documentation

- [Architecture Modernization Research (Archived)](./architecture-modernization-research.md) - The original DDD+Plugin plan and why it was deemed too complex
- [IPC API Documentation](../ipc-api.md) - Current IPC channel reference
- [Automated Testing Strategy](./automated-testing-strategy.md) - Testing framework selection

---

## Conclusion

**This incremental plan delivers continuous value with minimal risk.**

- **Week 1**: 94 lines removed, app starts cleaner
- **Week 4**: 374 lines removed, 49% smaller index.js
- **Week 8**: Testable codebase with 20+ automated tests

**No big-bang migration. No architectural complexity. Just steady, measurable improvement.**

Let the code guide the architecture.

---

*Status: Active Plan*
*Last Updated: 2025-11-08*
*Maintainer: Project Team*
