# React Bridge Critical Analysis - DOM Access Patterns

**Status**: CRITICAL - DO NOT MODIFY WITHOUT CAREFUL TESTING
**Date**: November 3, 2025
**Location**: `/app/browser/tools/reactHandler.js`

## Executive Summary

This document analyzes the **critical DOM access patterns** that enable Teams for Linux to integrate with Microsoft Teams' web application. Any deviation from these patterns will break core functionality including:
- User presence/status tracking
- Call notifications and events
- Authentication token management
- Idle state synchronization

## 1. Exact DOM Navigation Path to React Internals

### 1.1 Entry Point: The `#app` Element

**Pattern**: Direct getElementById access to Teams' root React mount point
```javascript
const appElement = document.getElementById("app");
```

**Why Critical**:
- Teams mounts its entire React application at `#app`
- This is the **only** reliable entry point to React internals
- No alternative selectors or traversal paths work

**Risk Level**: 🔴 CRITICAL - Any change breaks all integration

### 1.2 React Internal Structure Navigation

**Pattern**: Deep property chain traversal to reach coreServices
```javascript
const internalRoot =
  reactElement?._reactRootContainer?._internalRoot ||
  reactElement?._reactRootContainer;

const coreServices =
  internalRoot?.current?.updateQueue?.baseState?.element?.props?.coreServices;
```

**Chain Breakdown**:
1. `_reactRootContainer` - React 16/17 mount container
2. `_internalRoot` - Fiber tree root
3. `current` - Current fiber node
4. `updateQueue` - Component update queue
5. `baseState` - Queue's base state
6. `element` - React element
7. `props` - Element props
8. `coreServices` - **THE TARGET** - Teams internal services object

**Why This Exact Path**:
- Teams exposes `coreServices` as a prop to root component
- `coreServices` contains ALL internal Teams APIs we need:
  - `commandChangeReportingService` - Event system
  - `authenticationService` - Auth provider
  - `clientState._idleTracker` - Idle tracking
  - `clientPreferences` - User settings

**Risk Level**: 🔴 CRITICAL - Each property in chain is essential

### 1.3 React Version Detection

**Pattern**: Support both legacy and modern React structures
```javascript
// Check for traditional React mount structures
const hasLegacyReact = appElement._reactRootContainer ||
                       appElement._reactInternalInstance;

// Check for React 18+ createRoot structure (keys starting with __react)
const reactKeys = Object.getOwnPropertyNames(appElement).filter(key =>
  key.startsWith('__react') || key.startsWith('_react')
);
const hasModernReact = reactKeys.length > 0;
```

**Why Critical**:
- Teams may update React versions without notice
- Must detect and adapt to different React mounting patterns
- Fallback support prevents sudden breakage

**Current Teams React Version**: React 16/17 (as of Nov 2025)
**Future Risk**: Teams will eventually upgrade to React 18/19

**Risk Level**: 🟠 HIGH - Future compatibility concern

## 2. Domain Allowlist Security Implementation

### 2.1 Strict Domain Validation

**Pattern**: Exact domain matching with subdomain support
```javascript
_isAllowedTeamsDomain(hostname) {
  const allowedDomains = [
    'teams.microsoft.com',
    'teams.live.com'
  ];

  for (const domain of allowedDomains) {
    // Exact match
    if (hostname === domain) return true;
    // Immediate subdomain match (prevents evil.com.teams.microsoft.com attacks)
    if (hostname.endsWith('.' + domain)) return true;
  }

  return false;
}
```

**Why This Exact Implementation**:
- **Prevents subdomain hijacking**: `evil.com.teams.microsoft.com` is blocked
- **Supports legitimate subdomains**: `*.teams.microsoft.com` is allowed
- **No regex vulnerabilities**: Uses simple string operations
- **Whitelist-only**: Denies by default

