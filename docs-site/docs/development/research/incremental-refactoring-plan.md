# Incremental Refactoring Plan

**Issue**: [#1799 - Architecture Modernization](https://github.com/IsmaelMartinez/teams-for-linux/issues/1799)
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

**Goal**: Reduce `index.js` from 755 lines to <400 lines with minimal risk.

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

**New File**: `app/screenSharing/ipcHandlers.js`

**Extract from index.js:**
1. All 9 screen sharing IPC handlers - Lines 152-275 (124 lines)
2. Encapsulate `globalThis.selectedScreenShareSource` state

**Total extraction**: 124 lines

**Key improvement**: Eliminate global state by encapsulating in service class.

**Implementation pattern**:

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
| Extractable LOC | 374 | <50 | **-87%** |
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

### Week 5: Singleton Refactoring

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

// index.js
const ConnectionManager = require("./connectionManager");
const connectionManager = new ConnectionManager();
```

**Benefits**:
- ✅ Can create fresh instances for each test
- ✅ No shared state between tests
- ✅ Explicit dependency injection

**Apply to**: `connectionManager`, `screenSharingService` (from Phase 1)

---

### Week 6: IPC Registration Pattern

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
class Tray {
  constructor(window, appMenu, iconPath, config) {
    // No IPC registration in constructor
  }

  initialize() {
    ipcMain.on("tray-update", this.#handleTrayUpdate.bind(this));
  }

  #handleTrayUpdate(_event, data) {
    this.updateTrayImage(data.icon, data.flash, data.count);
  }
}
```

**Benefits**:
- ✅ Can instantiate without side effects
- ✅ Testable in isolation
- ✅ Explicit initialization phase

**Apply to**: `menus/tray.js` and any other modules with constructor IPC registration

---

### Week 7: Automated Testing

**Framework**: Use existing Playwright setup from PR #1880

**Add E2E tests**:

```javascript
// tests/e2e/startup.test.js
test('app starts successfully with command line args', async () => {
  const { electronApp } = await launchElectronApp();
  const window = await electronApp.firstWindow();
  expect(await window.title()).toContain("Teams for Linux");
});

// tests/e2e/notifications.test.js
test('notification shows and plays sound', async () => {
  // Test notification flow
});

// tests/e2e/screenSharing.test.js
test('screen sharing lifecycle works correctly', async () => {
  // Test screen sharing
});
```

**Add unit tests** for extracted modules:

```javascript
// tests/unit/notifications/service.test.js
test('plays sound when user is available', async () => {
  const service = new NotificationService(mockPlayer, mockConfig, mockWindow, () => 1);
  await service.playSound(null, { type: 'new-message' });
  expect(mockPlayer.play).toHaveBeenCalled();
});

// tests/unit/screenSharing/ipcHandlers.test.js
// tests/unit/partitions/manager.test.js
// tests/unit/idle/monitor.test.js
```

**Target**: 20+ automated tests covering critical paths

**Benefits**:
- ✅ Confidence in refactoring
- ✅ Catch regressions early
- ✅ Document expected behavior
- ✅ Enable CI/CD improvements

---

### Week 8: Documentation Automation

**Create IPC documentation generator**:

```javascript
// scripts/generateIpcDocs.js
// Scans all ipcMain.handle/on calls across codebase
// Generates docs/ipc-api.md automatically
// Keeps documentation in sync with code
```

**Benefits**:
- ✅ Always up-to-date IPC documentation
- ✅ No manual maintenance required
- ✅ Can validate IPC security allowlist

**Additional**: Update any outdated architecture docs, create visual diagrams of module dependencies.

---

## Phase 2 Summary

**Total Impact After 8 Weeks**:

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Singleton exports | 3 | 0 | -100% |
| Constructor IPC registration | 2+ | 0 | -100% |
| Automated tests | 0 | 20+ | +20 |
| Test coverage | 0% | 40%+ | +40% |
| IPC docs | Manual | Auto-generated | ✅ |

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

## Next Steps

### This Week (Week 1)

1. **Create feature branch**: `feature/incremental-refactoring`
2. **Extract command line logic**: Create `app/startup/commandLine.js`
3. **Update index.js**: Replace function calls with module usage
4. **Test thoroughly**: Manual + E2E
5. **Commit and deploy**: Ship to production
6. **Measure impact**: Verify index.js reduced by 94 lines

### Next Month (Weeks 2-4)

- Complete Phase 1 extractions
- Add 5+ automated tests
- Document learnings
- Measure actual impact vs predicted

### Next Quarter (Weeks 5-8)

- Evaluate need for Phase 2
- Add testability improvements if valuable
- Re-assess architecture needs
- Decide on Phase 3 scope

---

## Related Documentation

- [Architecture Modernization Research (Archived)](./architecture-modernization-research.md) - The original DDD+Plugin plan
- [Critical Analysis](../../../ARCHITECTURE_MODERNIZATION_CRITICAL_ANALYSIS.md) - Why the old plan was abandoned
- [Research Summary](../../../ARCHITECTURE_RESEARCH_SUMMARY.md) - Executive summary of findings
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
