# Configuration Organization Research

:::info Ongoing — Incremental Migration
Phase 1 (documentation) complete. New features already use nested patterns (`mqtt.*`, `graphApi.*`, `quickChat.*`, etc.). Flat-to-nested migration happens opportunistically as modules are refactored — no dedicated migration effort planned.
:::

**Issue**: Configuration improvements and cleanup investigation
**Created**: 2025-11-09
**Updated**: 2026-02-13
**Status**: Phase 1 Complete | Phases 2-3 happening incrementally

## Executive Summary

### Current State
Teams for Linux has **66 active configuration options** managed through a flat yargs-based configuration system. While functional, the current organization has several issues: related options are scattered across documentation categories, naming conventions are inconsistent, and conditional options add complexity.

### Key Findings

1. **Poor Grouping**: Related options controlling single features are scattered:
   - Idle detection (4 options) spread across categories
   - Notification system (11 options) split between categories
   - Window behavior (7 options) scattered across Core, Advanced, and Screen Sharing sections
   - SSO options use inconsistent naming patterns

3. **Conditional Options**: Some options are only relevant when other options are set to specific values:

   **Current Conditional Dependencies:**
   - `customNotification.*` settings only apply when `notificationMethod: "custom"`
   - `graphApi.*` settings only apply when `graphApi.enabled: true`
   - `mqtt.brokerUrl`, `mqtt.username`, `mqtt.password`, `mqtt.commandTopic` only apply when `mqtt.enabled: true`
   - `auth.basic.passwordCommand` only applies when `auth.basic.user` is set
   - `auth.intune.user` only applies when `auth.intune.enabled: true`
   - `screenSharing.thumbnail.alwaysOnTop` only applies when `screenSharing.thumbnail.enabled: true`
   - `idleDetection` check intervals only apply when `idleDetection.enabled: true`

   **Impact:** This pattern creates complexity where not all implementations need all options. Future Phase 2 work should include validation to warn users when dependent options are set without their parent enabled.

4. **Structural Inconsistency**: Mix of flat options and nested objects without clear pattern:
   - Good: `mqtt`, `cacheManagement`, `screenSharing`, `media`, `auth`, `customNotification`, `graphApi` (nested)
   - Bad: `customBGServiceBaseUrl`, `customBGServiceConfigFetchInterval` (should be nested)

5. **Naming Issues**: Mix of negative (`disableNotifications`) and positive (`trayIconEnabled`) naming, plus some overly verbose names.

### Approach Decision
**Incremental Migration** (Phases 2-3 deferred):

**Phase 1 (v2.x)**: Documentation reorganization + deprecation warnings - ✅ **COMPLETE**
**Phases 2-3**: ⏸️ **DEFERRED** - Nested structure will happen incrementally as modules are refactored
  - No comprehensive auto-migration tooling will be built
  - New features will use nested patterns from day one (e.g., `mqtt`, `graphApi`, `customNotification`)
  - Existing flat options will migrate opportunistically when those modules are refactored
  - Gradual evolution preferred over coordinated migration effort

### Expected Benefits
- **Discoverability**: Better documentation grouping helps users find related options
- **Maintainability**: Nested structure reduces config sprawl
- **Consistency**: Standardized naming and organization patterns
- **Future-proofing**: Clear pattern for adding new features

### Risk Level
**Low**: Phase 1 (docs + MQTT) has zero breaking changes. Phases 2-3 use deprecation warnings and auto-migration to minimize disruption.

---

## Detailed Analysis

### Configuration Architecture

#### Current Implementation
The configuration system uses a layered approach:

```
System Config → User Config → CLI Args → Defaults
(/etc/teams-for-linux/config.json) → (~/.config/.../config.json) → (process.argv) → (yargs defaults)
```

**Files Involved:**
- `app/config/index.js` - Main config loader with yargs
- `app/appConfiguration/index.js` - AppConfiguration wrapper class
- User/system config.json files

**Good Aspects:**
- Hierarchical config merging works well
- Environment variable support via yargs
- Clear precedence order
- Immutable config pattern via AppConfiguration class

**Problem Areas:**
- All 66 active options defined in single ~535-line yargs config block
- No programmatic grouping (only documentation grouping)
- Mixed patterns (flat vs nested) without clear logic

### Configuration Options Inventory

#### By Current Documentation Category

**Core Application Settings (7 options)**
```javascript
url, appTitle, partition, closeAppOnCross, minimized, frame, menubar, webDebug
```

**Authentication & Security (8 options)**
```javascript
authServerWhitelist, clientCertPath, clientCertPassword, customCACertsFingerprints,
ssoBasicAuthUser, ssoBasicAuthPasswordCommand, ssoInTuneEnabled, ssoInTuneAuthUser,
proxyServer
```

**Notifications & UI (10 options)**
```javascript
disableNotifications, disableNotificationSound, disableNotificationSoundIfNotAvailable,
disableNotificationWindowFlash, notificationMethod, defaultNotificationUrgency,
enableIncomingCallToast, customCSSName, customCSSLocation, followSystemTheme
```

**Screen Sharing & Media (7 options)**
```javascript
disableAutogain, screenSharingThumbnail, screenLockInhibitionMethod, videoMenu,
isCustomBackgroundEnabled, customBGServiceBaseUrl, customBGServiceConfigFetchInterval
```

**System Integration (10 options)**
```javascript
trayIconEnabled, appIcon, appIconType, useMutationTitleLogic, awayOnSystemIdle,
appIdleTimeout, appIdleTimeoutCheckInterval, appActiveCheckInterval,
disableGlobalShortcuts, globalShortcuts
```

**Advanced Options (15 options)**
```javascript
electronCLIFlags, chromeUserAgent, emulateWinChromiumPlatform, disableGpu,
clearStorageData, watchConfigFile, class, defaultURLHandler, spellCheckerLanguages,
logConfig, meetupJoinRegEx, msTeamsProtocols, onNewWindowOpenMeetupJoinUrlInApp,
disableTimestampOnCopy, cacheManagement
```

**~~Undocumented~~ ✅ DOCUMENTED**
```javascript
mqtt  // Now documented in PR #1939
```

**~~Deprecated~~ ✅ REMOVED**
```javascript
// contextIsolation, sandbox - REMOVED from configuration
```

**Total Active Options: 66**

*Count breakdown: 7 (Core) + 8 (Auth & Security) + 10 (Notifications & UI) + 7 (Screen Sharing & Media) + 10 (System Integration) + 15 (Advanced) + 1 (MQTT) + 2 (customNotification, graphApi) + 6 (from examples: incomingCallCommand, incomingCallCommandArgs, disableBadgeCount, alwaysOnTop, class, disableTimestampOnCopy) = 66 total*

### Problem Analysis

#### Problem 1: Scattered Related Options

**Case Study: Idle Detection**