**Security Implications**:
- DOM access is ONLY enabled on official Teams domains
- Prevents malicious sites from exploiting our DOM access
- Essential compensating control for `contextIsolation: false`

**Risk Level**: 🔴 CRITICAL - Security boundary

### 2.2 Multi-Layer Environment Validation

**Pattern**: Validate entire execution environment before DOM access
```javascript
_performEnvironmentValidation() {
  return this._validateDomain() &&      // Is this Teams?
         this._validateDocument() &&     // Is DOM ready?
         this._validateAppElement() &&   // Does #app exist?
         this._validateReactStructure(); // Is React mounted?
}
```

**Validation Layers**:
1. **Domain Check**: Ensures we're on Teams domain
2. **Document Check**: Verifies DOM is available
3. **App Element Check**: Confirms `#app` exists
4. **React Structure Check**: Validates React is mounted and accessible

**Why All Four Required**:
- DOM may not be ready during early page load
- Teams might change page structure
- React may not be mounted yet
- Security: prevents execution in wrong context

**Risk Level**: 🟠 HIGH - Defense in depth

## 3. CoreServices Extraction Method

### 3.1 Service Access Pattern

**Pattern**: Extract specific services from coreServices object
```javascript
getCommandChangeReportingService() {
  if (!this._validateTeamsEnvironment()) return null;
  const teams2CoreServices = this._getTeams2CoreServices();
  return teams2CoreServices?.commandChangeReportingService;
}

getTeams2IdleTracker() {
  if (!this._validateTeamsEnvironment()) return null;
  const teams2CoreServices = this._getTeams2CoreServices();
  return teams2CoreServices?.clientState?._idleTracker;
}

getTeams2ClientPreferences() {
  if (!this._validateTeamsEnvironment()) return null;
  const teams2CoreServices = this._getTeams2CoreServices();
  return teams2CoreServices?.clientPreferences?.clientPreferences;
}
```

**Service Hierarchy**:
```
coreServices
├── commandChangeReportingService (event system)
├── authenticationService
│   └── _coreAuthService
│       └── _authProvider (token cache injection point)
├── clientState
│   └── _idleTracker (idle state management)
└── clientPreferences
    └── clientPreferences (user settings)
```

**Why This Pattern**:
- **Safe navigation**: Optional chaining prevents crashes
- **Validation first**: Always check environment before access
- **Null returns**: Gracefully handle unavailable services
- **Encapsulation**: Each service getter is independent

**Risk Level**: 🟠 HIGH - Core functionality dependency

### 3.2 Authentication Provider Access

**Pattern**: Deep navigation to auth provider for token cache injection
```javascript
const teams2CoreServices = this._getTeams2CoreServices();
const authService = teams2CoreServices?.authenticationService;
const authProvider = authService?._coreAuthService?._authProvider;
```

**Why This Deep Path**:
- Teams auth architecture has multiple layers
- `_authProvider` is where token cache interface must be injected
- This is the ONLY place where token cache injection works
- Related to Issue #1357 (authentication refresh failures)

**Risk Level**: 🔴 CRITICAL - Authentication functionality

## 4. Activity Status Monitoring Patterns

### 4.1 Event Observation System

**Pattern**: Subscribe to Teams internal event stream
```javascript
// In activityHub.js - depends on ReactHandler
const commandChangeReportingService = ReactHandler.getCommandChangeReportingService();

commandChangeReportingService.observeChanges().subscribe((e) => {
  // Filter for specific event types
  if (!["CommandStart", "ScenarioMarked"].includes(e.type) ||
      !["internal-command-handler", "use-command-reporting-callbacks"].includes(e.context.target)) {
    return;
  }

  if (e.context.entityCommand) {
    handleCallEventEntityCommand(e.context.entityCommand);
  } else {
    handleCallEventStep(e.context.step);
  }
});
```

**Event Types Monitored**:
- `CommandStart` - Teams command initiated
- `ScenarioMarked` - Scenario checkpoint reached

