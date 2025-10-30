# Architecture Modernization Plan for Teams for Linux
## Issue #1799: Domain-Driven Repository Structure Investigation

**Date:** October 30, 2025
**Status:** Strategic Plan & Analysis
**Priority:** High - Foundation for Project 2.0

---

## Executive Summary

This document provides a comprehensive analysis and actionable plan for modernizing the Teams for Linux architecture based on:
- **Current state analysis** of the existing 703-line monolithic `app/index.js`
- **Industry best practices** from VS Code, Signal Desktop, and modern Electron applications
- **Domain-driven design principles** adapted for desktop application architecture
- **Concrete recommendations** for simplification and modernization

**Key Finding:** Teams for Linux has already made significant progress toward modularity, but the main entry point (`app/index.js`) remains a monolith containing 25+ IPC handlers, global state management, and application lifecycle logic. This plan proposes a phased approach to complete the architectural modernization.

---

## Table of Contents

1. [Current State Analysis](#current-state-analysis)
2. [Architectural Problems Identified](#architectural-problems-identified)
3. [Industry Best Practices Research](#industry-best-practices-research)
4. [Proposed Architecture](#proposed-architecture)
5. [Areas for Simplification](#areas-for-simplification)
6. [Implementation Roadmap](#implementation-roadmap)
7. [Migration Strategy](#migration-strategy)
8. [Success Metrics](#success-metrics)

---

## Current State Analysis

### Repository Structure Overview

```
app/
├── index.js (703 lines) ⚠️ MONOLITH
├── appConfiguration/
├── browser/
│   ├── preload.js
│   ├── tools/ (10+ renderer modules)
│   └── notifications/
├── mainAppWindow/
├── screenSharing/
├── menus/
├── login/
├── certificate/
├── cacheManager/
├── customBackground/
├── connectionManager/
├── incomingCallToast/
├── intune/
├── spellCheckProvider/
└── helpers/
```

### Code Metrics

| Metric | Value | Analysis |
|--------|-------|----------|
| **Total JS/TS files** | 49 | Moderate size |
| **Total lines of code** | ~8,225 | Well-contained |
| **Largest file** | 704 lines (spellCheckProvider/codes.js) | Data file, acceptable |
| **2nd largest** | 703 lines (index.js) | **🚨 PROBLEM** |
| **Modules** | 20+ | Good modularization |
| **IPC handlers in index.js** | 25+ | Should be distributed |

### What's Working Well ✅

1. **Module Organization**: Code is already organized by feature (screenSharing, login, menus, etc.)
2. **Separation of Concerns**: Most modules have clear, single responsibilities
3. **Documentation**: Excellent module-level README files explain purpose and responsibility
4. **Configuration Management**: AppConfiguration class provides solid foundation
5. **Security**: IPC validation system is well-implemented

### Critical Issues ⚠️

1. **Monolithic Entry Point**: `app/index.js` (703 lines) is a "God Object" that:
   - Registers 25+ IPC handlers
   - Manages global state (`userStatus`, `idleTimeUserStatus`, `picker`, `player`)
   - Handles application lifecycle
   - Implements business logic (notifications, screen sharing coordination)
   - Configures Electron command-line switches

2. **Global State Management**: Uses module-level variables and `globalThis` for state
   ```javascript
   let userStatus = -1;
   let idleTimeUserStatus = -1;
   globalThis.selectedScreenShareSource = null;
   globalThis.previewWindow = null;
   ```

3. **Scattered IPC Handlers**: IPC communication logic is split between:
   - `app/index.js` (core handlers)
   - Individual modules (feature-specific handlers)
   - No centralized IPC routing or organization

4. **Tight Coupling**: Main entry point directly imports and coordinates many modules

5. **Large Module Files**:
   - `mainAppWindow/index.js` (671 lines)
   - `menus/index.js` (554 lines)
   - `config/index.js` (516 lines)

---

## Architectural Problems Identified

### 1. Violation of Single Responsibility Principle

**Current:** `app/index.js` has at least 7 different responsibilities:
- Application lifecycle management
- IPC handler registration
- Global state management
- Notification coordination
- Screen sharing orchestration
- Command-line switch configuration
- Module initialization and coordination

**Impact:**
- Difficult to test individual concerns
- Changes to one feature risk breaking others
- Onboarding complexity for new contributors
- Technical debt accumulation

### 2. Implicit Dependencies

**Current:** Module dependencies are not explicit:
```javascript
// In index.js - unclear what dependencies each function needs
const mainAppWindow = require("./mainAppWindow");
const certificateModule = require("./certificate");
const CacheManager = require("./cacheManager");
// ... used throughout 703 lines
```

**Impact:**
- Difficult to understand module relationships
- Cannot easily replace or mock dependencies for testing
- Circular dependency risks

### 3. Lack of Layered Architecture

**Current:** No clear separation between:
- **Presentation Layer** (UI/Renderer)
- **Application Layer** (Use cases/orchestration)
- **Domain Layer** (Business logic)
- **Infrastructure Layer** (IPC, File system, OS integration)

**Impact:**
- Business logic mixed with infrastructure concerns
- Cannot reuse domain logic in different contexts
- Difficult to test business rules in isolation

### 4. IPC Handler Sprawl

**Current:** IPC handlers exist in multiple locations:
- 25+ handlers in `app/index.js`
- Additional handlers in modules (screenSharing, mainAppWindow, etc.)
- No clear ownership or organization

**Impact:**
- Difficult to audit all IPC endpoints
- Security validation is centralized but handler logic is scattered
- Hard to document all available IPC APIs

### 5. State Management Chaos

**Current:** State is managed through:
- Module-level variables (`userStatus`, `idleTimeUserStatus`)
- `globalThis` properties (`selectedScreenShareSource`, `previewWindow`)
- Module instances (AppConfiguration, mainAppWindow)

**Impact:**
- Unclear who owns and mutates state
- Race conditions and synchronization issues
- Difficult to debug state-related bugs
- Cannot implement features like state persistence or undo/redo

---

## Industry Best Practices Research

### VS Code Architecture Patterns

**Key Learnings from VS Code:**

1. **Multi-Process Architecture with Clear Boundaries**
   - Main process for application management
   - Dedicated renderer processes
   - Utility processes for specific tasks
   - Shared process for stateful services

2. **Layered Module Organization**
   ```
   src/vs/
   ├── base/          # General utilities and UI building blocks
   ├── platform/      # Service injection and base services
   ├── editor/        # Core editor (Monaco)
   └── workbench/     # Application host and viewlets
   ```

3. **Environment-Based Code Organization**
   Each functional area contains:
   ```
   feature/
   ├── common/           # Shared logic
   ├── browser/          # Renderer process code
   ├── electron-main/    # Main process code
   ├── electron-sandbox/ # Sandboxed renderer code
   ├── node/             # Node.js specific
   └── test/             # Tests
   ```

4. **Dependency Injection Architecture**
   - Services organized as classes
   - Constructor injection for explicit dependencies
   - Easy to proxy services across processes
   - Testability through mocking

### Signal Desktop Architecture Patterns

**Key Learnings from Signal Desktop:**

1. **Clear Main Process Organization**
   - `app/main.ts` as orchestrator only
   - Separate modules for configuration, errors, session management
   - Dedicated challenge handlers (CAPTCHA, auth)

2. **Feature-Based Module Structure**
   ```
   ts/main/
   ├── challengeMain.ts
   ├── updateDefaultSession.ts
   └── [other focused modules]
   ```

3. **Focused Responsibilities**
   - Each module has single, clear purpose
   - Main process delegates to specialized modules
   - Clean separation between lifecycle and business logic

### Domain-Driven Design Principles

**Applicable DDD Concepts:**

1. **Layered Architecture**
   - **Presentation**: Renderer process UI and preload scripts
   - **Application**: Use case orchestration and IPC handlers
   - **Domain**: Core business logic (notifications, status, sharing)
   - **Infrastructure**: Electron APIs, file system, OS integration

2. **Bounded Contexts**
   Each major feature area is its own context:
   - **User Context**: Authentication, status, presence
   - **Communication Context**: Notifications, sounds, badges
   - **Sharing Context**: Screen sharing, media selection
   - **Configuration Context**: Settings, preferences, profiles
   - **Window Management Context**: Windows, menus, tray

3. **Separation of Concerns**
   - Business rules isolated from technical details
   - Infrastructure dependencies inverted (depend on abstractions)
   - Each layer depends only on the layer below

### Modern Electron Best Practices (2025)

1. **Security-First Architecture**
   - Context isolation by default
   - Minimal preload exposure
   - IPC channel allowlisting ✅ (already implemented)

2. **Modular Organization**
   - Feature-based structure for scalability
   - Process-based separation (main/renderer)
   - Clear module boundaries and interfaces

3. **State Management**
   - Centralized state management (Redux-like patterns)
   - Immutable state updates
   - Predictable state flow

4. **Testability**
   - Dependency injection
   - Pure functions where possible
   - Separation of logic from Electron APIs

---

## Proposed Architecture

### High-Level Structure

```
app/
├── main.js                          # NEW: Minimal entry point (50 lines)
│
├── core/                            # NEW: Core application layer
│   ├── Application.js               # Application lifecycle orchestrator
│   ├── IpcRouter.js                 # Centralized IPC handler registry
│   ├── StateManager.js              # Application state management
│   └── ServiceContainer.js          # Dependency injection container
│
├── services/                        # NEW: Application services layer
│   ├── notifications/
│   │   ├── NotificationService.js   # Notification orchestration
│   │   └── NotificationSoundPlayer.js
│   ├── userStatus/
│   │   └── UserStatusService.js     # User presence management
│   ├── screenSharing/
│   │   └── ScreenSharingCoordinator.js
│   └── windowManagement/
│       └── WindowManager.js
│
├── infrastructure/                  # NEW: Infrastructure layer
│   ├── electron/
│   │   ├── CommandLineSwitches.js   # Electron configuration
│   │   ├── MediaPermissions.js      # OS permissions
│   │   └── GlobalShortcuts.js
│   └── ipc/
│       ├── handlers/                # Individual IPC handlers
│       │   ├── config.handlers.js
│       │   ├── screenSharing.handlers.js
│       │   ├── notification.handlers.js
│       │   └── zoom.handlers.js
│       └── security/
│           └── ipcValidator.js      # (existing)
│
├── features/                        # REORGANIZED: Feature modules
│   ├── mainWindow/                  # (from mainAppWindow/)
│   ├── screenSharing/               # (existing)
│   ├── login/                       # (existing)
│   ├── menus/                       # (existing)
│   ├── customBackground/            # (existing)
│   ├── incomingCallToast/           # (existing)
│   └── [others...]
│
├── shared/                          # NEW: Shared utilities
│   ├── config/                      # (from config/)
│   ├── helpers/                     # (existing helpers/)
│   └── constants/
│       └── ipcChannels.js           # Centralized IPC channel definitions
│
└── browser/                         # (existing renderer code)
    ├── preload.js
    ├── tools/
    └── notifications/
```

### Core Components Explained

#### 1. `main.js` - Minimal Entry Point

**Purpose:** Bootstrap the application and nothing more.

```javascript
// main.js - NEW MINIMALIST ENTRY POINT (~50 lines)
const { app } = require("electron");
const path = require("node:path");

// E2E testing support
if (process.env.E2E_USER_DATA_DIR) {
  app.setPath("userData", process.env.E2E_USER_DATA_DIR);
}

// Import Application orchestrator
const { Application } = require("./core/Application");

// Create and start application
const application = new Application({
  appPath: path.join(__dirname, app.isPackaged ? "../../" : ""),
  userDataPath: app.getPath("userData"),
  version: app.getVersion()
});

// Single lock check
const gotTheLock = app.requestSingleInstanceLock();

if (gotTheLock) {
  application.start();
} else {
  console.info("App already running");
  app.quit();
}
```

**Benefits:**
- Clear entry point (50 lines vs 703)
- Easy to understand what happens at startup
- Application logic delegated to Application class

#### 2. `core/Application.js` - Application Orchestrator

**Purpose:** Coordinate application lifecycle and initialize services.

```javascript
// core/Application.js - ORCHESTRATION LAYER
class Application {
  constructor(options) {
    this.options = options;
    this.config = null;
    this.services = null;
    this.ipcRouter = null;
  }

  async start() {
    // 1. Load configuration
    await this.initializeConfiguration();

    // 2. Configure Electron before app.ready
    this.configureElectron();

    // 3. Setup event handlers
    this.setupAppEventHandlers();

    // 4. Wait for ready and initialize
    app.on("ready", () => this.handleAppReady());
  }

  async initializeConfiguration() {
    const { AppConfiguration } = require("../shared/config");
    this.config = new AppConfiguration(
      this.options.userDataPath,
      this.options.version
    );
  }

  configureElectron() {
    const CommandLineSwitches = require("../infrastructure/electron/CommandLineSwitches");
    CommandLineSwitches.configure(this.config);
  }

  async handleAppReady() {
    // 5. Initialize services
    await this.initializeServices();

    // 6. Setup IPC routing
    this.setupIpcRouting();

    // 7. Create main window
    await this.services.windowManager.createMainWindow();
  }

  async initializeServices() {
    const ServiceContainer = require("./ServiceContainer");
    this.services = new ServiceContainer(this.config);
    await this.services.initialize();
  }

  setupIpcRouting() {
    const IpcRouter = require("./IpcRouter");
    this.ipcRouter = new IpcRouter(this.services);
    this.ipcRouter.registerAllHandlers();
  }

  setupAppEventHandlers() {
    app.on("second-instance", (event, argv, workingDirectory) => {
      this.services.windowManager.handleSecondInstance(argv, workingDirectory);
    });

    app.on("certificate-error", (...args) => {
      this.services.certificate.handleError(...args);
    });

    // ... other app-level events
  }
}

module.exports = { Application };
```

**Benefits:**
- Clear initialization sequence
- Services are explicit dependencies
- Easy to test each initialization step
- Follows "composition over inheritance" principle

#### 3. `core/IpcRouter.js` - Centralized IPC Management

**Purpose:** Single place to register and manage all IPC handlers.

```javascript
// core/IpcRouter.js - IPC ROUTING LAYER
const { ipcMain } = require("electron");
const { validateIpcChannel } = require("../infrastructure/ipc/security/ipcValidator");

class IpcRouter {
  constructor(services) {
    this.services = services;
    this.setupSecurityWrappers();
  }

  setupSecurityWrappers() {
    // Wrap ipcMain.handle and ipcMain.on with security validation
    // (existing security code from index.js)
  }

  registerAllHandlers() {
    // Load and register handlers from organized files
    this.registerConfigHandlers();
    this.registerScreenSharingHandlers();
    this.registerNotificationHandlers();
    this.registerZoomHandlers();
    this.registerSystemHandlers();
  }

  registerConfigHandlers() {
    const configHandlers = require("../infrastructure/ipc/handlers/config.handlers");
    configHandlers.register(ipcMain, this.services);
  }

  registerScreenSharingHandlers() {
    const screenSharingHandlers = require("../infrastructure/ipc/handlers/screenSharing.handlers");
    screenSharingHandlers.register(ipcMain, this.services);
  }

  // ... similar for other handler groups
}

module.exports = { IpcRouter };
```

**Benefits:**
- All IPC handlers registered in one place
- Easy to audit all IPC endpoints
- Security validation is centralized
- Clear handler organization by domain

#### 4. `core/StateManager.js` - Application State

**Purpose:** Centralized, predictable state management.

```javascript
// core/StateManager.js - STATE MANAGEMENT
class StateManager {
  constructor() {
    this.state = {
      user: {
        status: -1,
        idleTimeStatus: -1
      },
      screenSharing: {
        active: false,
        sourceId: null,
        previewWindow: null
      },
      application: {
        ready: false,
        mainWindow: null
      }
    };
    this.listeners = new Map();
  }

  getState(path) {
    // Get nested state by path (e.g., "user.status")
    return path.split('.').reduce((obj, key) => obj?.[key], this.state);
  }

  setState(path, value) {
    // Immutable state update
    const newState = this.updateNestedState(this.state, path, value);
    const oldValue = this.getState(path);
    this.state = newState;

    // Notify listeners
    this.notifyListeners(path, value, oldValue);
  }

  subscribe(path, listener) {
    if (!this.listeners.has(path)) {
      this.listeners.set(path, []);
    }
    this.listeners.get(path).push(listener);

    // Return unsubscribe function
    return () => {
      const listeners = this.listeners.get(path);
      const index = listeners.indexOf(listener);
      if (index > -1) listeners.splice(index, 1);
    };
  }

  // ... helper methods
}

module.exports = { StateManager };
```

**Benefits:**
- Single source of truth for application state
- Immutable updates (no accidental mutations)
- Observable state changes (listener pattern)
- Easy to debug state transitions
- Foundation for features like state persistence

#### 5. `services/` - Business Logic Layer

**Example: NotificationService**

```javascript
// services/notifications/NotificationService.js
const { Notification, nativeImage } = require("electron");

class NotificationService {
  constructor(config, stateManager, soundPlayer) {
    this.config = config;
    this.stateManager = stateManager;
    this.soundPlayer = soundPlayer;
  }

  async showNotification(options) {
    // Business logic: Should we show this notification?
    if (!this.shouldShowNotification(options)) {
      console.debug("Notification suppressed by user preferences");
      return;
    }

    // Play sound if configured
    if (options.audio) {
      await this.soundPlayer.play(options.type);
    }

    // Show native notification
    const notification = new Notification({
      title: options.title,
      body: options.body,
      icon: this.getNotificationIcon(options),
      urgency: this.config.defaultNotificationUrgency
    });

    notification.on("click", () => {
      this.handleNotificationClick(options);
    });

    notification.show();
  }

  shouldShowNotification(options) {
    const userStatus = this.stateManager.getState("user.status");

    // Business rule: suppress notifications if user is not available
    if (this.config.disableNotificationSoundIfNotAvailable) {
      if (userStatus !== 1 && userStatus !== -1) {
        return false;
      }
    }

    return true;
  }

  handleNotificationClick(options) {
    // Delegate to window manager to show main window
    // (services can call each other through dependency injection)
  }

  // ... other notification logic
}

module.exports = { NotificationService };
```

**Benefits:**
- Business logic is isolated and testable
- Clear dependencies (config, state, soundPlayer)
- No direct Electron API calls mixed with business rules
- Can be tested without launching Electron

#### 6. `infrastructure/ipc/handlers/` - IPC Handler Organization

**Example: Screen Sharing Handlers**

```javascript
// infrastructure/ipc/handlers/screenSharing.handlers.js
function register(ipcMain, services) {
  const { screenSharingCoordinator, stateManager } = services;

  ipcMain.on("screen-sharing-started", (event, sourceId) => {
    screenSharingCoordinator.handleSharingStarted(sourceId);
  });

  ipcMain.on("screen-sharing-stopped", () => {
    screenSharingCoordinator.handleSharingStopped();
  });

  ipcMain.handle("get-screen-sharing-status", () => {
    return stateManager.getState("screenSharing.active");
  });

  ipcMain.handle("get-screen-share-stream", () => {
    return stateManager.getState("screenSharing.sourceId");
  });

  // ... other screen sharing handlers
}

module.exports = { register };
```

**Benefits:**
- Handlers organized by domain/feature
- Thin handlers that delegate to services
- Easy to find all handlers for a feature
- Clear service dependencies

---

## Areas for Simplification

### 1. IPC Handler Organization 🎯 HIGH IMPACT

**Current Problem:**
- 25+ IPC handlers scattered in `app/index.js`
- Additional handlers in various modules
- No centralized registry or documentation

**Simplification:**
```
infrastructure/ipc/handlers/
├── config.handlers.js           # get-config, config-file-changed
├── screenSharing.handlers.js    # screen-sharing-*, get-screen-share-*
├── notification.handlers.js     # show-notification, play-notification-sound
├── zoom.handlers.js             # get-zoom-level, save-zoom-level
├── system.handlers.js           # get-system-idle-state, get-app-version
└── badges.handlers.js           # set-badge-count, user-status-changed
```

**Impact:**
- Easy to find and audit all IPC handlers
- Better security review capability
- Improved documentation generation
- Easier testing of handler logic

### 2. State Management Consolidation 🎯 HIGH IMPACT

**Current Problem:**
- Module variables: `userStatus`, `idleTimeUserStatus`, `picker`, `player`
- `globalThis` properties: `selectedScreenShareSource`, `previewWindow`
- State scattered across multiple files

**Simplification:**
- Single `StateManager` class
- All state in one place
- Observable state changes
- Immutable updates

**Migration Path:**
```javascript
// Before
let userStatus = -1;
userStatus = options.data.status;

// After
stateManager.setState("user.status", options.data.status);
const currentStatus = stateManager.getState("user.status");
```

### 3. Configuration Loading 🎯 MEDIUM IMPACT

**Current Problem:**
- Command-line switches configured in two places (before and after config load)
- 516 lines in `config/index.js`
- Mixing of configuration loading with Electron setup

**Simplification:**
```
shared/config/
├── AppConfiguration.js          # (existing)
├── ConfigLoader.js              # NEW: Configuration loading logic
└── ConfigValidator.js           # NEW: Validation rules

infrastructure/electron/
└── CommandLineSwitches.js       # NEW: Electron CLI configuration
```

**Benefits:**
- Clear separation between config loading and Electron setup
- Easier to test configuration logic
- Validation can be run independently

### 4. Service Initialization 🎯 MEDIUM IMPACT

**Current Problem:**
- Services initialized directly in `index.js`
- Dependencies between services are implicit
- Difficult to mock or replace services for testing

**Simplification:**
```javascript
// core/ServiceContainer.js
class ServiceContainer {
  constructor(config) {
    this.config = config;
    this.services = {};
  }

  async initialize() {
    // Initialize in correct order with explicit dependencies
    this.services.stateManager = new StateManager();

    this.services.certificate = new CertificateService(this.config);

    this.services.soundPlayer = await this.initializeSoundPlayer();

    this.services.notificationService = new NotificationService(
      this.config,
      this.services.stateManager,
      this.services.soundPlayer
    );

    this.services.screenSharingCoordinator = new ScreenSharingCoordinator(
      this.config,
      this.services.stateManager
    );

    this.services.windowManager = new WindowManager(
      this.config,
      this.services.stateManager
    );

    // ... other services
  }

  get(serviceName) {
    return this.services[serviceName];
  }
}
```

**Benefits:**
- Explicit service dependencies
- Clear initialization order
- Easy to swap implementations for testing
- Services can be lazy-loaded if needed

### 5. Notification System 🎯 LOW IMPACT (Already Good)

**Current State:** Notification logic is already somewhat organized

**Minor Simplification:**
- Move notification business logic to `NotificationService`
- Keep sound playing in separate `NotificationSoundPlayer` class
- Move native notification display to infrastructure layer

### 6. Screen Sharing Coordination 🎯 MEDIUM IMPACT

**Current Problem:**
- Screen sharing state management in `index.js`
- Preview window management mixed with state
- UUID format handling scattered

**Simplification:**
```javascript
// services/screenSharing/ScreenSharingCoordinator.js
class ScreenSharingCoordinator {
  constructor(config, stateManager) {
    this.config = config;
    this.stateManager = stateManager;
    this.previewWindowManager = null;
  }

  async handleSharingStarted(sourceId) {
    // Validate source ID format (screen:x:y or window:x:y)
    const validatedSourceId = this.validateSourceId(sourceId);

    // Update state
    this.stateManager.setState("screenSharing.active", true);
    this.stateManager.setState("screenSharing.sourceId", validatedSourceId);

    // Create preview window if configured
    if (this.config.screenSharingPreview) {
      await this.createPreviewWindow(validatedSourceId);
    }
  }

  handleSharingStopped() {
    this.stateManager.setState("screenSharing.active", false);
    this.stateManager.setState("screenSharing.sourceId", null);

    if (this.previewWindowManager) {
      this.previewWindowManager.close();
      this.previewWindowManager = null;
    }
  }

  validateSourceId(sourceId) {
    // Business logic for source ID validation
    // (existing logic from index.js)
  }
}
```

**Benefits:**
- All screen sharing coordination in one place
- Clear ownership of screen sharing state
- Easier to add new screen sharing features
- Better testing of screen sharing logic

### 7. Module Renaming for Clarity 🎯 LOW IMPACT

**Suggested Renames:**
- `mainAppWindow` → `mainWindow` (shorter, clearer)
- `browser/tools` → `browser/modules` or `renderer/modules` (more accurate)
- `helpers` → `utils` (more standard naming)
- `incomingCallToast` → `callNotifications` (more generic)

---

## Implementation Roadmap

### Phase 1: Foundation (Weeks 1-2) 🏗️

**Goal:** Establish new architecture without breaking existing functionality

**Tasks:**
1. ✅ Create new directory structure
2. ✅ Implement `StateManager` class
3. ✅ Implement `ServiceContainer` class
4. ✅ Implement `IpcRouter` class
5. ✅ Create `Application` orchestrator
6. ✅ Create new minimal `main.js`

**Deliverables:**
- New architecture skeleton exists alongside old code
- `StateManager` has unit tests
- `ServiceContainer` initializes successfully
- Application boots with new `main.js`

**Risk Mitigation:**
- Keep old `index.js` as `index.old.js` for reference
- Run both old and new initialization in parallel for testing
- Extensive logging to verify behavior matches

### Phase 2: IPC Migration (Weeks 3-4) 📡

**Goal:** Move all IPC handlers to organized structure

**Tasks:**
1. ✅ Create handler files in `infrastructure/ipc/handlers/`
2. ✅ Move config handlers → `config.handlers.js`
3. ✅ Move screen sharing handlers → `screenSharing.handlers.js`
4. ✅ Move notification handlers → `notification.handlers.js`
5. ✅ Move zoom handlers → `zoom.handlers.js`
6. ✅ Move system handlers → `system.handlers.js`
7. ✅ Update IPC documentation with new structure

**Deliverables:**
- All IPC handlers in organized files
- `IpcRouter` registers all handlers
- Old IPC registration code removed
- Updated IPC API documentation

**Testing:**
- IPC handler smoke tests
- Verify all channels still work
- Security validation still applies

### Phase 3: Service Extraction (Weeks 5-7) 🔧

**Goal:** Extract business logic into service classes

**Tasks:**
1. ✅ Create `NotificationService` with tests
2. ✅ Create `ScreenSharingCoordinator` with tests
3. ✅ Create `UserStatusService` with tests
4. ✅ Migrate notification logic to service
5. ✅ Migrate screen sharing logic to coordinator
6. ✅ Migrate user status logic to service
7. ✅ Update handlers to use services instead of direct logic

**Deliverables:**
- Business logic in service classes
- Services have unit tests (>80% coverage)
- Handlers are thin and delegate to services
- Old business logic removed from `index.js`

**Testing:**
- Unit tests for each service
- Integration tests for service interactions
- E2E tests still pass

### Phase 4: State Migration (Weeks 8-9) 📊

**Goal:** Move all state to `StateManager`

**Tasks:**
1. ✅ Migrate `userStatus` → `stateManager`
2. ✅ Migrate `idleTimeUserStatus` → `stateManager`
3. ✅ Migrate `globalThis.selectedScreenShareSource` → `stateManager`
4. ✅ Migrate `globalThis.previewWindow` → `stateManager`
5. ✅ Migrate other module-level variables
6. ✅ Remove all module-level state variables
7. ✅ Add state change logging for debugging

**Deliverables:**
- All state in `StateManager`
- No module-level state variables
- State changes are logged
- State can be inspected via devtools

**Testing:**
- Verify state updates work correctly
- Test state listener functionality
- Verify no state synchronization issues

### Phase 5: Infrastructure Extraction (Weeks 10-11) 🏗️

**Goal:** Separate infrastructure concerns from business logic

**Tasks:**
1. ✅ Create `CommandLineSwitches` module
2. ✅ Create `MediaPermissions` module
3. ✅ Create `GlobalShortcuts` module
4. ✅ Move Electron configuration to infrastructure layer
5. ✅ Move OS integration to infrastructure layer

**Deliverables:**
- Infrastructure code in separate modules
- Business logic doesn't directly call Electron APIs
- Infrastructure modules are testable in isolation

### Phase 6: Module Reorganization (Weeks 12-13) 📁

**Goal:** Reorganize existing modules to new structure

**Tasks:**
1. ✅ Move modules to `features/` directory
2. ✅ Rename modules for clarity
3. ✅ Update imports across codebase
4. ✅ Update documentation
5. ✅ Update build configuration

**Deliverables:**
- All modules in new locations
- All imports updated
- Documentation reflects new structure
- Build and packaging work correctly

### Phase 7: Large Module Refactoring (Weeks 14-16) 🔨

**Goal:** Break down remaining large modules

**Tasks:**
1. ✅ Refactor `mainWindow/index.js` (671 lines)
   - Split into window lifecycle, event handling, content loading
2. ✅ Refactor `menus/index.js` (554 lines)
   - Split into app menu, tray menu, context menus
3. ✅ Refactor `config/index.js` (516 lines)
   - Split into loader, validator, defaults

**Deliverables:**
- No module over 400 lines
- Clear single responsibility for each file
- Improved maintainability

### Phase 8: Documentation & Testing (Weeks 17-18) 📚

**Goal:** Complete documentation and test coverage

**Tasks:**
1. ✅ Write architecture documentation
2. ✅ Update all module READMEs
3. ✅ Document service APIs
4. ✅ Document state manager usage
5. ✅ Add architecture diagrams
6. ✅ Achieve >80% test coverage for services
7. ✅ Add integration test suite

**Deliverables:**
- Comprehensive architecture documentation
- Service API documentation
- >80% test coverage
- Integration test suite

---

## Migration Strategy

### Parallel Implementation Approach

**Strategy:** Build new architecture alongside old code, migrate incrementally.

```
app/
├── index.js                    # OLD (Phase 1-5)
├── main.js                     # NEW (Phase 1+)
├── core/                       # NEW (Phase 1+)
├── services/                   # NEW (Phase 3+)
├── infrastructure/             # NEW (Phase 2+)
└── [existing modules]          # PRESERVE (Phase 1-5), MIGRATE (Phase 6+)
```

### Feature Flag for Testing

```javascript
// In package.json, add script:
"start:new": "USE_NEW_ARCHITECTURE=1 electron ./app --trace-warnings"
"start:old": "electron ./app --trace-warnings"

// In main.js / index.js:
if (process.env.USE_NEW_ARCHITECTURE === '1') {
  require('./main.js');  // New architecture
} else {
  require('./index.js'); // Old architecture
}
```

### Gradual Handler Migration

For each IPC handler migration:

1. **Create new handler** in organized structure
2. **Test new handler** works identically
3. **Keep old handler** for 1-2 releases (deprecated)
4. **Remove old handler** once new one is proven stable

### State Migration Approach

```javascript
// Compatibility shim during migration
const legacyStateManager = {
  get userStatus() {
    return stateManager.getState("user.status");
  },
  set userStatus(value) {
    stateManager.setState("user.status", value);
  }
};

// Old code continues working:
legacyStateManager.userStatus = 1;

// New code uses StateManager directly:
stateManager.setState("user.status", 1);
```

### Testing Strategy

**Per Phase:**
1. ✅ Unit tests for new components
2. ✅ Integration tests for service interactions
3. ✅ E2E tests (existing Playwright tests must pass)
4. ✅ Manual testing of critical paths

**Continuous:**
- E2E tests run on every commit
- No regression in existing functionality
- Performance monitoring (startup time, memory usage)

---

## Success Metrics

### Code Quality Metrics

| Metric | Current | Target | Success Criteria |
|--------|---------|--------|------------------|
| **Main entry point size** | 703 lines | <100 lines | ✅ 80%+ reduction |
| **Largest module size** | 671 lines | <400 lines | ✅ 40%+ reduction |
| **IPC handler locations** | 3+ places | 1 place | ✅ Centralized |
| **Test coverage** | ~20% | >80% | ✅ 4x improvement |
| **State locations** | 5+ places | 1 place | ✅ Centralized |

### Maintainability Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| **Time to find IPC handler** | ~5 min | <30 sec | Developer survey |
| **Time to understand service** | ~15 min | <5 min | Developer survey |
| **New contributor onboarding** | ~4 hours | <2 hours | Documentation + feedback |
| **Service dependencies clarity** | Low | High | Code review feedback |

### Quality Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **No regressions** | 100% | E2E tests pass |
| **Performance maintained** | ±5% | Startup time, memory usage |
| **Security maintained** | 100% | IPC validation works |
| **Documentation coverage** | >90% | Public APIs documented |

---

## Comparison with Similar Projects

### Architecture Comparison Table

| Aspect | Teams for Linux (Current) | Teams for Linux (Proposed) | VS Code | Signal Desktop |
|--------|---------------------------|---------------------------|---------|----------------|
| **Entry point size** | 703 lines | ~50 lines | ~100 lines | ~150 lines |
| **Layered architecture** | ❌ No | ✅ Yes | ✅ Yes | ✅ Yes |
| **Dependency injection** | ❌ No | ✅ Yes | ✅ Yes | ✅ Yes |
| **Centralized IPC** | ❌ No | ✅ Yes | ✅ Yes | ✅ Yes |
| **State management** | ❌ Scattered | ✅ Centralized | ✅ Redux-like | ✅ Redux |
| **Service-based** | ⚠️ Partial | ✅ Yes | ✅ Yes | ✅ Yes |
| **Test coverage** | ~20% | >80% | ~70% | ~80% |
| **Feature organization** | ✅ Good | ✅ Better | ✅ Excellent | ✅ Excellent |

### Key Insights

**What Teams for Linux is doing right:**
- ✅ Feature-based module organization
- ✅ Module READMEs and documentation
- ✅ IPC security validation
- ✅ Configuration management class

**Where Teams for Linux can improve (learning from VS Code/Signal):**
- 🎯 Layered architecture (presentation, application, domain, infrastructure)
- 🎯 Dependency injection for explicit dependencies
- 🎯 Centralized IPC routing
- 🎯 Service-based business logic
- 🎯 Centralized state management
- 🎯 Smaller, more focused modules

---

## Risk Assessment

### Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **Breaking existing functionality** | Medium | High | Parallel implementation, extensive testing, gradual migration |
| **Performance regression** | Low | Medium | Performance monitoring, benchmarking each phase |
| **Increased complexity** | Low | Medium | Clear documentation, training materials |
| **Developer confusion** | Medium | Low | Comprehensive guides, pair programming |
| **Migration bugs** | Medium | Medium | Thorough testing, feature flags, rollback plan |

### Project Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| **Scope creep** | Medium | High | Phased approach, clear phase boundaries |
| **Timeline overrun** | Medium | Medium | Buffer time in estimates, cut scope if needed |
| **Resource availability** | Low | High | Document everything, enable async contribution |
| **User disruption** | Low | High | No breaking changes, maintain compatibility |

---

## Alternative Approaches Considered

### Alternative 1: Big Bang Rewrite

**Approach:** Rewrite entire application in one go.

**Pros:**
- Clean slate
- No compatibility shims
- Fastest to final state

**Cons:**
- ❌ High risk of breaking changes
- ❌ Long period with no releases
- ❌ Difficult to test incrementally
- ❌ All-or-nothing delivery

**Decision:** ❌ **REJECTED** - Too risky for a production application

### Alternative 2: Do Nothing

**Approach:** Keep current architecture.

**Pros:**
- No migration risk
- No time investment
- Existing code works

**Cons:**
- ❌ Technical debt accumulates
- ❌ Difficulty adding new features
- ❌ Poor maintainability
- ❌ Onboarding difficulty
- ❌ Testing challenges

**Decision:** ❌ **REJECTED** - Technical debt is already affecting development

### Alternative 3: Minimal Refactoring

**Approach:** Only extract IPC handlers and large functions.

**Pros:**
- Low risk
- Quick wins
- Smaller scope

**Cons:**
- ⚠️ Doesn't address root architectural issues
- ⚠️ State management still problematic
- ⚠️ Service dependencies still implicit
- ⚠️ Limited long-term benefit

**Decision:** ⚠️ **CONSIDERED** but less comprehensive than needed

### Alternative 4: Phased Modernization (SELECTED)

**Approach:** Incremental migration to modern architecture (this plan).

**Pros:**
- ✅ Low risk per phase
- ✅ Continuous delivery
- ✅ Testable at each step
- ✅ Can course-correct
- ✅ Comprehensive improvement

**Cons:**
- ⚠️ Longer total timeline
- ⚠️ Temporary complexity (old + new code)
- ⚠️ Requires discipline

**Decision:** ✅ **SELECTED** - Best balance of risk and reward

---

## Recommendations

### Immediate Next Steps (Week 1)

1. **Review this plan** with core maintainers
2. **Get consensus** on proposed architecture
3. **Create spike branches** to prototype key components:
   - `StateManager` implementation
   - `IpcRouter` implementation
   - `Application` orchestrator
4. **Set up project tracking** for migration tasks
5. **Define testing criteria** for each phase

### Decision Points

The following decisions should be made before starting:

1. **Timeline commitment**: Is 18 weeks (4.5 months) acceptable?
2. **Parallel development**: Can new features be paused during migration?
3. **Breaking changes**: Are any breaking changes acceptable?
4. **Testing requirements**: What level of testing is required?
5. **Documentation**: Who will maintain documentation during migration?

### Success Factors

For this migration to succeed:

1. ✅ **Commitment from maintainers** to see it through
2. ✅ **Clear communication** with community about changes
3. ✅ **Discipline** to follow the plan and not rush
4. ✅ **Testing rigor** to prevent regressions
5. ✅ **Documentation** at every step
6. ✅ **Flexibility** to adjust plan as needed

---

## Conclusion

Teams for Linux has a solid foundation and is already well-modularized at the feature level. However, the monolithic `app/index.js` entry point (703 lines) and scattered state management are blocking further improvement and creating maintainability challenges.

This plan proposes a **phased modernization** approach that:
- ✅ Learns from industry best practices (VS Code, Signal Desktop)
- ✅ Applies domain-driven design principles
- ✅ Minimizes risk through incremental migration
- ✅ Maintains backward compatibility
- ✅ Achieves significant improvements in code quality and maintainability

**Expected Outcomes:**
- 🎯 **80%+ reduction** in main entry point size (703 → <100 lines)
- 🎯 **Centralized** IPC handler management
- 🎯 **Predictable** state management with single source of truth
- 🎯 **Explicit** service dependencies and clear architecture layers
- 🎯 **4x improvement** in test coverage (20% → 80%+)
- 🎯 **50%+ reduction** in onboarding time for new contributors

This modernization will provide a **solid foundation for Project 2.0** and enable faster feature development, better testing, and improved long-term maintainability.

---

## Appendices

### Appendix A: Detailed File Structure

See proposed structure in [Proposed Architecture](#proposed-architecture) section.

### Appendix B: Migration Checklist

Will be created at the start of Phase 1 with detailed task breakdowns.

### Appendix C: Testing Strategy

Will be documented separately with test plan for each phase.

### Appendix D: Reference Materials

- VS Code Architecture: https://github.com/microsoft/vscode
- Signal Desktop: https://github.com/signalapp/Signal-Desktop
- Electron Best Practices: https://www.electronjs.org/docs/latest/tutorial/security
- Domain-Driven Design: Eric Evans, "Domain-Driven Design" (2003)

---

**Document Status:** Draft for Review
**Next Review:** After maintainer feedback
**Document Owner:** Architecture Working Group