Four tightly coupled options currently in "System Integration":
```javascript
awayOnSystemIdle: false,          // Enable feature
appIdleTimeout: 300,              // Idle duration (seconds)
appIdleTimeoutCheckInterval: 10,  // Poll interval to check if idle
appActiveCheckInterval: 2,        // Poll interval to check if active again
```

**Issues:**
- Options only make sense together
- `appIdleTimeout` has no effect if `awayOnSystemIdle` is false
- Check intervals are implementation details, should be nested
- Naming doesn't indicate they're related

**Proposed Grouping:**
```javascript
idleDetection: {
  enabled: false,           // Clearer than awayOnSystemIdle
  timeout: 300,
  checkInterval: {
    idle: 10,
    active: 2
  }
}
```

**Case Study: Notification System**

Nine options across multiple categories:
```javascript
// Currently in "Notifications & UI"
disableNotifications: false,
disableNotificationSound: false,
disableNotificationSoundIfNotAvailable: false,
disableNotificationWindowFlash: false,
notificationMethod: "web",
defaultNotificationUrgency: "normal",
enableIncomingCallToast: false,

// Documented in "Usage Examples" only
incomingCallCommand: null,
incomingCallCommandArgs: [],
```

**Issues:**
- Last 2 are in examples section, not main options table
- Mix of `disable*` and `enable*` naming
- Incoming call toast vs command are related but separated
- `disableNotificationSoundIfNotAvailable` is 39 characters long

**Proposed Grouping:**
```javascript
notifications: {
  enabled: true,                    // Replace disableNotifications
  sound: {
    enabled: true,                  // Replace disableNotificationSound
    onlyWhenAvailable: false        // Replace disableNotificationSoundIfNotAvailable
  },
  windowFlash: true,                // Replace disableNotificationWindowFlash
  method: "web",
  urgency: "normal"
},
incomingCalls: {
  toast: false,                     // Replace enableIncomingCallToast
  command: null,                    // Bring from examples
  commandArgs: []                   // Bring from examples
}
```

**Case Study: Custom Backgrounds**

Three options in "Screen Sharing & Media" (wrong category):
```javascript
isCustomBackgroundEnabled: false,
customBGServiceBaseUrl: "http://localhost",
customBGServiceConfigFetchInterval: 0,
```

**Issues:**
- Not related to screen sharing (these are virtual backgrounds in calls)
- Inconsistent naming: `isCustomBackgroundEnabled` vs `customBGService*`
- Should be nested like `mqtt` and `cacheManagement`

**Proposed Grouping:**
```javascript
customBackground: {
  enabled: false,               // Replace isCustomBackgroundEnabled
  serviceBaseUrl: "http://localhost",
  configFetchInterval: 0
}
```

#### Problem 2: Naming Inconsistencies

**Negative vs Positive Naming:**
```javascript
// Negative (9 options)
disableNotifications, disableNotificationSound, disableNotificationSoundIfNotAvailable,
disableNotificationWindowFlash, disableAutogain, disableGpu, disableGlobalShortcuts,
disableTimestampOnCopy

// Positive (3 options)
trayIconEnabled, enableIncomingCallToast, isCustomBackgroundEnabled

// Mixed pattern creates cognitive overhead
```

**Abbreviation Inconsistency:**
```javascript
// SSO naming variations
ssoInTuneEnabled           // camelCase with acronym
ssoBasicAuthUser           // camelCase with acronym
ssoBasicAuthPasswordCommand // Very long

// BG vs Background
customBGServiceBaseUrl     // Abbreviation
isCustomBackgroundEnabled  // Full word
```

**Recommendation:**
- Standardize on positive naming (`enabled` not `disable*`)
- Use consistent abbreviations or always spell out
- Nested structure reduces name length needs

#### Problem 3: Flat vs Nested Structure

**Current Nested Options (Good):**
```javascript
screenSharingThumbnail: {
  enabled: true,
  alwaysOnTop: true
}

cacheManagement: {
  enabled: false,
  maxCacheSizeMB: 600,
  cacheCheckIntervalMs: 3600000
}

mqtt: {
  enabled: false,
  brokerUrl: "",
  username: "",
  password: "",
  clientId: "teams-for-linux",
  topicPrefix: "teams",
  statusTopic: "status",
  statusCheckInterval: 10000
}

logConfig: {
  transports: {
    console: { level: "info" },
    file: { level: false }
  }
}

msTeamsProtocols: {
  v1: "^msteams:/l/(?:meetup-join|channel|chat|message)",
  v2: "^msteams://teams.(?:microsoft.com|cloud.microsoft)/l/(?:meetup-join|channel|chat|message)"
}
```

**Current Flat Options (Should Be Nested):**
```javascript
// Custom background - should be object
isCustomBackgroundEnabled: false,
customBGServiceBaseUrl: "http://localhost",
customBGServiceConfigFetchInterval: 0,

// Idle detection - should be object
awayOnSystemIdle: false,
appIdleTimeout: 300,
appIdleTimeoutCheckInterval: 10,
appActiveCheckInterval: 2,

// Window behavior - could be object
frame: true,
menubar: "auto",
minimized: false,
closeAppOnCross: false,
class: null,

// Incoming calls - should be object
enableIncomingCallToast: false,
incomingCallCommand: null,
incomingCallCommandArgs: [],

// SSO - could be nested by method
ssoBasicAuthUser: "",
ssoBasicAuthPasswordCommand: "",
ssoInTuneEnabled: false,
ssoInTuneAuthUser: "",

// Notifications - should be object
disableNotifications: false,
disableNotificationSound: false,
disableNotificationSoundIfNotAvailable: false,
disableNotificationWindowFlash: false,
notificationMethod: "web",
defaultNotificationUrgency: "normal",
```

**Criteria for Nesting:**
- 3+ related options → should be nested
- Options with common prefix → should be nested
- Options that only matter when parent is enabled → should be nested
- Single conceptual feature → should be nested

---

## Proposed Solution

### Phase 1: Documentation Reorganization (v2.x) - ZERO Breaking Changes

**Goal:** Improve discoverability without code changes

