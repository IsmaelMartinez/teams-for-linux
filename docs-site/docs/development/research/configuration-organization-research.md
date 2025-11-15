# Configuration Organization Research

**Issue**: Configuration improvements and cleanup investigation
**Created**: 2025-11-09
**Status**: Research Complete

## Executive Summary

### Current State
Teams for Linux has **53 distinct configuration options** managed through a flat yargs-based configuration system. While functional, the current organization has several issues: related options are scattered across documentation categories, deprecated options still clutter the config, and naming conventions are inconsistent.

**Note**: MQTT documentation was added in PR [#1939](https://github.com/IsmaelMartinez/teams-for-linux/pull/1939) after this research began, addressing one of the initial findings.

### Key Findings

1. **~~Missing Documentation~~ ✅ RESOLVED**: MQTT configuration documentation was added in PR [#1939](https://github.com/IsmaelMartinez/teams-for-linux/pull/1939), including configuration reference and integration guide.

2. **Poor Grouping**: Related options controlling single features are scattered:
   - Idle detection (4 options) spread across categories
   - Notification system (9 options) split between categories
   - Window behavior (7 options) scattered across Core, Advanced, and Screen Sharing sections
   - SSO options use inconsistent naming patterns

3. **Technical Debt**: Two deprecated options (`contextIsolation`, `sandbox`) still accept values with warnings instead of being removed.

4. **Structural Inconsistency**: Mix of flat options and nested objects without clear pattern:
   - Good: `mqtt`, `cacheManagement`, `screenSharingThumbnail` (nested)
   - Bad: `customBGServiceBaseUrl`, `customBGServiceConfigFetchInterval` (should be nested)

5. **Naming Issues**: Mix of negative (`disableNotifications`) and positive (`trayIconEnabled`) naming, plus some overly verbose names.

### Recommended Approach
**Three-Phase Gradual Migration** with backward compatibility:

**Phase 1 (v2.x)**: Documentation reorganization + ~~MQTT docs~~ ✅ + deprecation of old flat keys
**Phase 2 (v2.x)**: Introduce nested structure with auto-migration
**Phase 3 (v3.0)**: Remove deprecated flat keys (breaking change)

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
- All 53 options defined in single 484-line yargs config block
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

**Undocumented (1 option)**
```javascript
mqtt  // Exists in code, missing from docs
```

**Deprecated (2 options)**
```javascript
contextIsolation, sandbox  // Should be removed
```

### Problem Analysis

#### ~~Problem 1: Missing MQTT Documentation~~ ✅ RESOLVED

**Status**: Fixed in PR [#1939](https://github.com/IsmaelMartinez/teams-for-linux/pull/1939) (merged after research began)

**Solution Implemented:**
- Added MQTT section to docs-site/docs/configuration.md with configuration reference table
- Created comprehensive docs-site/docs/mqtt-integration.md guide
- Includes examples for Home Assistant integration
- Added to documentation navigation sidebar
- Users can now discover and configure the MQTT feature

**Original Issue** (now resolved):
```javascript
// app/config/index.js:468-481
mqtt: {
  default: {
    enabled: false,
    brokerUrl: "",
    username: "",
    password: "",
    clientId: "teams-for-linux",
    topicPrefix: "teams",
    statusTopic: "status",
    statusCheckInterval: 10000,
  },
  describe: "MQTT configuration for publishing Teams status updates",
  type: "object",
}
```

This feature was in code but undocumented, making it impossible for users to discover.

#### Problem 2: Scattered Related Options

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

#### Problem 3: Deprecated Options Still Present

**Evidence:**
```javascript
// app/config/index.js:185-192
contextIsolation: {
  default: true,
  deprecated: "Enabled by default and not configurable anymore. Please remove it from your configuration",
  describe: "Use contextIsolation on the main BrowserWindow (WIP - Disabling this will break most functionality)",
  type: "boolean",
}

// app/config/index.js:388-395
sandbox: {
  default: true,
  deprecated: "Enabled by default and not configurable anymore. Please remove it from your configuration",
  describe: "Sandbox for the BrowserWindow (WIP - disabling this might break some functionality)",
  type: "boolean",
}
```

**Issues:**
- Options still accept values (though they're ignored)
- Warnings logged but value not rejected
- Clutters config, confuses users
- No migration path documented

**Recommendation:**
- Phase 1: Document migration (just remove from config.json)
- Phase 2: Add explicit error if present
- Phase 3 (v3.0): Remove entirely

#### Problem 4: Naming Inconsistencies

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

#### Problem 5: Flat vs Nested Structure

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
  v2: "^msteams://teams.microsoft.com/l/(?:meetup-join|channel|chat|message)"
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
1. ~~Add MQTT to configuration.md~~ ✅ **COMPLETED** in PR [#1939](https://github.com/IsmaelMartinez/teams-for-linux/pull/1939)
2. Reorganize documentation categories
3. Document deprecated options
4. Add migration guide section

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

### MQTT Integration ✅ DOCUMENTED
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

### Deprecated Options
- contextIsolation (remove from config)
- sandbox (remove from config)
```

**Deliverables:**
- Updated docs-site/docs/configuration.md
- ~~New MQTT configuration section with examples~~ ✅ **COMPLETED** in PR [#1939](https://github.com/IsmaelMartinez/teams-for-linux/pull/1939)
- Deprecated options migration guide
- **Remaining Effort: 2-4 hours** (reduced from 4-6 hours due to MQTT completion)

### Phase 2: Introduce Nested Structure (v2.x) - Backward Compatible

**Goal:** Add new nested options while maintaining backward compatibility

**Implementation Strategy:**

1. **Add new nested options in parallel** with old flat options
2. **Auto-migration logic** in config loader
3. **Deprecation warnings** for old keys
4. **Documentation** shows new pattern, mentions old for reference

**Example Migration Logic:**

```javascript
// In app/config/index.js - after yargs parsing

function migrateConfig(config) {
  const warnings = [];

  // Migrate notifications
  if ('disableNotifications' in config) {
    warnings.push('disableNotifications is deprecated, use notifications.enabled instead');
    if (!config.notifications) config.notifications = {};
    config.notifications.enabled = !config.disableNotifications;
  }

  if ('disableNotificationSound' in config) {
    warnings.push('disableNotificationSound is deprecated, use notifications.sound.enabled');
    if (!config.notifications) config.notifications = {};
    if (!config.notifications.sound) config.notifications.sound = {};
    config.notifications.sound.enabled = !config.disableNotificationSound;
  }

  // ... more migrations

  // Log all warnings
  warnings.forEach(w => console.warn(`[Config Migration] ${w}`));

  return config;
}
```

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

### Phase 3: Remove Deprecated Options (v3.0) - BREAKING CHANGE

**Goal:** Clean up codebase by removing old flat options

**Changes:**
1. Remove all deprecated flat option definitions from yargs
2. Remove migration logic
3. Add validation to error on old keys
4. Update all examples/tests to use new structure

**Breaking Changes:**

Users must update their config.json:
```json
// OLD (will error in v3.0)
{
  "disableNotifications": false,
  "closeAppOnCross": true
}

// NEW (required in v3.0)
{
  "notifications": {
    "enabled": true
  },
  "window": {
    "closeOnCross": true
  }
}
```

**Validation:**

```javascript
// Error on old keys
function validateConfig(config) {
  const deprecatedKeys = [
    'disableNotifications',
    'disableNotificationSound',
    'closeAppOnCross',
    // ... all old keys
  ];

  const foundDeprecated = Object.keys(config).filter(k =>
    deprecatedKeys.includes(k)
  );

  if (foundDeprecated.length > 0) {
    throw new Error(
      `Deprecated config keys found: ${foundDeprecated.join(', ')}\n` +
      `Please migrate to v3.0 config format. See migration guide: ` +
      `https://ismaelmartinez.github.io/teams-for-linux/configuration#migration-to-v3`
    );
  }
}
```

**Deliverables:**
- Remove deprecated options from app/config/index.js
- Remove migration logic
- Add strict validation
- Create v3.0 migration guide
- Update all documentation examples
- Estimated Effort: 8-12 hours

---

## Implementation Roadmap

### Phase 1: Documentation (2.x - Next Release)

**Week 1:**
- [x] ~~Add MQTT configuration section to docs~~ ✅ **COMPLETED** in PR [#1939](https://github.com/IsmaelMartinez/teams-for-linux/pull/1939)
- [ ] Reorganize configuration.md categories
- [ ] Add deprecation section for contextIsolation/sandbox
- [ ] Create initial migration guide

**Testing:**
- Documentation builds without errors
- All existing config.json examples still work
- No code changes, zero risk

**Deliverable:** Updated documentation only

### Phase 2: Nested Structure (2.x+1)

**Week 1-2: Implementation**
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

### Phase 3: Breaking Changes (3.0)

**Planning Phase:**
- [ ] Announce v3.0 breaking changes in release notes
- [ ] Give users 2-3 releases to migrate (6+ months)
- [ ] Monitor GitHub issues for migration problems

**Implementation Phase:**
- [ ] Remove deprecated flat options
- [ ] Remove migration logic
- [ ] Add strict validation
- [ ] Update all tests/examples

**Deliverable:** Clean config system with consistent structure

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
  - *Mitigation:* Well-tested, temporary (removed in v3.0)

### Phase 3 Risks: MEDIUM-HIGH
- **Breaking change impact** - Users must update configs
  - *Mitigation:* Long deprecation period, auto-migration in v2.x, clear migration guide

- **Enterprise deployment issues** - System-wide configs need updating
  - *Mitigation:* Advanced notice, documentation for admins

---

## Success Metrics

### Phase 1 Success Criteria
- [x] ~~MQTT configuration documented with examples~~ ✅ **COMPLETED** in PR [#1939](https://github.com/IsmaelMartinez/teams-for-linux/pull/1939)
- [ ] All 53 options organized into logical categories
- [ ] Zero breaking changes
- [ ] Documentation builds and deploys successfully

### Phase 2 Success Criteria
- [ ] New nested options work correctly
- [ ] Auto-migration handles all edge cases
- [ ] Deprecation warnings guide users to new format
- [ ] 100% backward compatibility maintained
- [ ] E2E tests pass with both old and new config formats

### Phase 3 Success Criteria
- [ ] All deprecated options removed
- [ ] Clean, consistent config structure
- [ ] Migration guide complete with examples
- [ ] No regression in functionality
- [ ] Positive community feedback on organization

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
- [Architecture Modernization Research](./architecture-modernization-research.md) - Related refactoring work

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
    "url": "https://teams.microsoft.com/v2",
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
      "v2": "^msteams://teams.microsoft.com/l/..."
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

The proposed three-phase approach provides a balanced path forward:

1. **Phase 1** delivers immediate value (better docs, ~~MQTT~~ ✅) with zero risk
2. **Phase 2** introduces modern structure while maintaining compatibility
3. **Phase 3** completes the transformation after users have time to migrate

**Phase 1 Status Update**: MQTT documentation (one of the main Phase 1 deliverables) was completed in PR [#1939](https://github.com/IsmaelMartinez/teams-for-linux/pull/1939). Remaining Phase 1 work includes documentation reorganization and deprecated option migration guide.

This research recommends **proceeding with remaining Phase 1 tasks** (low effort, high value, zero risk) and planning Phase 2 for a future release cycle.

The nested configuration structure will:
- Make related options easier to discover and configure
- Provide a clear pattern for future features
- Reduce config file clutter
- Improve maintainability for developers
- Create better user experience with logical grouping

**Next Steps:**
1. ~~Review and approve this research document~~ ✅
2. Create GitHub issue for remaining Phase 1 implementation
3. Update docs-site/docs/configuration.md with reorganized categories
4. ~~Add MQTT configuration documentation~~ ✅ **COMPLETED**
5. Document deprecated options migration path
6. Plan Phase 2 for future release
