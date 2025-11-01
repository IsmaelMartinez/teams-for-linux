# Architecture Modernization Implementation Tasks

**Issue**: [#1799 - Architecture Modernization](https://github.com/IsmaelMartinez/teams-for-linux/issues/1799)
**Research Document**: [architecture-modernization-research.md](./research/architecture-modernization-research.md)
**Created**: 2025-11-01
**Status**: Task Planning

## Overview

This document provides a detailed, actionable task list for implementing the architecture modernization plan outlined in the research document. The implementation follows a 10-week phased approach with parallel development on separate branches.

---

## Phase 0: Dual-Branch Release Infrastructure (Week 0)

**Goal**: Prepare the release system to support parallel development of 2.x (stable) and 3.x (modernization) releases independently.

### Task 0.1: Branch Strategy Setup

**Priority**: Critical
**Estimated Time**: 2 hours
**Dependencies**: None

#### Subtasks:

1. **Create and protect the 3.x development branch**
   ```bash
   git checkout main
   git pull origin main
   git checkout -b release/2.x  # Preserve current stable line
   git push -u origin release/2.x

   git checkout main
   git checkout -b feature/architecture-modernization-1799
   git push -u origin feature/architecture-modernization-1799
   ```

2. **Configure branch protection rules** (via GitHub UI)
   - **`main`**:
     - Will become 3.x line after merge
     - Require PR reviews (1 approver)
     - Require status checks (E2E tests, build)
     - No force pushes
     - No deletions

   - **`release/2.x`**:
     - Stable 2.x releases (2.6.9, 2.6.10, etc.)
     - Require PR reviews (1 approver)
     - Require status checks
     - No force pushes
     - No deletions

   - **`feature/architecture-modernization-1799`**:
     - 3.x development branch
     - Require PR reviews (1 approver)
     - Require status checks
     - Allow force pushes (during development)

3. **Document branching strategy**
   - Update CONTRIBUTING.md with new branch structure
   - Clarify where to submit PRs:
     - Bug fixes for 2.x → `release/2.x`
     - New features for 2.x → `release/2.x`
     - Architecture work → `feature/architecture-modernization-1799`
     - After 3.0 release → `main`

**Acceptance Criteria**:
- [ ] Three branches exist: `main`, `release/2.x`, `feature/architecture-modernization-1799`
- [ ] Branch protection rules configured in GitHub
- [ ] CONTRIBUTING.md updated with branch strategy
- [ ] Team understands where to submit PRs

---

### Task 0.2: CI/CD Pipeline Adaptation

**Priority**: Critical
**Estimated Time**: 4-6 hours
**Dependencies**: Task 0.1

#### Current State Analysis:

Current build workflow (`.github/workflows/build.yml`) only publishes when:
```yaml
if: contains(github.ref, 'main')
```

This needs to be updated to support both `release/2.x` and `feature/architecture-modernization-1799`.

#### Subtasks:

1. **Update `.github/workflows/build.yml`** to support multiple release branches:

   ```yaml
   # Change from:
   if: contains(github.ref, 'main')

   # To:
   if: |
     contains(github.ref, 'refs/heads/main') ||
     contains(github.ref, 'refs/heads/release/2.x') ||
     contains(github.ref, 'refs/heads/feature/architecture-modernization-1799')
   ```

   Apply this change to all release jobs:
   - `linux_x64` (line 61)
   - `linux_arm64` (line 83)
   - `linux_arm` (line 105)
   - `dmg` (line 127)
   - `exe` (line 149)

2. **Update `.github/workflows/snap.yml`** similarly:
   - `snap` job (line 32)
   - `snap-armv7l` job (line 57)
   - `snap-arm64` job (line 85)

3. **Add branch-specific release tags** to differentiate builds:

   Create new workflow file `.github/workflows/release-tagging.yml`:
   ```yaml
   name: Release Tagging

   on:
     push:
       branches:
         - 'release/2.x'
         - 'feature/architecture-modernization-1799'
         - 'main'

   jobs:
     tag-release:
       runs-on: ubuntu-latest
       steps:
         - name: Determine release channel
           id: channel
           run: |
             if [[ "${{ github.ref }}" == "refs/heads/release/2.x" ]]; then
               echo "channel=stable-2.x" >> $GITHUB_OUTPUT
               echo "version_prefix=2." >> $GITHUB_OUTPUT
             elif [[ "${{ github.ref }}" == "refs/heads/feature/architecture-modernization-1799" ]]; then
               echo "channel=beta-3.x" >> $GITHUB_OUTPUT
               echo "version_prefix=3.0.0-beta" >> $GITHUB_OUTPUT
             elif [[ "${{ github.ref }}" == "refs/heads/main" ]]; then
               echo "channel=stable-3.x" >> $GITHUB_OUTPUT
               echo "version_prefix=3." >> $GITHUB_OUTPUT
             fi

         - name: Validate version matches branch
           run: |
             # Add validation logic to ensure package.json version
             # matches expected version prefix for the branch
             echo "Validating version for channel: ${{ steps.channel.outputs.channel }}"
   ```

4. **Create separate GitHub Release channels**:
   - Releases from `release/2.x` → Tagged as `v2.x.x` (stable)
   - Releases from `feature/architecture-modernization-1799` → Tagged as `v3.0.0-beta.x` (pre-release)
   - Releases from `main` (after merge) → Tagged as `v3.x.x` (stable)

5. **Update `scripts/generateReleaseInfo.js`** to support version prefixes:

   Add branch awareness:
   ```javascript
   // After line 22 (pkg load)
   const branch = process.env.GITHUB_REF || '';
   let expectedVersionPrefix = '';

   if (branch.includes('release/2.x')) {
     expectedVersionPrefix = '2.';
   } else if (branch.includes('feature/architecture-modernization-1799')) {
     expectedVersionPrefix = '3.0.0-beta';
   } else if (branch.includes('main')) {
     expectedVersionPrefix = '3.';
   }

   if (expectedVersionPrefix && !pkg.version.startsWith(expectedVersionPrefix)) {
     console.warn(`Warning: Version ${pkg.version} doesn't match expected prefix ${expectedVersionPrefix} for branch ${branch}`);
   }
   ```

**Acceptance Criteria**:
- [ ] Build workflow triggers on all three branches
- [ ] Each branch produces correctly tagged releases
- [ ] Release validation script checks version consistency
- [ ] GitHub Releases clearly distinguish 2.x vs 3.x
- [ ] Documentation exists for release managers

---

### Task 0.3: Version Management Strategy

**Priority**: High
**Estimated Time**: 2 hours
**Dependencies**: Task 0.2

#### Subtasks:

1. **Define version numbering scheme**:

   | Branch | Version Pattern | Example | Release Type |
   |--------|----------------|---------|--------------|
   | `release/2.x` | `2.6.x` | `2.6.9`, `2.6.10` | Stable patch releases |
   | `release/2.x` | `2.7.0` | `2.7.0` | Minor feature release (if needed) |
   | `feature/architecture-modernization-1799` | `3.0.0-beta.x` | `3.0.0-beta.1`, `3.0.0-beta.2` | Pre-releases during development |
   | `main` (after merge) | `3.x.x` | `3.0.0`, `3.1.0` | Stable 3.x releases |

2. **Create version bump scripts** for each branch:

   Create `scripts/bump-version.js`:
   ```javascript
   #!/usr/bin/env node

   const fs = require('fs');
   const path = require('path');
   const { execSync } = require('child_process');

   const releaseType = process.argv[2]; // 'patch', 'minor', 'beta'

   if (!['patch', 'minor', 'beta'].includes(releaseType)) {
     console.error('Usage: node scripts/bump-version.js <patch|minor|beta>');
     process.exit(1);
   }

   // Read current version
   const pkgPath = path.join(__dirname, '..', 'package.json');
   const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
   const currentVersion = pkg.version;

   // Calculate new version
   let newVersion;
   const parts = currentVersion.split('.');
   const major = parseInt(parts[0]);
   const minor = parseInt(parts[1]);
   const patch = parseInt(parts[2].split('-')[0]);

   if (releaseType === 'patch') {
     newVersion = `${major}.${minor}.${patch + 1}`;
   } else if (releaseType === 'minor') {
     newVersion = `${major}.${minor + 1}.0`;
   } else if (releaseType === 'beta') {
     const betaMatch = currentVersion.match(/-beta\.(\d+)/);
     if (betaMatch) {
       const betaNum = parseInt(betaMatch[1]);
       newVersion = `${major}.${minor}.${patch}-beta.${betaNum + 1}`;
     } else {
       newVersion = `${major}.${minor}.${patch}-beta.1`;
     }
   }

   console.log(`Bumping version: ${currentVersion} → ${newVersion}`);

   // Update package.json
   pkg.version = newVersion;
   fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

   // Update package-lock.json
   execSync('npm install --package-lock-only', { stdio: 'inherit' });

   console.log('✅ Version bumped successfully!');
   console.log('Next steps:');
   console.log('1. Update com.github.IsmaelMartinez.teams_for_linux.appdata.xml');
   console.log('2. Run: npm run generate-release-info');
   console.log('3. Commit changes');
   ```

3. **Add npm scripts** to `package.json`:
   ```json
   "scripts": {
     "version:patch": "node scripts/bump-version.js patch",
     "version:minor": "node scripts/bump-version.js minor",
     "version:beta": "node scripts/bump-version.js beta"
   }
   ```

4. **Update `com.github.IsmaelMartinez.teams_for_linux.appdata.xml`** structure to support both versions:
   - Add comment blocks to separate 2.x and 3.x releases
   - Maintain chronological order
   - Ensure 3.0.0-beta releases are marked as development releases

5. **Create release checklist templates** in `.github/ISSUE_TEMPLATE/`:

   - `release-2.x.md` (for 2.x releases)
   - `release-3.x-beta.md` (for 3.x beta releases)
   - `release-3.x.md` (for 3.x stable releases)

**Acceptance Criteria**:
- [ ] Version numbering scheme documented
- [ ] Bump scripts created and tested
- [ ] npm scripts added
- [ ] Release checklist templates created
- [ ] Process documented in CONTRIBUTING.md

---

### Task 0.4: Documentation Updates

**Priority**: High
**Estimated Time**: 3 hours
**Dependencies**: Tasks 0.1, 0.2, 0.3

#### Subtasks:

1. **Update `CONTRIBUTING.md`** with dual-branch workflow:
   - Add "Understanding Our Branches" section
   - Explain when to use each branch
   - Update release process for both 2.x and 3.x
   - Add diagrams showing branch flow

2. **Create `docs-site/docs/development/release-process.md`**:
   - Detailed step-by-step release instructions for both branches
   - Version bump procedures
   - CI/CD pipeline explanation
   - Troubleshooting common release issues

3. **Update `README.md`**:
   - Add badges for both stable (2.x) and beta (3.x) releases
   - Link to installation instructions for each version
   - Clarify which version users should install

4. **Create migration guide** `docs-site/docs/migration/2.x-to-3.x.md`:
   - What's changing in 3.x
   - Breaking changes (if any)
   - Configuration migration (if needed)
   - Timeline for 2.x support

5. **Update inline documentation**:
   - Add comments to workflows explaining branch logic
   - Document environment variables
   - Explain release tagging strategy

**Acceptance Criteria**:
- [ ] CONTRIBUTING.md explains branch strategy
- [ ] Dedicated release process documentation exists
- [ ] README.md clarifies version differences
- [ ] Migration guide created for 3.x
- [ ] All documentation reviewed and accurate

---

### Task 0.5: Testing & Validation

**Priority**: Critical
**Estimated Time**: 4 hours
**Dependencies**: Tasks 0.1, 0.2, 0.3

#### Subtasks:

1. **Test 2.x release process**:
   - Create test commit on `release/2.x`
   - Bump version to `2.6.9` (or next)
   - Add release notes to appdata.xml
   - Verify CI/CD builds and publishes correctly
   - Check GitHub Release is created with correct tag
   - Verify artifacts are correct

2. **Test 3.x beta release process**:
   - Create test commit on `feature/architecture-modernization-1799`
   - Bump version to `3.0.0-beta.1`
   - Add release notes to appdata.xml
   - Verify CI/CD builds and publishes correctly
   - Check GitHub Release is created as pre-release
   - Verify artifacts are correct

3. **Test branch merging workflow**:
   - Create test branch from `release/2.x`
   - Make small change (e.g., fix typo)
   - Open PR to `release/2.x`
   - Verify status checks run
   - Merge and verify release process

4. **Test periodic sync** (`release/2.x` → `feature/architecture-modernization-1799`):
   - Merge `release/2.x` into `feature/architecture-modernization-1799`
   - Resolve any conflicts
   - Verify tests pass
   - Document merge process

5. **Create rollback plan**:
   - Document how to revert if issues occur
   - Test rolling back a release
   - Ensure tags can be deleted and recreated if needed

**Acceptance Criteria**:
- [ ] Successfully released test version on `release/2.x`
- [ ] Successfully released test beta on `feature/architecture-modernization-1799`
- [ ] Branch merging workflow tested
- [ ] Periodic sync tested and documented
- [ ] Rollback plan documented and tested

---

### Task 0.6: Communication & Rollout

**Priority**: Medium
**Estimated Time**: 2 hours
**Dependencies**: All Phase 0 tasks

#### Subtasks:

1. **Prepare announcement** for GitHub Discussions/Issue #1799:
   - Explain dual-branch strategy
   - Clarify 2.x vs 3.x release lines
   - Set expectations for 3.x timeline
   - Invite community to test betas

2. **Update issue labels**:
   - Create `release/2.x` label for 2.x issues
   - Create `release/3.x` label for 3.x issues
   - Update existing issues with appropriate labels

3. **Pin issue #1799** to repository:
   - Keep community informed of progress
   - Link to this task list
   - Regular status updates

4. **Notify contributors**:
   - Reach out to active contributors
   - Explain new workflow
   - Answer questions

**Acceptance Criteria**:
- [ ] Announcement published
- [ ] Labels created and applied
- [ ] Issue #1799 pinned
- [ ] Contributors notified

---

## Phase 0 Completion Checklist

Before proceeding to Phase 1, ensure:

- [ ] All Phase 0 tasks completed
- [ ] At least one successful 2.x release published
- [ ] At least one successful 3.x beta release published
- [ ] Documentation reviewed and approved
- [ ] Team understands new workflow
- [ ] Community notified and informed

**Estimated Total Time for Phase 0**: 17-21 hours (approximately 3-4 days)

---

## Phase 1: Foundation (Weeks 1-2)

**Goal**: Create core architecture skeleton without modifying existing functionality.

### Task 1.1: Project Structure Setup

**Priority**: Critical
**Estimated Time**: 2 hours
**Dependencies**: Phase 0 complete

#### Subtasks:

1. **Create directory structure** on `feature/architecture-modernization-1799`:
   ```bash
   mkdir -p app/core
   mkdir -p app/domains/shell
   mkdir -p app/domains/configuration
   mkdir -p app/domains/teams-integration
   mkdir -p app/domains/infrastructure
   mkdir -p app/plugins
   mkdir -p app/plugins/core
   ```

2. **Create README.md** in each new directory explaining purpose

3. **Add `.gitkeep`** files to preserve empty directories

4. **Update `.eslintrc.js`** (or equivalent) if needed for new structure

**Acceptance Criteria**:
- [ ] Directory structure created
- [ ] README files in each directory
- [ ] Linting configured
- [ ] Commit pushed to feature branch

---

### Task 1.2: EventBus Implementation

**Priority**: Critical
**Estimated Time**: 4 hours
**Dependencies**: Task 1.1

#### Subtasks:

1. **Create `app/core/EventBus.js`**:

   ```javascript
   /**
    * EventBus - Lightweight pub/sub system for cross-domain communication
    */
   class EventBus {
     #listeners = new Map();

     /**
      * Subscribe to an event
      * @param {string} event - Event name
      * @param {Function} handler - Event handler
      * @returns {Function} Unsubscribe function
      */
     on(event, handler) {
       if (!this.#listeners.has(event)) {
         this.#listeners.set(event, new Set());
       }
       this.#listeners.get(event).add(handler);

       // Return unsubscribe function
       return () => this.off(event, handler);
     }

     /**
      * Unsubscribe from an event
      * @param {string} event - Event name
      * @param {Function} handler - Event handler to remove
      */
     off(event, handler) {
       const handlers = this.#listeners.get(event);
       if (handlers) {
         handlers.delete(handler);
         if (handlers.size === 0) {
           this.#listeners.delete(event);
         }
       }
     }

     /**
      * Emit an event to all subscribers
      * @param {string} event - Event name
      * @param {*} data - Event data
      */
     emit(event, data) {
       const handlers = this.#listeners.get(event);
       if (handlers) {
         handlers.forEach(handler => {
           try {
             handler(data);
           } catch (error) {
             console.error(`Error in event handler for ${event}:`, error);
           }
         });
       }
     }

     /**
      * Subscribe to an event that will only fire once
      * @param {string} event - Event name
      * @param {Function} handler - Event handler
      */
     once(event, handler) {
       const onceHandler = (data) => {
         this.off(event, onceHandler);
         handler(data);
       };
       this.on(event, onceHandler);
     }

     /**
      * Get count of listeners for an event (useful for testing)
      * @param {string} event - Event name
      * @returns {number} Number of listeners
      */
     listenerCount(event) {
       return this.#listeners.get(event)?.size || 0;
     }

     /**
      * Remove all listeners for all events
      */
     removeAllListeners() {
       this.#listeners.clear();
     }
   }

   module.exports = EventBus;
   ```

2. **Create tests** `tests/unit/core/EventBus.test.js`:

   ```javascript
   const { describe, it, beforeEach } = require('node:test');
   const assert = require('node:assert');
   const EventBus = require('../../../app/core/EventBus');

   describe('EventBus', () => {
     let eventBus;

     beforeEach(() => {
       eventBus = new EventBus();
     });

     it('should subscribe and emit events', () => {
       let received = null;
       eventBus.on('test-event', (data) => {
         received = data;
       });

       eventBus.emit('test-event', { message: 'hello' });
       assert.deepStrictEqual(received, { message: 'hello' });
     });

     it('should handle multiple subscribers', () => {
       const results = [];
       eventBus.on('multi', (data) => results.push(data + 1));
       eventBus.on('multi', (data) => results.push(data + 2));

       eventBus.emit('multi', 10);
       assert.deepStrictEqual(results, [11, 12]);
     });

     it('should unsubscribe listeners', () => {
       let count = 0;
       const handler = () => { count++; };

       eventBus.on('test', handler);
       eventBus.emit('test');
       assert.strictEqual(count, 1);

       eventBus.off('test', handler);
       eventBus.emit('test');
       assert.strictEqual(count, 1); // Still 1, not incremented
     });

     it('should support once() for single-fire subscriptions', () => {
       let count = 0;
       eventBus.once('once-test', () => { count++; });

       eventBus.emit('once-test');
       eventBus.emit('once-test');
       assert.strictEqual(count, 1);
     });

     it('should return unsubscribe function from on()', () => {
       let count = 0;
       const unsubscribe = eventBus.on('unsub-test', () => { count++; });

       eventBus.emit('unsub-test');
       assert.strictEqual(count, 1);

       unsubscribe();
       eventBus.emit('unsub-test');
       assert.strictEqual(count, 1);
     });

     it('should handle errors in handlers gracefully', () => {
       let successCalled = false;
       eventBus.on('error-test', () => { throw new Error('Handler error'); });
       eventBus.on('error-test', () => { successCalled = true; });

       // Should not throw, and second handler should still execute
       eventBus.emit('error-test');
       assert.strictEqual(successCalled, true);
     });

     it('should track listener count', () => {
       assert.strictEqual(eventBus.listenerCount('count-test'), 0);

       eventBus.on('count-test', () => {});
       assert.strictEqual(eventBus.listenerCount('count-test'), 1);

       eventBus.on('count-test', () => {});
       assert.strictEqual(eventBus.listenerCount('count-test'), 2);
     });

     it('should remove all listeners', () => {
       eventBus.on('event1', () => {});
       eventBus.on('event2', () => {});

       assert.strictEqual(eventBus.listenerCount('event1'), 1);
       assert.strictEqual(eventBus.listenerCount('event2'), 1);

       eventBus.removeAllListeners();

       assert.strictEqual(eventBus.listenerCount('event1'), 0);
       assert.strictEqual(eventBus.listenerCount('event2'), 0);
     });
   });
   ```

3. **Add test script** to `package.json`:
   ```json
   "scripts": {
     "test": "node --test tests/unit/**/*.test.js",
     "test:core": "node --test tests/unit/core/**/*.test.js"
   }
   ```

4. **Run tests** and verify they pass:
   ```bash
   npm run test:core
   ```

**Acceptance Criteria**:
- [ ] EventBus.js implemented with full functionality
- [ ] Comprehensive unit tests written and passing
- [ ] Test npm script added
- [ ] Documentation in EventBus.js complete

---

### Task 1.3: PluginManager Implementation

**Priority**: Critical
**Estimated Time**: 6 hours
**Dependencies**: Task 1.2

#### Subtasks:

1. **Create `app/core/BasePlugin.js`**:

   ```javascript
   /**
    * BasePlugin - Abstract base class for all plugins
    */
   class BasePlugin {
     #api;
     #manifest;

     constructor(api, manifest) {
       if (new.target === BasePlugin) {
         throw new Error('BasePlugin is abstract and cannot be instantiated directly');
       }
       this.#api = api;
       this.#manifest = manifest;
     }

     /**
      * Get plugin API (sandboxed based on permissions)
      */
     get api() {
       return this.#api;
     }

     /**
      * Get plugin manifest
      */
     get manifest() {
       return this.#manifest;
     }

     /**
      * Plugin lifecycle: called when plugin is activated
      * Must be implemented by subclasses
      */
     async onActivate() {
       throw new Error(`${this.constructor.name} must implement onActivate()`);
     }

     /**
      * Plugin lifecycle: called when plugin is deactivated
      * Must be implemented by subclasses
      */
     async onDeactivate() {
       throw new Error(`${this.constructor.name} must implement onDeactivate()`);
     }

     /**
      * Optional: called when configuration changes
      */
     async onConfigChange(config) {
       // Default: no-op
     }

     /**
      * Optional: called when main window is ready
      */
     async onWindowReady(window) {
       // Default: no-op
     }
   }

   module.exports = BasePlugin;
   ```

2. **Create `app/core/PluginAPI.js`**:

   ```javascript
   /**
    * PluginAPI - Sandboxed API provided to plugins
    */
   class PluginAPI {
     #permissions;
     #eventBus;
     #ipcRegistry;
     #configService;
     #windowService;

     constructor({ permissions, eventBus, ipcRegistry, configService, windowService }) {
       this.#permissions = permissions || [];
       this.#eventBus = eventBus;
       this.#ipcRegistry = ipcRegistry;
       this.#configService = configService;
       this.#windowService = windowService;
     }

     /**
      * Event bus (always available)
      */
     get events() {
       return {
         on: (event, handler) => this.#eventBus.on(event, handler),
         off: (event, handler) => this.#eventBus.off(event, handler),
         once: (event, handler) => this.#eventBus.once(event, handler),
         emit: (event, data) => this.#eventBus.emit(event, data),
       };
     }

     /**
      * IPC communication (requires 'ipc' permission)
      */
     get ipc() {
       if (!this.#hasPermission('ipc')) {
         return null;
       }
       return this.#ipcRegistry;
     }

     /**
      * Configuration access (always available, scoped to plugin)
      */
     get config() {
       return this.#configService;
     }

     /**
      * Window management (requires 'windows' permission)
      */
     get windows() {
       if (!this.#hasPermission('windows')) {
         return null;
       }
       return this.#windowService;
     }

     /**
      * Check if plugin has specific permission
      */
     #hasPermission(permission) {
       return this.#permissions.includes(permission);
     }
   }

   module.exports = PluginAPI;
   ```

3. **Create `app/core/PluginManager.js`**:

   ```javascript
   const fs = require('fs');
   const path = require('path');
   const BasePlugin = require('./BasePlugin');
   const PluginAPI = require('./PluginAPI');

   /**
    * PluginManager - Manages plugin lifecycle and loading
    */
   class PluginManager {
     #plugins = new Map();
     #apiServices;
     #logger;

     constructor(apiServices, logger) {
       this.#apiServices = apiServices;
       this.#logger = logger || console;
     }

     /**
      * Load a plugin from a manifest file
      */
     async loadPlugin(manifestPath) {
       try {
         // Read and parse manifest
         const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
         this.#validateManifest(manifest);

         // Check if already loaded
         if (this.#plugins.has(manifest.id)) {
           throw new Error(`Plugin ${manifest.id} is already loaded`);
         }

         // Load plugin class
         const pluginDir = path.dirname(manifestPath);
         const pluginMainPath = path.join(pluginDir, manifest.main);
         const PluginClass = require(pluginMainPath);

         // Verify it extends BasePlugin
         if (!PluginClass.prototype instanceof BasePlugin && PluginClass !== BasePlugin) {
           throw new Error(`Plugin ${manifest.id} must extend BasePlugin`);
         }

         // Create sandboxed API
         const api = this.#createSandboxedAPI(manifest.permissions || []);

         // Instantiate plugin
         const instance = new PluginClass(api, manifest);

         // Activate plugin
         await instance.onActivate();

         // Store plugin
         this.#plugins.set(manifest.id, { manifest, instance });

         this.#logger.info(`✅ Plugin loaded: ${manifest.id} v${manifest.version}`);
         return manifest.id;
       } catch (error) {
         this.#logger.error(`❌ Failed to load plugin from ${manifestPath}:`, error);
         throw error;
       }
     }

     /**
      * Unload a plugin
      */
     async unloadPlugin(pluginId) {
       const plugin = this.#plugins.get(pluginId);
       if (!plugin) {
         throw new Error(`Plugin ${pluginId} is not loaded`);
       }

       try {
         await plugin.instance.onDeactivate();
         this.#plugins.delete(pluginId);
         this.#logger.info(`✅ Plugin unloaded: ${pluginId}`);
       } catch (error) {
         this.#logger.error(`❌ Error unloading plugin ${pluginId}:`, error);
         throw error;
       }
     }

     /**
      * Load all core plugins from plugins/core directory
      */
     async loadCorePlugins() {
       const corePluginsDir = path.join(__dirname, '..', 'plugins', 'core');

       if (!fs.existsSync(corePluginsDir)) {
         this.#logger.warn('Core plugins directory does not exist yet');
         return [];
       }

       const pluginDirs = fs.readdirSync(corePluginsDir, { withFileTypes: true })
         .filter(dirent => dirent.isDirectory())
         .map(dirent => dirent.name);

       const loadedPlugins = [];
       for (const pluginDir of pluginDirs) {
         const manifestPath = path.join(corePluginsDir, pluginDir, 'manifest.json');
         if (fs.existsSync(manifestPath)) {
           try {
             const pluginId = await this.loadPlugin(manifestPath);
             loadedPlugins.push(pluginId);
           } catch (error) {
             this.#logger.error(`Failed to load core plugin ${pluginDir}:`, error);
           }
         }
       }

       return loadedPlugins;
     }

     /**
      * Get loaded plugin instance
      */
     getPlugin(pluginId) {
       return this.#plugins.get(pluginId)?.instance;
     }

     /**
      * Get all loaded plugin IDs
      */
     getLoadedPlugins() {
       return Array.from(this.#plugins.keys());
     }

     /**
      * Notify all plugins of config change
      */
     async notifyConfigChange(config) {
       for (const { instance } of this.#plugins.values()) {
         try {
           await instance.onConfigChange(config);
         } catch (error) {
           this.#logger.error(`Error notifying plugin of config change:`, error);
         }
       }
     }

     /**
      * Notify all plugins of window ready
      */
     async notifyWindowReady(window) {
       for (const { instance } of this.#plugins.values()) {
         try {
           await instance.onWindowReady(window);
         } catch (error) {
           this.#logger.error(`Error notifying plugin of window ready:`, error);
         }
       }
     }

     /**
      * Validate plugin manifest structure
      */
     #validateManifest(manifest) {
       const required = ['id', 'name', 'version', 'main'];
       for (const field of required) {
         if (!manifest[field]) {
           throw new Error(`Manifest missing required field: ${field}`);
         }
       }

       // Validate version format (basic semver check)
       if (!/^\d+\.\d+\.\d+/.test(manifest.version)) {
         throw new Error(`Invalid version format: ${manifest.version}`);
       }
     }

     /**
      * Create sandboxed API for plugin based on permissions
      */
     #createSandboxedAPI(permissions) {
       return new PluginAPI({
         permissions,
         eventBus: this.#apiServices.eventBus,
         ipcRegistry: this.#apiServices.ipcRegistry,
         configService: this.#apiServices.configService,
         windowService: this.#apiServices.windowService,
       });
     }
   }

   module.exports = PluginManager;
   ```

4. **Create unit tests** for PluginManager

5. **Run tests** and verify

**Acceptance Criteria**:
- [ ] BasePlugin.js implemented
- [ ] PluginAPI.js implemented with permission sandboxing
- [ ] PluginManager.js implemented with full lifecycle
- [ ] Unit tests written and passing
- [ ] Documentation complete

---

### Task 1.4: Application.js Skeleton

**Priority**: High
**Estimated Time**: 4 hours
**Dependencies**: Tasks 1.2, 1.3

#### Subtasks:

1. **Create `app/core/Application.js`**:

   ```javascript
   const { app } = require('electron');
   const EventBus = require('./EventBus');
   const PluginManager = require('./PluginManager');

   /**
    * Application - Main application orchestrator (replaces index.js)
    */
   class Application {
     #eventBus;
     #pluginManager;
     #domains = new Map();
     #isReady = false;

     constructor(logger) {
       this.#eventBus = new EventBus();
       this.logger = logger || console;
     }

     /**
      * Start the application
      */
     async start() {
       try {
         this.logger.info('Starting Teams for Linux v3...');

         // Wait for Electron to be ready
         await app.whenReady();

         // Initialize domains in dependency order
         await this.#initializeDomains();

         // Initialize plugin system
         await this.#initializePlugins();

         // Start application
         this.#isReady = true;
         this.#eventBus.emit('app:ready');

         this.logger.info('✅ Application started successfully');
       } catch (error) {
         this.logger.error('❌ Failed to start application:', error);
         throw error;
       }
     }

     /**
      * Shutdown the application
      */
     async shutdown() {
       try {
         this.logger.info('Shutting down application...');

         // Emit shutdown event
         this.#eventBus.emit('app:shutdown');

         // Unload plugins
         if (this.#pluginManager) {
           const plugins = this.#pluginManager.getLoadedPlugins();
           for (const pluginId of plugins) {
             await this.#pluginManager.unloadPlugin(pluginId);
           }
         }

         // Shutdown domains (reverse order)
         const domainNames = Array.from(this.#domains.keys()).reverse();
         for (const name of domainNames) {
           const domain = this.#domains.get(name);
           if (domain.shutdown) {
             await domain.shutdown();
           }
         }

         this.logger.info('✅ Application shut down successfully');
       } catch (error) {
         this.logger.error('❌ Error during shutdown:', error);
         throw error;
       }
     }

     /**
      * Initialize domains in dependency order
      */
     async #initializeDomains() {
       this.logger.info('Initializing domains...');

       // Phase 1+ will implement actual domains
       // For now, this is a placeholder

       this.logger.info('✅ Domains initialized');
     }

     /**
      * Initialize plugin system
      */
     async #initializePlugins() {
       this.logger.info('Initializing plugin system...');

       // Create plugin manager with API services
       const apiServices = {
         eventBus: this.#eventBus,
         ipcRegistry: null, // Phase 2+
         configService: null, // Phase 3+
         windowService: null, // Phase 4+
       };

       this.#pluginManager = new PluginManager(apiServices, this.logger);

       // Load core plugins
       const loadedPlugins = await this.#pluginManager.loadCorePlugins();
       this.logger.info(`✅ Loaded ${loadedPlugins.length} core plugins`);
     }

     /**
      * Get event bus instance
      */
     get eventBus() {
       return this.#eventBus;
     }

     /**
      * Get plugin manager instance
      */
     get pluginManager() {
       return this.#pluginManager;
     }

     /**
      * Check if application is ready
      */
     get isReady() {
       return this.#isReady;
     }
   }

   module.exports = Application;
   ```

2. **Create `app/main.js`** (new entry point):

   ```javascript
   /**
    * main.js - New application entry point for v3.0
    * Replaces index.js with clean architecture
    */
   const Application = require('./core/Application');
   const logger = require('./config/logger'); // Existing logger

   const app = new Application(logger);

   // Start application
   app.start().catch(error => {
     logger.error('Fatal error during startup:', error);
     process.exit(1);
   });

   // Handle graceful shutdown
   process.on('SIGTERM', async () => {
     await app.shutdown();
     process.exit(0);
   });

   process.on('SIGINT', async () => {
     await app.shutdown();
     process.exit(0);
   });
   ```

3. **Note**: Do NOT update package.json "main" yet - that happens in Phase 8

4. **Create integration test** to verify Application starts

**Acceptance Criteria**:
- [ ] Application.js implemented
- [ ] main.js entry point created
- [ ] Application can initialize (even with no domains yet)
- [ ] Shutdown process works correctly
- [ ] Integration test passes

---

### Task 1.5: Domain Interface Specification

**Priority**: High
**Estimated Time**: 3 hours
**Dependencies**: Task 1.4

#### Subtasks:

1. **Create `app/domains/BaseDomain.js`**:

   ```javascript
   /**
    * BaseDomain - Abstract base class for all domains
    */
   class BaseDomain {
     #name;
     #eventBus;
     #logger;

     constructor(name, eventBus, logger) {
       if (new.target === BaseDomain) {
         throw new Error('BaseDomain is abstract');
       }
       this.#name = name;
       this.#eventBus = eventBus;
       this.#logger = logger || console;
     }

     /**
      * Initialize the domain
      * Must be implemented by subclasses
      */
     async initialize() {
       throw new Error(`${this.constructor.name} must implement initialize()`);
     }

     /**
      * Shutdown the domain
      * Optional - implement if cleanup needed
      */
     async shutdown() {
       // Default: no-op
     }

     /**
      * Get domain name
      */
     get name() {
       return this.#name;
     }

     /**
      * Get event bus
      */
     get eventBus() {
       return this.#eventBus;
     }

     /**
      * Get logger
      */
     get logger() {
       return this.#logger;
     }

     /**
      * Get public API for this domain
      * Must be implemented by subclasses to expose functionality to plugins
      */
     getPublicAPI() {
       throw new Error(`${this.constructor.name} must implement getPublicAPI()`);
     }
   }

   module.exports = BaseDomain;
   ```

2. **Create placeholder domains** (to be fully implemented in later phases):

   - `app/domains/infrastructure/InfrastructureDomain.js`
   - `app/domains/configuration/ConfigurationDomain.js`
   - `app/domains/shell/ShellDomain.js`
   - `app/domains/teams-integration/TeamsIntegrationDomain.js`

   Each with basic structure extending BaseDomain

3. **Create `docs-site/docs/development/domain-specification.md`**:
   - Document each domain's responsibility
   - List dependencies between domains
   - Specify public API contracts
   - Include diagrams from research doc

**Acceptance Criteria**:
- [ ] BaseDomain.js implemented
- [ ] Placeholder domain files created
- [ ] Domain specification documentation complete
- [ ] Clear contracts defined

---

### Task 1.6: Phase 1 Integration & Testing

**Priority**: Critical
**Estimated Time**: 4 hours
**Dependencies**: All Phase 1 tasks

#### Subtasks:

1. **Create end-to-end test** for Phase 1 architecture:
   - Verify Application starts
   - Verify EventBus works
   - Verify PluginManager loads (even with no plugins)
   - Verify shutdown works

2. **Run existing E2E tests** to ensure no regression:
   ```bash
   npm run test:e2e
   ```

3. **Create architecture validation script** `scripts/validate-architecture.js`:
   - Check directory structure is correct
   - Verify all core files exist
   - Validate manifest.json schemas (when plugins exist)

4. **Update CI/CD** to run architecture validation

5. **Code review** and refactoring

**Acceptance Criteria**:
- [ ] All Phase 1 unit tests passing
- [ ] Integration test passes
- [ ] Existing E2E tests pass (no regression)
- [ ] Architecture validation script passes
- [ ] Code reviewed and approved

---

## Phase 1 Completion Checklist

- [ ] All Phase 1 tasks completed
- [ ] Core architecture implemented (EventBus, PluginManager, Application)
- [ ] Domain interfaces defined
- [ ] Tests passing
- [ ] Documentation updated
- [ ] No regression in existing functionality
- [ ] Phase 1 beta release created (`v3.0.0-beta.1`)

**Estimated Total Time for Phase 1**: 23 hours (approximately 3-4 days)

---

## Phases 2-10: Summary

Due to length constraints, Phases 2-10 are summarized here. Each phase will be broken down into similar detailed tasks in separate documents.

### Phase 2: Infrastructure Domain (Week 3)
- Extract Logger, CacheManager, NetworkMonitor
- Implement infrastructure domain
- Create unit and integration tests

### Phase 3: Configuration Domain (Week 4)
- Move appConfiguration to domain
- Implement StateManager
- Replace global variables

### Phase 4: Shell Domain (Week 5)
- Extract window management
- Migrate mainAppWindow
- Implement tray management

### Phase 5: Teams Integration Domain (Week 6)
- Extract reactHandler and tokenCache
- Implement secure injection API
- **High risk - extensive testing required**

### Phase 6: First Plugin Migration (Week 7)
- Convert notifications module to plugin
- Validate plugin architecture
- Create plugin development template

### Phase 7-8: Bulk Plugin Migration (Weeks 7-8)
- Convert remaining 30 modules to plugins
- Week 7: Main process modules
- Week 8: Browser tools

### Phase 9: Integration & Testing (Week 9)
- End-to-end testing
- Performance benchmarking
- Cross-platform validation

### Phase 10: Release Preparation (Week 10)
- Documentation updates
- Release notes
- Merge to main
- Release v3.0.0

---

## Success Metrics

**Code Quality:**
- [ ] `index.js` reduced from 711 lines to <100 lines
- [ ] Unit test coverage >70% for domains
- [ ] Cyclomatic complexity reduced by 40%

**Functionality:**
- [ ] All existing features work in plugin architecture
- [ ] DOM access preserved and tested
- [ ] No user-facing regressions

**Performance:**
- [ ] Startup time unchanged (<5% variance)
- [ ] Memory usage unchanged (<10MB variance)
- [ ] All E2E tests pass

**Process:**
- [ ] 2.x and 3.x releases working independently
- [ ] Community informed and engaged
- [ ] Documentation complete

---

## References

- [Architecture Modernization Research](./research/architecture-modernization-research.md)
- [IPC API Documentation](./ipc-api.md)
- [Contributing Guide](../../CONTRIBUTING.md)
- [Release Process](./release-process.md)

---

**Document Status**: Draft - Ready for Review
**Last Updated**: 2025-11-01
**Next Review**: Before Phase 1 Kickoff