**Changes:**
1. [x] Add MQTT to configuration.md (completed in PR [#1939](https://github.com/IsmaelMartinez/teams-for-linux/pull/1939))
2. [x] Remove deprecated options (completed - contextIsolation, sandbox removed)
3. [ ] Reorganize documentation categories into logical groupings

**New Documentation Categories:**

```markdown
### Application Core
- url, appTitle, partition

### Window & UI Behavior
- frame, menubar, minimized, closeAppOnCross, class, alwaysOnTop

### Theming & Appearance
- customCSSName, customCSSLocation, followSystemTheme

### Tray Icon
- trayIconEnabled, appIcon, appIconType, useMutationTitleLogic

### Notification System
- disableNotifications, disableNotificationSound,
  disableNotificationSoundIfNotAvailable, disableNotificationWindowFlash,
  notificationMethod, defaultNotificationUrgency

### Incoming Call Handling
- enableIncomingCallToast, incomingCallCommand, incomingCallCommandArgs

### Idle & Activity Detection
- awayOnSystemIdle, appIdleTimeout, appIdleTimeoutCheckInterval,
  appActiveCheckInterval

### Authentication & SSO
- **Basic Authentication**
  - authServerWhitelist, ssoBasicAuthUser, ssoBasicAuthPasswordCommand
- **InTune SSO**
  - ssoInTuneEnabled, ssoInTuneAuthUser
- **Certificates**
  - clientCertPath, clientCertPassword, customCACertsFingerprints

### Network & Proxy
- proxyServer

### Screen Sharing
- screenSharingThumbnail, screenLockInhibitionMethod

### Media Settings
- disableAutogain, videoMenu

### Virtual Backgrounds
- isCustomBackgroundEnabled, customBGServiceBaseUrl,
  customBGServiceConfigFetchInterval

### URL & Protocol Handling
- defaultURLHandler, meetupJoinRegEx, msTeamsProtocols,
  onNewWindowOpenMeetupJoinUrlInApp

### Keyboard Shortcuts
- disableGlobalShortcuts, globalShortcuts

### MQTT Integration
- mqtt configuration object (see [MQTT Integration Guide](https://ismaelmartinez.github.io/teams-for-linux/mqtt-integration))

### Performance & Hardware
- disableGpu, electronCLIFlags

### Cache & Storage
- cacheManagement, clearStorageData

### Development & Debug
- webDebug, logConfig, watchConfigFile

### Advanced Platform Options
- chromeUserAgent, emulateWinChromiumPlatform, spellCheckerLanguages,
  disableTimestampOnCopy

### Deprecated Options (Removed)
- contextIsolation (removed from app/config/index.js)
- sandbox (removed from app/config/index.js)
```

**Deliverables:**
- [ ] Updated docs-site/docs/configuration.md (reorganize categories)
- [x] New MQTT configuration section with examples (completed in PR [#1939](https://github.com/IsmaelMartinez/teams-for-linux/pull/1939))
- [x] Deprecated options removal (completed - removed from config)
- **Remaining Effort: 1-2 hours**

### Phase 2: Introduce Nested Structure (DEFERRED)

**Status:** ⏸️ DEFERRED - Will happen incrementally as modules are refactored

**Original Goal:** Add new nested options while maintaining backward compatibility

**Implementation Strategy:**

1. **Incremental area-by-area migration** - Start with one area (e.g., notifications during upcoming refactoring)
2. **Add new nested options in parallel** with old flat options
3. **Use yargs' built-in `deprecated` field** - Displays warnings to users, guiding migration
4. **Auto-migration logic** in config loader to convert old keys to new structure
5. **Documentation** shows new pattern, mentions old for reference

**Area-by-Area Approach:**
Phase 2 can be implemented incrementally by area, aligning with feature work:
- **Notifications**: When notification refactoring happens, migrate to `notifications` object
- **Window behavior**: Migrate to `window` object when window features are updated
- **Authentication**: Migrate to `auth` object during SSO improvements
- etc.

This allows each migration to be tested thoroughly and aligned with related feature work.

**Example: Using Yargs Deprecated Field:**

```javascript
// In app/config/index.js - yargs options definition
// Add deprecated field to old options while keeping them functional

disableNotifications: {
  default: false,
  deprecated: "Use notifications.enabled instead (with inverted logic)",
  describe: "Disable all notifications",
  type: "boolean",
}

// Add new nested option in parallel
notifications: {
  default: {
    enabled: true,
    sound: { enabled: true, onlyWhenAvailable: false },
    windowFlash: true,
    method: "web",
    urgency: "normal"
  },
  describe: "Notification system configuration",
  type: "object"
}
```

**Example Auto-Migration Module:**

Create a dedicated migration module at `app/config/migration.js`:

```javascript
// app/config/migration.js
// Configuration migration module - automatically converts old config keys to new structure
// This runs transparently for users, fixing their config without manual intervention

/**
 * Migrates old flat configuration keys to new nested structure
 * @param {Object} config - Parsed yargs config object
 * @returns {Object} - Migrated config
 */
function migrateConfig(config) {
  const migrations = [];

  // Notifications migration
  if (hasOldNotificationKeys(config)) {
    migrateNotifications(config);
    migrations.push('notifications');
  }

  // Window migration
  if (hasOldWindowKeys(config)) {
    migrateWindow(config);
    migrations.push('window');
  }

  // Authentication migration
  if (hasOldAuthKeys(config)) {
    migrateAuth(config);
    migrations.push('auth');
  }

  // Log what was migrated (user feedback)
  if (migrations.length > 0) {
    console.info(`[Config Migration] Auto-migrated: ${migrations.join(', ')}`);
    console.info('[Config Migration] Your old config still works, but consider updating to new format');
    console.info('[Config Migration] See: https://ismaelmartinez.github.io/teams-for-linux/configuration');
  }

  return config;
}

function hasOldNotificationKeys(config) {
  return 'disableNotifications' in config ||
         'disableNotificationSound' in config ||
         'disableNotificationSoundIfNotAvailable' in config ||
         'disableNotificationWindowFlash' in config;
}

function migrateNotifications(config) {
  // Only auto-migrate if user hasn't set new format
  if (!config.notifications) {
    config.notifications = {
      enabled: true,
      sound: { enabled: true, onlyWhenAvailable: false },
      windowFlash: true,
      method: config.notificationMethod || 'web',
      urgency: config.defaultNotificationUrgency || 'normal'
    };
  }

  // Map old keys to new structure
  if ('disableNotifications' in config) {
    config.notifications.enabled = !config.disableNotifications;
  }

  if ('disableNotificationSound' in config) {
    config.notifications.sound.enabled = !config.disableNotificationSound;
  }

  if ('disableNotificationSoundIfNotAvailable' in config) {
    config.notifications.sound.onlyWhenAvailable = config.disableNotificationSoundIfNotAvailable;
  }

  if ('disableNotificationWindowFlash' in config) {
    config.notifications.windowFlash = !config.disableNotificationWindowFlash;
  }
}

function hasOldWindowKeys(config) {
  return 'frame' in config || 'menubar' in config || 'minimized' in config ||
         'closeAppOnCross' in config || 'alwaysOnTop' in config;
}

function migrateWindow(config) {
  if (!config.window) {
    config.window = {
      frame: config.frame ?? true,
      menubar: config.menubar || 'auto',
      minimized: config.minimized || false,
      closeOnCross: config.closeAppOnCross || false,
      alwaysOnTop: config.alwaysOnTop || false,
      class: config.class || null
    };
  }
}

function hasOldAuthKeys(config) {
  return 'ssoBasicAuthUser' in config || 'ssoInTuneEnabled' in config ||
         'clientCertPath' in config;
}

function migrateAuth(config) {
  if (!config.auth) {
    config.auth = {
      serverWhitelist: config.authServerWhitelist || '*',
      basic: {
        user: config.ssoBasicAuthUser || '',
        passwordCommand: config.ssoBasicAuthPasswordCommand || ''
      },
      intune: {
        enabled: config.ssoInTuneEnabled || false,
        user: config.ssoInTuneAuthUser || ''
      },
      certificate: {
        path: config.clientCertPath || '',
        password: config.clientCertPassword || ''
      }
    };
  }
}

module.exports = { migrateConfig };
```

Then use it in `app/config/index.js`:

```javascript
// app/config/index.js
const { migrateConfig } = require('./migration');

function argv(configPath, appVersion) {
  // ... existing config loading ...

  let config = extractYargConfig(configObject, appVersion);

  // Auto-migrate old config to new structure
  config = migrateConfig(config);

  // ... rest of function ...
}
```

**Cross-Platform Compatibility:**

This approach works seamlessly across all installation methods:
- **Vanilla**: Reads from `~/.config/teams-for-linux/config.json`
- **Snap**: Reads from `~/snap/teams-for-linux/current/.config/teams-for-linux/config.json`
- **Flatpak**: Reads from `~/.var/app/com.github.IsmaelMartinez.teams_for_linux/config/teams-for-linux/config.json`

The migration logic runs **in-memory by default** - it doesn't modify the user's `config.json` file. This means:
- ✅ No write permission issues with snap/flatpak sandboxing
- ✅ User's original config.json remains untouched
- ✅ Migration happens transparently every time the app starts
- ✅ Users can update to new format at their own pace
- ✅ Works the same way on all platforms

**Optional: Auto-Fix Config File with User Consent**

To accelerate deprecation of old keys, the migration module can optionally offer to update the user's `config.json` file:

```javascript
// app/config/migration.js - Extended version

const fs = require('fs');
const path = require('path');

function migrateConfig(config, configPath) {
  const migrations = [];

  // ... perform in-memory migrations ...

  // Offer to write migrated config back to disk
  if (migrations.length > 0 && shouldOfferAutoFix(configPath)) {
    promptUserForAutoFix(config, configPath, migrations);
  }

  return config;
}

function shouldOfferAutoFix(configPath) {
  const autoFixMarkerPath = path.join(configPath, '.config-auto-fix-offered');

  // Only offer once - create marker file after first prompt
  if (fs.existsSync(autoFixMarkerPath)) {
    return false;
  }

  return true;
}

function promptUserForAutoFix(config, configPath, migrations) {
  const { dialog } = require('electron');

  const result = dialog.showMessageBoxSync({
    type: 'question',
    title: 'Config Migration Available',
    message: 'Your config.json uses old format',
    detail: `Teams for Linux can automatically update your config.json to the new format.\n\n` +
            `Areas to migrate: ${migrations.join(', ')}\n\n` +
            `Your current config will be backed up to config.json.backup\n\n` +
            `Choose "Update Now" to migrate automatically, or "Ask Me Later" to continue with in-memory migration.`,
    buttons: ['Update Now', 'Ask Me Later'],
    defaultId: 0,
    cancelId: 1
  });

  const configFilePath = path.join(configPath, 'config.json');
  const markerPath = path.join(configPath, '.config-auto-fix-offered');

  if (result === 0) {
    // User chose "Update Now"
    writeUpdatedConfig(config, configFilePath, migrations);
    fs.writeFileSync(markerPath, new Date().toISOString());
  }
  // result === 1: "Ask Me Later" - don't create marker, will ask next time
}

function writeUpdatedConfig(config, configFilePath, migrations) {
  try {
    // Backup existing config
    const backupPath = configFilePath + '.backup';
    fs.copyFileSync(configFilePath, backupPath);
    console.info(`[Config Migration] Backup created: ${backupPath}`);

    // Build new config with only new keys
    const newConfig = {};

    // Copy over migrated nested structures
    if (migrations.includes('notifications') && config.notifications) {
      newConfig.notifications = config.notifications;
    }
    if (migrations.includes('window') && config.window) {
      newConfig.window = config.window;
    }
    if (migrations.includes('auth') && config.auth) {
      newConfig.auth = config.auth;
    }

    // Copy over other non-migrated options from original config
    const originalConfig = JSON.parse(fs.readFileSync(configFilePath, 'utf8'));
    const migratedOldKeys = getMigratedOldKeys(migrations);

    for (const key in originalConfig) {
      if (!migratedOldKeys.includes(key) && !(key in newConfig)) {
        newConfig[key] = originalConfig[key];
      }
    }

    // Write updated config
    fs.writeFileSync(configFilePath, JSON.stringify(newConfig, null, 2));
    console.info(`[Config Migration] Config file updated successfully`);
    console.info(`[Config Migration] Old keys removed: ${migratedOldKeys.join(', ')}`);

  } catch (error) {
    console.error('[Config Migration] Failed to write updated config:', error.message);
    console.info('[Config Migration] Continuing with in-memory migration');
  }
}

function getMigratedOldKeys(migrations) {
  const oldKeys = [];

  if (migrations.includes('notifications')) {
    oldKeys.push('disableNotifications', 'disableNotificationSound',
                 'disableNotificationSoundIfNotAvailable', 'disableNotificationWindowFlash',
                 'notificationMethod', 'defaultNotificationUrgency');
  }
  if (migrations.includes('window')) {
    oldKeys.push('frame', 'menubar', 'minimized', 'closeAppOnCross', 'alwaysOnTop', 'class');
  }
  if (migrations.includes('auth')) {
    oldKeys.push('authServerWhitelist', 'ssoBasicAuthUser', 'ssoBasicAuthPasswordCommand',
                 'ssoInTuneEnabled', 'ssoInTuneAuthUser', 'clientCertPath', 'clientCertPassword');
  }

  return oldKeys;
}

module.exports = { migrateConfig };
```

**Benefits of Optional Disk Write:**

1. **Faster Deprecation Path**: Old keys can be removed sooner since users are guided to migrate
2. **Reduced Maintenance**: Less code to support legacy options long-term
3. **User Control**: Users explicitly opt-in to file changes
4. **Safe Migration**: Automatic backup before any changes
5. **Encourages Migration**: Two-option dialog (Update Now / Ask Later) guides users toward modern format without being pushy
6. **Works Cross-Platform**: Snap/Flatpak user config directories are writable

**Deprecation Timeline with Auto-Fix:**

- **v2.x (Phase 2a)**: Introduce nested options + in-memory migration + optional auto-fix prompt
  - Users can choose "Update Now" or "Ask Me Later"
  - Old keys still work perfectly via auto-migration

- **v2.x+1 (Phase 2b)**: Mark old keys as deprecated in yargs (shows warnings)
  - Console warnings inform users to migrate
  - Auto-fix prompt continues to appear if old keys detected
  - Everything still works

- **v2.x+2 (Phase 2c)**: After 6+ months, remove old keys from yargs schema
  - Old keys no longer in official schema
  - Migration logic still runs automatically
  - Auto-fix prompt still appears
  - Everything still works

- **v3.0 (Phase 3)**: Automatic migration without prompt
  - Old keys still supported via migration logic (NOT removed!)
  - If old keys detected: **automatically write migrated config** (with backup, no prompt)
  - Show notification: "Your config was automatically updated to v3.0 format. Backup saved to config.json.backup"
  - This ensures zero breakage even for users who never clicked "Update Now"

- **v4.0+ (Future)**: Keep migration logic indefinitely or until usage drops to near-zero
  - Migration module stays in codebase as long as needed
  - Can monitor telemetry/logs to see if anyone still uses old format
  - Only remove migration logic when confident no users affected

**Why This Approach Works:**

✅ **No One Breaks**: Even users who ignore prompts for years still work fine
✅ **Gentle Nudge**: Auto-fix prompt encourages voluntary migration in v2.x
✅ **Automatic Safety Net**: v3.0 migrates automatically for remaining users
✅ **Long-Term Support**: Migration logic stays until truly unnecessary
✅ **User Friendly**: No forced upgrades, no breaking changes

Users who accept the auto-fix prompt early get migrated immediately. Users who click "Ask Me Later" forever still get migrated automatically in v3.0 without breaking.

**New Nested Options:**

```javascript
// Phase 2 additions to yargs config

window: {
  default: {
    frame: true,
    menubar: "auto",
    minimized: false,
    closeOnCross: false,  // Renamed from closeAppOnCross
    alwaysOnTop: false,
    class: null
  },
  describe: "Window behavior configuration",
  type: "object"
}

notifications: {
  default: {
    enabled: true,
    sound: {
      enabled: true,
      onlyWhenAvailable: false
    },
    windowFlash: true,
    method: "web",
    urgency: "normal"
  },
  describe: "Notification system configuration",
  type: "object"
}

incomingCalls: {
  default: {
    toast: false,
    command: null,
    commandArgs: []
  },
  describe: "Incoming call handling configuration",
  type: "object"
}

idleDetection: {
  default: {
    setAwayOnIdle: false,
    timeout: 300,
    checkInterval: {
      idle: 10,
      active: 2
    }
  },
  describe: "Idle detection and away status configuration",
  type: "object"
}

customBackground: {
  default: {
    enabled: false,
    serviceBaseUrl: "http://localhost",
    configFetchInterval: 0
  },
  describe: "Custom virtual background configuration",
  type: "object"
}

appearance: {
  default: {
    cssName: "",
    cssLocation: "",
    followSystemTheme: false
  },
  describe: "UI theming and appearance configuration",
  type: "object"
}

auth: {
  default: {
    serverWhitelist: "*",
    basic: {
      user: "",
      passwordCommand: ""
    },
    intune: {
      enabled: false,
      user: ""
    },
    certificate: {
      path: "",
      password: ""
    }
  },
  describe: "Authentication configuration",
  type: "object"
}
```

**Backward Compatibility:**

Old flat options remain supported with deprecation warnings:
```json
{
  "disableNotifications": false,  // DEPRECATED: Use notifications.enabled
  "closeAppOnCross": false        // DEPRECATED: Use window.closeOnCross
}
```

Auto-migration ensures both work:
```json
// User provides old config
{
  "disableNotifications": true
}

// App uses new config
{
  "notifications": {
    "enabled": false  // Auto-migrated
  }
}
```

**Deliverables:**
- Updated app/config/index.js with nested options
- Migration function with auto-conversion
- Deprecation warnings for old keys
- Updated documentation showing new pattern
- Estimated Effort: 16-24 hours

### Phase 3: Automatic Migration (DEFERRED)

**Status:** ⏸️ DEFERRED - Comprehensive migration not planned

**Original Goal:** Automatically migrate remaining users without breaking their systems

**Changes:**
1. Remove old flat option definitions from yargs schema (cleanup)
2. **Keep migration logic** - it still works automatically
3. **Auto-write migrated config** if old keys detected (no prompt in v3.0)
4. Show notification about automatic migration
5. Update all documentation examples to use new format

**No Breaking Changes:**

Old configs still work via automatic migration:
```json
// OLD FORMAT (still works in v3.0)
{
  "disableNotifications": false,
  "closeAppOnCross": true
}

// AUTOMATICALLY MIGRATED TO:
{
  "notifications": {
    "enabled": true
  },
  "window": {
    "closeOnCross": true
  }
}

// File written to disk automatically with backup created
```

**Auto-Migration Logic (v3.0):**

```javascript
// app/config/migration.js - v3.0 behavior
function migrateConfig(config, configPath) {
  const migrations = [];

  // ... perform in-memory migrations as before ...

  // In v3.0: Automatically write migrated config if old keys detected
  if (migrations.length > 0) {
    console.info(`[Config Migration v3.0] Old config format detected`);
    console.info(`[Config Migration v3.0] Automatically updating to new format...`);

    try {
      const configFilePath = path.join(configPath, 'config.json');
      writeUpdatedConfig(config, configFilePath, migrations);

      // Show user notification (non-blocking)
      const { Notification } = require('electron');
      new Notification({
        title: 'Config Updated',
        body: 'Your config.json was automatically updated to v3.0 format. Backup saved to config.json.backup'
      }).show();

      console.info(`[Config Migration v3.0] Migration complete`);
    } catch (error) {
      console.warn(`[Config Migration v3.0] Could not write to disk: ${error.message}`);
      console.info(`[Config Migration v3.0] In-memory migration successful, app will work normally`);
    }
  }

  return config;
}
```

**Benefits:**
- Zero breakage even for users who never migrated
- Automatic upgrade on first v3.0 launch
- Backup created automatically
- Falls back to in-memory if write fails
- Migration logic preserved for safety

**Edge Cases Handled:**

The automatic migration in v3.0 addresses several edge cases:

1. **Read-only config files**: Falls back to in-memory migration with warning log. App continues to work normally.
   ```javascript
   catch (error) {
     console.warn(`[Config Migration v3.0] Could not write to disk: ${error.message}`);
     console.info(`[Config Migration v3.0] In-memory migration successful, app will work normally`);
   }
   ```

2. **Multiple app instances**: First instance to start will perform file migration. Subsequent instances will see the migrated file.
   - No race condition issues since migration is atomic (backup → write)
   - All instances benefit from migration

3. **Config managed by CM tools** (Ansible, Puppet, Chef):
   - Document migration in release notes
   - Recommend updating CM templates to new format
   - Old format continues working via in-memory migration if CM reverts file

4. **Sandboxed environments** (snap/flatpak):
   - User config directories are writable in snap/flatpak
   - Snap: `~/snap/teams-for-linux/current/.config/teams-for-linux/`
   - Flatpak: `~/.var/app/com.github.IsmaelMartinez.teams_for_linux/config/teams-for-linux/`
   - Backup and migration work correctly in both

5. **Partial migration**: If user manually updated some but not all keys:
   - Migration logic checks if new keys exist before overwriting
   - Only migrates keys that haven't been manually updated
   - User's manual changes take precedence

**Deliverables:**
- Remove old options from yargs schema (cleanup)
- Update migration module for automatic v3.0 behavior
- Add notification on auto-migration
- Update all documentation examples
- Create v3.0 release notes explaining auto-migration
- **Estimated Effort: 4-6 hours** (less than originally planned since migration logic stays)

---

## Implementation Roadmap

### Phase 1: Documentation (2.x - Next Release)

**Week 1:**
- [x] ~~Add MQTT configuration section to docs~~ ✅ **COMPLETED** in PR [#1939](https://github.com/IsmaelMartinez/teams-for-linux/pull/1939)
- [x] ~~Remove deprecated options (contextIsolation/sandbox)~~ ✅ **COMPLETED** (removed from app/config/index.js)
- [ ] Reorganize configuration.md categories

**Testing:**
- Documentation builds without errors
- All existing config.json examples still work
- No code changes, zero risk

**Deliverable:** Updated documentation only

### Phase 2: Nested Structure (DEFERRED)

**Status:** ⏸️ DEFERRED - Comprehensive migration not planned

**Original Week 1-2: Implementation**
- [ ] Add new nested option definitions to yargs
- [ ] Implement auto-migration function
- [ ] Add deprecation warnings for old keys
- [ ] Update AppConfiguration to handle both patterns

**Week 3: Testing**
- [ ] Test auto-migration with various config combinations
- [ ] Verify backward compatibility
- [ ] Update E2E tests to use new format
- [ ] Manual testing across platforms

**Week 4: Documentation**
- [ ] Update all documentation examples to new format
- [ ] Add migration guide with examples
- [ ] Document both old and new patterns during transition

**Deliverable:** Backward-compatible nested config support

### Phase 3: Automatic Migration (3.0 - NO BREAKING CHANGES)

**Planning Phase:**
- [ ] Announce v3.0 automatic migration in release notes
- [ ] Update documentation to show new format as primary
- [ ] Monitor GitHub issues for migration problems

**Implementation Phase:**
- [ ] Update migration logic to automatically write to disk in v3.0
- [ ] Add notification about automatic migration with backup location
- [ ] Remove deprecated flat options from schema
- [ ] **Keep migration logic** (only remove in v4.0+ when usage near-zero)
- [ ] Update all tests/examples to use new format

**Deliverable:** Clean config system with zero breakage via automatic migration

---

## Risk Assessment

### Phase 1 Risks: LOW
- **No code changes** - Documentation only
- **No user impact** - Existing configs work unchanged
- **Mitigation:** N/A - zero risk

### Phase 2 Risks: MEDIUM
- **Auto-migration bugs** - Could break configs
  - *Mitigation:* Extensive test coverage, gradual rollout

- **Confusion during transition** - Two ways to do same thing
  - *Mitigation:* Clear documentation, deprecation warnings

- **Complexity increase** - Migration logic adds code
  - *Mitigation:* Well-tested, isolated module, long-term maintenance burden is low

### Phase 3 Risks: LOW-MEDIUM
- **Automatic migration edge cases** - Some configs might not migrate perfectly
  - *Mitigation:* Extensive testing in v2.x, backup created before migration, user notification

- **File write permissions** - Migration might fail in restricted environments
  - *Mitigation:* Graceful fallback to in-memory migration, clear error messaging

- **Enterprise deployment awareness** - Admins need to know configs will auto-update
  - *Mitigation:* Clear release notes, advance notice, backup preservation

---

## Success Metrics

### Phase 1 Success Criteria
- [x] MQTT configuration documented with examples (completed in PR [#1939](https://github.com/IsmaelMartinez/teams-for-linux/pull/1939))
- [x] Deprecated options removed (completed - contextIsolation, sandbox removed)
- [ ] All 66 options organized into logical categories
- [ ] Zero breaking changes
- [ ] Documentation builds and deploys successfully

### Phase 2 Success Criteria
- [ ] New nested options work correctly
- [ ] Auto-migration handles all edge cases
- [ ] Deprecation warnings guide users to new format
- [ ] 100% backward compatibility maintained
- [ ] E2E tests pass with both old and new config formats

### Phase 3 Success Criteria
- [ ] Automatic migration works across all platforms (vanilla, snap, flatpak)
- [ ] All configs auto-migrate on first v3.0 launch
- [ ] Backups created successfully before migration
- [ ] Clear notification shown to users about auto-migration
- [ ] Zero breaking changes - all existing configs continue working
- [ ] Clean, consistent config structure for new installations
- [ ] No regression in functionality
- [ ] Migration logic kept for long-term compatibility

---

## Alternative Approaches Considered

### Alternative 1: Big Bang Restructure (REJECTED)

**Approach:** Implement all changes in one release with breaking changes.

**Pros:**
- Faster to implement
- Cleaner codebase immediately
- No migration logic needed

**Cons:**
- High risk of breaking user configs
- No graceful upgrade path
- Poor user experience
- Difficult to test all combinations

**Decision:** Rejected due to user impact

### Alternative 2: Status Quo (NOT RECOMMENDED)

**Approach:** Keep current flat structure, only improve documentation.

**Pros:**
- Zero breaking changes ever
- No code changes needed
- Minimal effort

**Cons:**
- Doesn't solve underlying problems
- Config will continue to grow flat
- Harder to add new features cleanly
- Technical debt accumulates

**Decision:** Not recommended - doesn't address core issues

### Alternative 3: New Config Format in Parallel (CONSIDERED)

**Approach:** Support config.v2.json alongside config.json indefinitely.

**Pros:**
- No breaking changes
- Users opt-in to new format
- Both formats work forever

**Cons:**
- Doubles maintenance burden
- Confusing for users (which to use?)
- Code complexity from dual support
- Documentation becomes complex

**Decision:** Not chosen - selected approach provides better transition

---

## References

### Internal Documentation
- [Configuration Options](../../configuration.md) - Current user documentation
- [MQTT Integration](https://github.com/IsmaelMartinez/teams-for-linux/blob/develop/app/mqtt/README.md) - MQTT module documentation
- Architecture Modernization Research (removed — DDD approach rejected, incremental refactoring adopted)

### Code References
- `app/config/index.js` - Main configuration loader (yargs definitions)
- `app/appConfiguration/index.js` - AppConfiguration wrapper class
- `docs-site/docs/configuration.md` - User-facing documentation

### Related Issues
- Configuration improvements investigation (current)
- MQTT integration: [#1926](https://github.com/IsmaelMartinez/teams-for-linux/pull/1926), [#1931](https://github.com/IsmaelMartinez/teams-for-linux/pull/1931)
- MQTT documentation: [#1939](https://github.com/IsmaelMartinez/teams-for-linux/pull/1939) ✅ **MERGED**
- System-wide config: [#1773](https://github.com/IsmaelMartinez/teams-for-linux/issues/1773)

### External References
- [Yargs Configuration](https://yargs.js.org/docs/#api-reference-configobject) - Config file handling
- [Semantic Versioning](https://semver.org/) - Breaking change guidance
- [Electron App Configuration Best Practices](https://www.electronjs.org/docs/latest/api/app#appgetpathname)

---

## Appendix: Complete Option Mapping

### Proposed New Structure

```javascript
{
  // Core
  "app": {
    "title": "Microsoft Teams",
    "url": "https://teams.cloud.microsoft",
    "partition": "persist:teams-4-linux"
  },

  // Window
  "window": {
    "frame": true,
    "menubar": "auto",
    "minimized": false,
    "closeOnCross": false,
    "alwaysOnTop": false,
    "class": null
  },

  // Appearance
  "appearance": {
    "cssName": "",
    "cssLocation": "",
    "followSystemTheme": false
  },

  // Tray
  "tray": {
    "enabled": true,
    "icon": "",
    "iconType": "default",
    "useMutationTitleLogic": true
  },

  // Notifications
  "notifications": {
    "enabled": true,
    "sound": {
      "enabled": true,
      "onlyWhenAvailable": false
    },
    "windowFlash": true,
    "method": "web",
    "urgency": "normal"
  },

  // Incoming Calls
  "incomingCalls": {
    "toast": false,
    "command": null,
    "commandArgs": []
  },

  // Idle Detection
  "idleDetection": {
    "setAwayOnIdle": false,
    "timeout": 300,
    "checkInterval": {
      "idle": 10,
      "active": 2
    }
  },

  // Authentication
  "auth": {
    "serverWhitelist": "*",
    "basic": {
      "user": "",
      "passwordCommand": ""
    },
    "intune": {
      "enabled": false,
      "user": ""
    },
    "certificate": {
      "path": "",
      "password": ""
    },
    "customCACertsFingerprints": []
  },

  // Network
  "network": {
    "proxyServer": null
  },

  // Screen Sharing
  "screenSharing": {
    "thumbnail": {
      "enabled": true,
      "alwaysOnTop": true
    },
    "lockInhibitionMethod": "Electron"
  },

  // Media
  "media": {
    "disableAutogain": false,
    "videoMenu": false
  },

  // Custom Background
  "customBackground": {
    "enabled": false,
    "serviceBaseUrl": "http://localhost",
    "configFetchInterval": 0
  },

  // URL Handling
  "urlHandling": {
    "defaultHandler": "",
    "meetupJoinRegEx": "^https://teams\\.(?:microsoft|live)\\.com/...",
    "msTeamsProtocols": {
      "v1": "^msteams:/l/...",
      "v2": "^msteams://teams.cloud.(?:microsoft.com|cloud.microsoft)/l/..."
    },
    "openMeetupJoinInApp": true
  },

  // Shortcuts
  "shortcuts": {
    "global": [],
    "disableWhileFocused": []
  },

  // MQTT
  "mqtt": {
    "enabled": false,
    "brokerUrl": "",
    "username": "",
    "password": "",
    "clientId": "teams-for-linux",
    "topicPrefix": "teams",
    "statusTopic": "status",
    "statusCheckInterval": 10000
  },

  // Performance
  "performance": {
    "disableGpu": false,
    "electronCLIFlags": []
  },

  // Cache & Storage
  "storage": {
    "cacheManagement": {
      "enabled": false,
      "maxCacheSizeMB": 600,
      "cacheCheckIntervalMs": 3600000
    },
    "clearStorageData": null
  },

  // Development
  "development": {
    "webDebug": false,
    "logConfig": {
      "transports": {
        "console": { "level": "info" },
        "file": { "level": false }
      }
    },
    "watchConfigFile": false
  },

  // Platform
  "platform": {
    "chromeUserAgent": "Mozilla/5.0...",
    "emulateWinChromiumPlatform": false,
    "spellCheckerLanguages": [],
    "disableTimestampOnCopy": false
  },

  "wayland": {
    "xwaylandOptimizations": false
  }
}
```

### Migration Mapping Table

| Old Flat Key | New Nested Key | Notes |
|--------------|----------------|-------|
| `appTitle` | `app.title` | Moved |
| `url` | `app.url` | Moved |
| `partition` | `app.partition` | Moved |
| `frame` | `window.frame` | Moved |
| `menubar` | `window.menubar` | Moved |
| `minimized` | `window.minimized` | Moved |
| `closeAppOnCross` | `window.closeOnCross` | Renamed + moved |
| `alwaysOnTop` | `window.alwaysOnTop` | Clarified scope |
| `class` | `window.class` | Moved |
| `customCSSName` | `appearance.cssName` | Renamed + moved |
| `customCSSLocation` | `appearance.cssLocation` | Renamed + moved |
| `followSystemTheme` | `appearance.followSystemTheme` | Moved |
| `trayIconEnabled` | `tray.enabled` | Renamed + moved |
| `appIcon` | `tray.icon` | Renamed + moved |
| `appIconType` | `tray.iconType` | Renamed + moved |
| `useMutationTitleLogic` | `tray.useMutationTitleLogic` | Moved |
| `disableNotifications` | `notifications.enabled` | Inverted + moved |
| `disableNotificationSound` | `notifications.sound.enabled` | Inverted + moved |
| `disableNotificationSoundIfNotAvailable` | `notifications.sound.onlyWhenAvailable` | Renamed + moved |
| `disableNotificationWindowFlash` | `notifications.windowFlash` | Inverted + moved |
| `notificationMethod` | `notifications.method` | Moved |
| `defaultNotificationUrgency` | `notifications.urgency` | Renamed + moved |
| `enableIncomingCallToast` | `incomingCalls.toast` | Renamed + moved |
| `incomingCallCommand` | `incomingCalls.command` | Renamed + moved |
| `incomingCallCommandArgs` | `incomingCalls.commandArgs` | Renamed + moved |
| `awayOnSystemIdle` | `idleDetection.setAwayOnIdle` | Renamed + moved |
| `appIdleTimeout` | `idleDetection.timeout` | Renamed + moved |
| `appIdleTimeoutCheckInterval` | `idleDetection.checkInterval.idle` | Renamed + moved |
| `appActiveCheckInterval` | `idleDetection.checkInterval.active` | Renamed + moved |
| `authServerWhitelist` | `auth.serverWhitelist` | Moved |
| `ssoBasicAuthUser` | `auth.basic.user` | Renamed + moved |
| `ssoBasicAuthPasswordCommand` | `auth.basic.passwordCommand` | Renamed + moved |
| `ssoInTuneEnabled` | `auth.intune.enabled` | Renamed + moved |
| `ssoInTuneAuthUser` | `auth.intune.user` | Renamed + moved |
| `clientCertPath` | `auth.certificate.path` | Moved |
| `clientCertPassword` | `auth.certificate.password` | Moved |
| `customCACertsFingerprints` | `auth.customCACertsFingerprints` | Moved |
| `proxyServer` | `network.proxyServer` | Moved |
| `screenSharingThumbnail` | `screenSharing.thumbnail` | Moved |
| `screenLockInhibitionMethod` | `screenSharing.lockInhibitionMethod` | Renamed + moved |
| `disableAutogain` | `media.disableAutogain` | Moved |
| `videoMenu` | `media.videoMenu` | Moved |
| `isCustomBackgroundEnabled` | `customBackground.enabled` | Renamed + moved |
| `customBGServiceBaseUrl` | `customBackground.serviceBaseUrl` | Renamed + moved |
| `customBGServiceConfigFetchInterval` | `customBackground.configFetchInterval` | Renamed + moved |
| `defaultURLHandler` | `urlHandling.defaultHandler` | Renamed + moved |
| `meetupJoinRegEx` | `urlHandling.meetupJoinRegEx` | Moved |
| `msTeamsProtocols` | `urlHandling.msTeamsProtocols` | Moved |
| `onNewWindowOpenMeetupJoinUrlInApp` | `urlHandling.openMeetupJoinInApp` | Renamed + moved |
| `globalShortcuts` | `shortcuts.global` | Moved |
| `disableGlobalShortcuts` | `shortcuts.disableWhileFocused` | Renamed + moved |
| `mqtt` | `mqtt` | Already nested |
| `disableGpu` | `performance.disableGpu` | Moved |
| `electronCLIFlags` | `performance.electronCLIFlags` | Moved |
| `cacheManagement` | `storage.cacheManagement` | Moved |
| `clearStorageData` | `storage.clearStorageData` | Moved |
| `webDebug` | `development.webDebug` | Moved |
| `logConfig` | `development.logConfig` | Moved |
| `watchConfigFile` | `development.watchConfigFile` | Moved |
| `chromeUserAgent` | `platform.chromeUserAgent` | Moved |
| `emulateWinChromiumPlatform` | `platform.emulateWinChromiumPlatform` | Moved |
| `spellCheckerLanguages` | `platform.spellCheckerLanguages` | Moved |
| `disableTimestampOnCopy` | `platform.disableTimestampOnCopy` | Moved |
| `contextIsolation` | *REMOVED* | Deprecated, always enabled |
| `sandbox` | *REMOVED* | Deprecated, always enabled |

---

## Conclusion

**Decision (2026-01-18):** The comprehensive three-phase migration approach has been **deferred in favor of incremental evolution**.

**Rationale:**
- Complexity of auto-migration doesn't justify the benefits
- New features already use nested configuration patterns successfully
- Existing flat options work fine and can migrate opportunistically
- Avoids risk of breaking existing user configurations

**Current Approach:**
1. ✅ **Phase 1 Complete** - Documentation improvements delivered
2. ⏸️ **Phases 2-3 Deferred** - No coordinated migration effort
3. ✅ **New features** - Use nested patterns from day one (e.g., `mqtt`, `graphApi`, `customNotification`)
4. 📋 **Future** - Migrate existing options only when refactoring those modules

### Implementation Status

Since this research was completed, several improvements have been implemented:

- [x] MQTT documentation added in PR [#1939](https://github.com/IsmaelMartinez/teams-for-linux/pull/1939)
- [x] Deprecated options (`contextIsolation`, `sandbox`) removed from configuration
- [x] Custom notification system added in PR [#1979](https://github.com/IsmaelMartinez/teams-for-linux/pull/1979) with new `customNotification` object config
- [x] Graph API integration added in PR [#1958](https://github.com/IsmaelMartinez/teams-for-linux/pull/1958) with new `graphApi` object config
- [x] MQTT commands feature implemented in PR [#1986](https://github.com/IsmaelMartinez/teams-for-linux/pull/1986) - bidirectional MQTT support with `commandTopic`
- [x] Badge count control added with `disableBadgeCount` option in PR [#1994](https://github.com/IsmaelMartinez/teams-for-linux/pull/1994)
- [x] Documentation reorganization (Issue [#2120](https://github.com/IsmaelMartinez/teams-for-linux/issues/2120))

### Migrated Options (Already Using Nested Structure)

The following flat options have been migrated to nested structures and are now deprecated:

| Deprecated Option | New Nested Option | Status |
|-------------------|-------------------|--------|
| `screenSharingThumbnail` | `screenSharing.thumbnail` | ✅ Migrated, deprecated warning active |
| `screenLockInhibitionMethod` | `screenSharing.lockInhibitionMethod` | ✅ Migrated, deprecated warning active |
| `disableAutogain` | `media.microphone.disableAutogain` | ✅ Migrated, deprecated warning active |
| `videoMenu` | `media.video.menuEnabled` | ✅ Migrated, deprecated warning active |
| `ssoInTuneEnabled` | `auth.intune.enabled` | ✅ Migrated, deprecated warning active |
| `ssoInTuneAuthUser` | `auth.intune.user` | ✅ Migrated, deprecated warning active |

**New Nested Configuration Objects (Added from the start):**

These features were added with nested configuration from day one:

| Configuration Object | Options | Added In |
|---------------------|---------|----------|
| `mqtt` | `enabled`, `brokerUrl`, `username`, `password`, `clientId`, `topicPrefix`, `statusTopic`, `commandTopic`, `statusCheckInterval` | PR #1926, #1931, #1986 |
| `graphApi` | `enabled` | PR #1958 |
| `customNotification` | `toastDuration` | PR #1979 |
| `media` | `microphone.disableAutogain`, `camera.resolution.*`, `camera.autoAdjustAspectRatio.*`, `video.menuEnabled` | Incremental |
| `screenSharing` | `thumbnail.enabled`, `thumbnail.alwaysOnTop`, `lockInhibitionMethod` | Incremental |
| `auth` | `intune.enabled`, `intune.user` | Incremental |
| `cacheManagement` | `enabled`, `maxCacheSizeMB`, `cacheCheckIntervalMs` | Original |
| `logConfig` | `transports.console.level`, `transports.file.level` | Original |
| `msTeamsProtocols` | `v1`, `v2` | Original |

**Legacy Backward Compatibility:**

All deprecated flat options continue to work via automatic mapping in the application code. Users are shown deprecation warnings at startup when using old options, guiding them to migrate to the new nested format.

The nested configuration structure will:
- Make related options easier to discover and configure
- Provide a clear pattern for future features
- Reduce config file clutter
- Improve maintainability for developers
- Create better user experience with logical grouping

**Next Steps:**
1. Create GitHub issue for Phase 1 completion (documentation reorganization)
2. Update docs-site/docs/configuration.md with reorganized categories
3. Plan Phase 2 implementation for future release

**Future Considerations (Beyond Phase 3):**
- **Sensitive Data Security**: Move sensitive configuration (e.g., `clientCertPassword`, MQTT credentials) outside of config.json and implement encryption
  - Separate secure storage for credentials
  - Integration with system keyring/secret service
  - Clear separation between settings and secrets