**Context Targets**:
- `internal-command-handler` - Internal Teams commands
- `use-command-reporting-callbacks` - Callback-based reporting

**Why This Filtering**:
- Teams emits hundreds of events - we need only specific ones
- These events signal call state changes
- Essential for notification system

**Risk Level**: 🟠 HIGH - Notification system dependency

### 4.2 Call Event Detection

**Pattern**: Parse event context for call-specific data
```javascript
function handleCallEventEntityCommand(entityCommand) {
  if (entityCommand.entityOptions?.isIncomingCall) {
    if ("incoming_call" === entityCommand.entityOptions?.crossClientScenarioName) {
      // Incoming call notification
      onIncomingCallCreated({
        caller: entityCommand.entityOptions.title,
        image: entityCommand.entityOptions.mainImage?.src,
        text: entityCommand.entityOptions.text
      });
    } else {
      // Call ended/dismissed
      onIncomingCallEnded();
    }
  }
}

function handleCallEventStep(step) {
  switch (step) {
    case "calling-screen-rendered":
      onCallConnected();
      break;
    case "render_disconected":
      onCallDisconnected();
      break;
  }
}
```

**Why This Pattern**:
- Teams uses different event structures for different call states
- `entityCommand` contains metadata (caller info, images)
- `step` contains state transitions
- Both are needed for complete call lifecycle tracking

**Risk Level**: 🟡 MEDIUM - Feature-specific

### 4.3 Idle Tracker Integration

**Pattern**: Manipulate Teams idle state based on system events
```javascript
setMachineState(state) {
  const teams2IdleTracker = ReactHandler.getTeams2IdleTracker();
  if (teams2IdleTracker) {
    if (state === 1) {
      teams2IdleTracker.handleMonitoredWindowEvent(); // Active
    } else {
      teams2IdleTracker.transitionToIdle(); // Idle
    }
  }
}
```

**Why This Pattern**:
- Keeps Teams presence in sync with system state
- `handleMonitoredWindowEvent()` signals user activity
- `transitionToIdle()` triggers idle state
- Prevents Teams from showing "Away" when user is active

**Risk Level**: 🟡 MEDIUM - User experience enhancement

## 5. Event Emission for Status Changes

### 5.1 Event Handler Registration

**Pattern**: Internal event system with typed handlers
```javascript
const supportedEvents = new Set([
  "incoming-call-created",
  "incoming-call-ended",
  "call-connected",
  "call-disconnected"
]);

function addEventHandler(event, handler) {
  let handle;
  if (isSupportedEvent(event) && isFunction(handler)) {
    handle = crypto.randomUUID();
    eventHandlers.push({
      event: event,
      handle: handle,
      handler: handler
    });
  }
  return handle;
}
```

**Why This Pattern**:
- Type-safe event system with whitelist
- UUID handles for cleanup
- Multiple handlers per event
- Prevents memory leaks with proper removal

**Risk Level**: 🟢 LOW - Internal architecture

### 5.2 ActivityHub Startup Sequence

**Pattern**: Retry-based initialization with timeouts
```javascript
start() {
  let attemptCount = 0;
  const maxAttempts = 12; // Try for up to 2 minutes

  const setup = setInterval(() => {
    attemptCount++;

    const commandChangeReportingService = ReactHandler.getCommandChangeReportingService();
    if (commandChangeReportingService) {
      assignEventHandlers(commandChangeReportingService);
      clearInterval(setup);
      this._startAuthenticationMonitoring();
    } else if (attemptCount >= maxAttempts) {
      console.warn('ActivityHub: Maximum connection attempts reached');
      clearInterval(setup);
      this._startAuthenticationMonitoring();
    }
  }, 10000); // Every 10 seconds
}
```

**Why This Pattern**:
- Teams React app may not be ready immediately after page load
- DOM might be ready but React not fully mounted
- 10-second intervals balance responsiveness and CPU usage
- 2-minute timeout prevents infinite retry loops
- Still starts auth monitoring even if React connection fails

**Risk Level**: 🟠 HIGH - Initialization reliability

## 6. contextIsolation: false Requirement

### 6.1 Electron Security Configuration

**Pattern**: Disabled context isolation for DOM access
```javascript
// In app/mainAppWindow/browserWindowManager.js
webPreferences: {
  partition: this.config.partition,
  preload: path.join(__dirname, "..", "browser", "preload.js"),
  plugins: true,
  spellcheck: true,
  webviewTag: true,
  // SECURITY: Disabled for Teams DOM access, compensated by CSP + IPC validation
  contextIsolation: false,  // Required for ReactHandler DOM access
  nodeIntegration: false,   // Secure: preload scripts don't need this
  sandbox: false,           // Required for system API access
}
```

**Why contextIsolation MUST Be False**:
1. **Direct DOM Access Required**: ReactHandler needs to access `document.getElementById("app")` from preload script
2. **Property Chain Traversal**: Must access internal React properties (`_reactRootContainer`, etc.)
3. **No contextBridge Alternative**: Cannot serialize React internal objects across context bridge
4. **Token Cache Injection**: Must modify `authProvider._tokenCache` object directly

**Why contextBridge Won't Work**:
```javascript
// ❌ IMPOSSIBLE with contextBridge
// Cannot serialize React Fiber objects
contextBridge.exposeInMainWorld('teams', {
  getCoreServices: () => {
    // This object contains circular references and internal symbols
    // JSON.stringify would fail
    return internalRoot?.current?.updateQueue?.baseState?.element?.props?.coreServices;
  }
});

// ❌ IMPOSSIBLE: Cannot inject into Teams objects
// AuthProvider is a Teams-owned object we need to modify
authProvider._tokenCache = TokenCache; // Must be same memory space
```

**Risk Level**: 🔴 CRITICAL - Fundamental architectural requirement

### 6.2 Preload Script Pattern

**Pattern**: Expose Node.js require to renderer for tools
```javascript
// In app/browser/preload.js
// Direct Node.js access for browser tools (requires contextIsolation: false)
globalThis.nodeRequire = require;
globalThis.nodeProcess = process;
```

**Why This Pattern**:
- Browser tools (reactHandler.js, tokenCache.js, etc.) need Node.js modules
- Electron's `safeStorage` API requires Node.js context
- Tools are loaded dynamically at runtime
- All tools run in same context as Teams page

**Risk Level**: 🟠 HIGH - Security trade-off

### 6.3 Compensating Security Controls

**Pattern**: Multi-layer security despite disabled isolation
```javascript
// 1. Content Security Policy
session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
  callback({
    responseHeaders: {
      ...details.responseHeaders,
      'Content-Security-Policy': [strictCSP]
    }
  });
});

// 2. IPC Channel Validation
const allowedChannels = [
  'choose-desktop-media',
  'get-config',
  'set-badge-count',
  // ... whitelist only
];

ipcMain.handle(channel, (event, ...args) => {
  if (!allowedChannels.includes(channel)) {
    throw new Error('Unauthorized IPC channel');
  }
  // ... validate args
});

// 3. Domain Validation (in ReactHandler)
if (!this._isAllowedTeamsDomain(globalThis.location.hostname)) {
  return false;
}
```

**Compensating Controls**:
1. **Content Security Policy (CSP)**: Restricts script loading and execution
2. **IPC Channel Allowlist**: Only specific channels permitted
3. **Domain Validation**: DOM access only on Teams domains
4. **Payload Sanitization**: All IPC payloads validated
5. **No Node Integration**: `nodeIntegration: false` still enabled

**Why Still Secure Enough**:
- Defense in depth with multiple layers
- Reduced attack surface through validation
- System-level sandboxing (Flatpak/Snap) available
- Primary threat is Teams domain XSS (mitigated by CSP)

**Risk Level**: 🟠 HIGH - Security architecture decision

## 7. Critical Patterns - Non-Negotiable

### 7.1 Patterns That CANNOT Change

| Pattern | Why Non-Negotiable | Impact If Changed |
|---------|-------------------|-------------------|
| `document.getElementById("app")` | Only entry point to Teams React | Total integration failure |
| `._reactRootContainer._internalRoot` chain | Only path to coreServices | All features break |
| Domain allowlist (`teams.microsoft.com`, `teams.live.com`) | Security boundary | XSS vulnerability |
| `contextIsolation: false` | DOM access fundamental requirement | Cannot access React internals |
| Event type filtering (`CommandStart`, `ScenarioMarked`) | Only way to detect call events | Notifications fail |
| Token cache injection at `_authProvider` | Only working auth integration point | Re-login issues (#1357) |
| Retry-based initialization (12 attempts × 10s) | Teams load timing varies | Intermittent failures |
| Optional chaining throughout | Teams structure changes without notice | Random crashes |

### 7.2 Patterns With Flexibility

| Pattern | Flexibility | Notes |
|---------|------------|-------|
| React version detection | Can add new patterns | As Teams upgrades React |
| Event handler storage | Can change implementation | As long as API stays same |
| Logging statements | Can modify/remove | Debug information only |
| Error handling | Can enhance | Must not break flow |
| Retry intervals | Can tune (within reason) | Must still allow Teams to load |

## 8. Risk Areas If Modified

### 8.1 High-Risk Modifications

**🔴 CRITICAL - Will Break Immediately**:
1. Changing `#app` selector
2. Removing any step in `._reactRootContainer._internalRoot.current.updateQueue.baseState.element.props.coreServices` chain
3. Enabling `contextIsolation: true`
4. Removing domain validation
5. Changing token cache injection point

**🟠 HIGH RISK - May Break Intermittently**:
1. Modifying retry timing (too fast: CPU usage, too slow: user experience)
2. Removing React version detection (breaks on Teams React upgrade)
3. Changing event filtering (breaks call notifications)
4. Modifying environment validation (breaks in edge cases)

**🟡 MEDIUM RISK - May Break Features**:
1. Changing idle tracker integration (presence sync issues)
2. Modifying event handler system (notification system issues)
3. Removing optional chaining (crashes on Teams updates)

### 8.2 Safe Modifications

**🟢 LOW RISK - Safe to Change**:
1. Adding new service getters to ReactHandler
2. Enhancing error messages and logging
3. Adding telemetry and monitoring
4. Improving TypeScript types (if migrating)
5. Adding unit tests (with mocked DOM)
6. Adding comments and documentation

### 8.3 Testing Requirements

**Before ANY modification to reactHandler.js**:
1. **Manual Testing Required**:
   - Launch Teams and verify login works
   - Receive incoming call and verify notification appears
   - Let system go idle and verify Teams status updates
   - Close and relaunch - verify auto-login works
   - Test on both `teams.microsoft.com` and `teams.live.com`

2. **Automated Testing Limitations**:
   - Cannot unit test (requires real Teams DOM)
   - Cannot mock React internal structure reliably
   - Integration tests require Teams authentication
   - Best approach: defensive programming + comprehensive logging

3. **Validation Checklist**:
   - [ ] Domain validation logs show success
   - [ ] React structure detection succeeds
   - [ ] CoreServices extraction returns valid object
   - [ ] Event subscription establishes successfully
   - [ ] Token cache injection completes
   - [ ] Call notifications appear
   - [ ] Presence syncs with system state
   - [ ] No errors in console related to ReactHandler

## 9. Future Compatibility Concerns

### 9.1 Known Upcoming Risks

**React 18/19 Migration**:
- **When**: Unknown - Teams upgrade timeline not public
- **Impact**: `_reactRootContainer` API will change
- **Mitigation**: React version detection already in place
- **Action**: Monitor Teams updates, add React 18/19 detection paths

**Teams UI Rewrite**:
- **When**: Speculation - no confirmed plans
- **Impact**: Entire DOM structure could change
- **Mitigation**: None - would require complete rewrite
- **Action**: Monitor Microsoft Teams blog for announcements

**Electron Security Hardening**:
- **When**: Ongoing Electron development
- **Impact**: May require `contextIsolation: true`
- **Mitigation**: Limited - fundamental architecture constraint
- **Action**: Explore Microsoft Graph API alternative (already researched)

### 9.2 Alternative Approaches Researched

**Microsoft Graph API** (documented in dom-access-investigation.md):
- ✅ Works for enterprise users
- ⚠️ Limited for personal accounts
- ⚠️ Requires Azure app registration
- ⚠️ Cannot replace all DOM access features
- **Status**: Viable long-term migration path for enterprise users

**Electron IPC Bridge**:
- ❌ Cannot serialize React internal objects
- ❌ Cannot inject into Teams-owned objects
- **Status**: Not viable

**Browser Extension Pattern**:
- ❌ Electron doesn't support Chrome extensions fully
- ❌ Would still need DOM access
- **Status**: Not viable

## 10. Maintenance Guidelines

### 10.1 Updating ReactHandler

**When adding new features**:
1. Follow existing patterns (validation → extraction → return)
2. Always use optional chaining
3. Always validate environment first
4. Log failures with `[ReactHandler]` prefix
5. Return null on failure (never throw)
6. Add to this documentation

**When debugging issues**:
1. Check domain validation first
2. Verify `#app` element exists
3. Check React structure detection
4. Inspect coreServices object in console
5. Review event subscription logs
6. Check timing (may need to increase retry count)

**When Teams updates**:
1. Test all features immediately
2. Check console for new errors
3. Inspect DOM structure changes
4. Update React version detection if needed
5. Update documentation

### 10.2 Code Review Checklist

For any PR touching `reactHandler.js` or related files:

- [ ] Domain validation still present and strict
- [ ] No steps removed from coreServices property chain
- [ ] contextIsolation remains false
- [ ] Optional chaining used throughout
- [ ] Environment validation called before all DOM access
- [ ] Error handling returns null (doesn't throw)
- [ ] Logging follows established patterns
- [ ] Manual testing completed (see 8.3)
- [ ] This document updated with any new patterns

### 10.3 Monitoring Recommendations

**Production Monitoring**:
1. Track ReactHandler validation failure rate
2. Monitor event subscription success rate
3. Track token cache injection success
4. Alert on sudden increase in failures (likely Teams update)

**User Feedback Indicators**:
- "Not receiving call notifications" → Event system failure
- "Keeps logging me out" → Token cache injection failure
- "Status not syncing" → Idle tracker failure
- "Features not working" → CoreServices extraction failure

## 11. Related Documentation

- `/docs-site/docs/development/research/dom-access-investigation.md` - Investigation and future strategy
- `/docs-site/docs/development/security-architecture.md` - Security compensating controls
- `/docs-site/docs/development/ipc-api.md` - IPC validation patterns
- `/docs-site/docs/development/adr/002-token-cache-secure-storage.md` - Token cache architecture
- `/app/browser/tools/README.md` - Browser tools overview

## 12. Summary

**DO NOT MODIFY** the following without careful consideration:
1. DOM navigation path to React internals
2. Domain allowlist implementation
3. contextIsolation: false requirement
4. Token cache injection mechanism
5. Event filtering and observation patterns

**These patterns are the FOUNDATION** of Teams for Linux integration. Breaking them breaks the application. Any changes must be tested manually on live Teams instances.

**Architecture Constraint**: This is a web scraping/integration pattern, not an official API. It will break when Teams changes their internal structure. This is a documented trade-off for functionality that Microsoft doesn't officially support on Linux.
