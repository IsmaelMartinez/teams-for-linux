# GitHub Issues to Create

Based on the Development Priorities Report, here are the issue templates ready to be created in the GitHub repository.

---

## Issue 1: MQTT Extended Status - Camera/Mic/Call State Monitoring

**Title:** Implement MQTT Extended Status: Camera/Mic/Call State Monitoring

**Labels:** `enhancement`, `mqtt`, `ready-for-implementation`

**Milestone:** Next Release

**Related Issues:** #1938

**Description:**

### Summary

Add three additional MQTT status fields to enable home automation integration (RGB LED status indicators, presence systems, etc.):
- Camera on/off state
- Microphone on/off state
- Active call state

### User Request

User **vbartik** in #1938 requested these fields for RGB LED automation to show actual device state rather than just presence status (which shows "busy" even for scheduled meetings not yet joined).

### Background

Current MQTT integration only publishes presence status (`teams/status`). This issue implements extended status monitoring using:
- **Existing IPC channels** for call state (`call-connected`, `call-disconnected`)
- **WebRTC stream monitoring** for camera/microphone state (stable Web APIs)

### Research Complete

Full investigation documented in `docs-site/docs/development/research/mqtt-extended-status-investigation.md` including:
- Architecture design (service pattern following `CustomNotificationManager`)
- WebRTC monitoring implementation approach
- Hybrid track monitoring (events + polling for `track.enabled`)
- Screen sharing stream detection
- Configuration schema (semantic categories)

### Implementation Plan

**Phase 1: Core Infrastructure** (~3-5 days)
1. Add generic `publish()` method to `app/mqtt/index.js`
2. Create `app/mqtt/mediaStatusService.js` following service pattern
3. Add IPC channel allowlist entries (`camera-state-changed`, `microphone-state-changed`)
4. Initialize service in `app/index.js`
5. Add configuration schema for semantic categories

**Phase 2: WebRTC Monitoring** (~3-5 days)
1. Create `app/browser/tools/mediaStatus.js`
2. Implement `getUserMedia()` interceptor (pattern from `disableAutogain.js`)
3. Add screen sharing detection (reuse `isScreenShare` logic from `injectedScreenSharing.js`)
4. Implement hybrid track monitoring:
   - Event listeners (`mute`, `unmute`, `ended`)
   - Poll `track.enabled` property (500ms interval)
   - Cleanup intervals on track end

**Phase 3: Documentation & Testing** (~1-2 days)
1. Run `npm run generate-ipc-docs` to update auto-generated docs
2. Test with UI buttons AND keyboard shortcuts
3. Test call connect/disconnect state
4. Test camera/mic toggle state
5. Document Home Assistant integration examples

### Configuration

```json
{
  "mqtt": {
    "enabled": true,
    "topicPrefix": "teams",

    "camera": {
      "enabled": true,
      "topic": "camera"
    },

    "microphone": {
      "enabled": true,
      "topic": "microphone"
    },

    "call": {
      "enabled": true,
      "topic": "in-call"
    }
  }
}
```

### MQTT Topics

- `teams/camera` → `"true"` / `"false"`
- `teams/microphone` → `"true"` / `"false"`
- `teams/in-call` → `"true"` / `"false"`

### Example Home Assistant Integration

```yaml
automation:
  - alias: "RGB LED - Teams Camera On"
    trigger:
      platform: mqtt
      topic: "teams/camera"
      payload: "true"
    action:
      service: light.turn_on
      target:
        entity_id: light.office_led
      data:
        rgb_color: [255, 0, 0]  # Red LED when camera on
```

### Estimated Effort

**Total:** 1-2 weeks (~60 lines of core logic, following established patterns)

- Implementation: 1-1.5 weeks
- Testing: 2-3 days
- Documentation: 1 day

### Risk Assessment

**Low Risk:**
- Uses stable WebRTC Web APIs (`MediaStreamTrack`, `getUserMedia`)
- Follows proven service pattern (`CustomNotificationManager`, `ScreenSharingService`)
- Leverages existing IPC channels for call state
- Isolated changes, no modifications to critical code paths
- Screen sharing stream detection reuses battle-tested logic from `injectedScreenSharing.js`

### References

- **Research Document:** `docs-site/docs/development/research/mqtt-extended-status-investigation.md`
- **Related Research:** `mqtt-commands-implementation.md` (bidirectional MQTT)
- **Existing Patterns:**
  - `app/mqtt/index.js` - MQTT client
  - `app/notificationSystem/index.js` - Service pattern
  - `app/browser/tools/disableAutogain.js` - getUserMedia interception
  - `app/screenSharing/injectedScreenSharing.js` - Screen sharing detection
  - `app/screenSharing/service.js` - IPC channels (`screen-sharing-started/stopped`)

### Success Criteria

- [ ] Camera state accurately reflects Teams camera on/off
- [ ] Microphone state accurately reflects Teams mic on/off
- [ ] Call state accurately reflects active call status
- [ ] MQTT messages published with correct timing (no lag > 1s)
- [ ] Configuration allows independent enable/disable of each category
- [ ] Works with UI buttons, keyboard shortcuts, and programmatic toggles
- [ ] Zero performance regression during calls
- [ ] Documentation includes Home Assistant examples

---

## Issue 2: Calendar Data Export via MQTT Command

**Title:** Add Calendar Data Export via MQTT Command

**Labels:** `enhancement`, `mqtt`, `graph-api`, `ready-for-implementation`

**Milestone:** Next Release

**Related Issues:** #1995, #1832

**Description:**

### Summary

Expose Teams calendar data via MQTT command to enable external processing (org-mode conversion, custom dashboards, etc.) without requiring separate authentication scripts.

### User Request

User requested in #1995 the ability to access calendar data for org-mode integration. Current workaround requires separate 2FA authentication that expires daily. Since users already log into Teams for Linux daily, the app can expose calendar data using existing authentication.

### Background

- **Graph API infrastructure exists** (Phase 1 complete in #1832)
- **MQTT infrastructure exists** (commands implemented)
- Calendar endpoints already functional:
  - `graph-api-get-calendar-events`
  - `graph-api-get-calendar-view`

User can already access calendar data via IPC, this issue adds MQTT command interface for external scripting.

### Architecture: Event-Driven, Minimal Internal Logic

**Philosophy:** Teams for Linux should only expose data, NOT process it.

**What Teams for Linux does:**
- ✅ React to `get-calendar` MQTT command
- ✅ Fetch from Graph API
- ✅ Publish raw JSON to `teams/calendar` topic

**What Teams for Linux does NOT do:**
- ❌ Format conversion (org-mode, CSV, etc.)
- ❌ Internal scheduling/polling
- ❌ Complex data transformation
- ❌ File management

**User handles:** All formatting, scheduling, and processing externally.

### Implementation

**Estimated Effort:** 2-3 hours (~20 lines of code)

**Changes Required:**

Extend existing `mqttClient` command handler in `app/index.js`:

```javascript
// In app/index.js - Extend existing mqttClient 'command' event listener
mqttClient.on('command', async (command) => {
  // ... existing command handlers (toggle-mute, toggle-video, etc.)

  if (command.action === 'get-calendar') {
    // Validate parameters
    const { startDate, endDate } = command;
    if (!startDate || !endDate) {
      console.error('[MQTT] get-calendar requires startDate and endDate');
      return;
    }

    // Fetch from Graph API
    const result = await graphApiClient.getCalendarView(startDate, endDate);

    // Publish raw Graph API JSON to dedicated topic
    if (result.success) {
      mqttClient.publish('teams/calendar', JSON.stringify(result));
    } else {
      console.error('[MQTT] Failed to get calendar:', result.error);
    }
  }
});
```

### User Workflow

**1. User sends MQTT command:**
```bash
mosquitto_pub -h localhost -t teams/command -m '{
  "action": "get-calendar",
  "startDate": "2025-11-27T00:00:00Z",
  "endDate": "2025-12-04T23:59:59Z"
}'
```

**2. Teams publishes calendar data:**
Teams publishes raw Graph API JSON to `teams/calendar` topic.

**3. User subscribes and processes:**
```bash
# Subscribe and pipe to external processor
mosquitto_sub -h localhost -t teams/calendar -C 1 | python3 ~/to_orgmode.py > calendar.org
```

**4. User schedules with cron:**
```bash
#!/bin/bash
# ~/.local/bin/fetch-teams-calendar.sh
START_DATE=$(date -I)
END_DATE=$(date -I -d "+7 days")
mosquitto_pub -h localhost -t teams/command -m "{
  \"action\":\"get-calendar\",
  \"startDate\":\"${START_DATE}T00:00:00Z\",
  \"endDate\":\"${END_DATE}T23:59:59Z\"
}"

# Wait and process
sleep 1
mosquitto_sub -h localhost -t teams/calendar -C 1 | python3 ~/to_orgmode.py > ~/calendar.org

# Crontab entry: 0 6 * * * /home/user/.local/bin/fetch-teams-calendar.sh
```

### Data Format

Return exactly what Graph API returns (see Microsoft Graph Calendar API docs):

```json
{
  "success": true,
  "data": {
    "value": [
      {
        "id": "AAMkAGI1...",
        "subject": "Team Standup",
        "start": {
          "dateTime": "2025-11-27T10:00:00.0000000",
          "timeZone": "UTC"
        },
        "end": {
          "dateTime": "2025-11-27T10:30:00.0000000",
          "timeZone": "UTC"
        },
        "location": {
          "displayName": "Teams Meeting"
        },
        "organizer": {
          "emailAddress": {
            "name": "John Doe",
            "address": "john@example.com"
          }
        },
        "attendees": [...],
        "bodyPreview": "Meeting description...",
        "onlineMeeting": {
          "joinUrl": "https://teams.microsoft.com/l/meetup/..."
        }
      }
    ]
  }
}
```

User converts externally with their own script.

### Implementation Steps

1. Add `get-calendar` command handler to existing MQTT command event listener
2. Validate command parameters (`startDate`, `endDate`)
3. Fetch from Graph API using `graphApiClient.getCalendarView()`
4. Publish raw JSON to `teams/calendar` topic
5. Document MQTT workflow in MQTT integration docs
6. Provide example scripts (Python converter to org-mode, shell script for cron)

### Risk Assessment

**Low Risk:**
- ✅ Minimal code changes (~20 lines)
- ✅ Uses existing Graph API client (battle-tested)
- ✅ Uses existing MQTT infrastructure
- ✅ No complex logic
- ✅ User controls everything externally

### Constraints

**Why NOT CLI command approach:**
Per ADR-006, CLI action commands (e.g., `teams-for-linux --get-calendar`) conflict with meeting URL positional arguments and would require fragile pre-parsing with high risk of breaking existing functionality.

MQTT command approach:
- ✅ Follows established pattern (toggle-mute, toggle-video, etc.)
- ✅ Integrates with home automation
- ✅ Event-driven (no internal scheduling)
- ✅ Zero interference with CLI arguments

### References

- **Research Document:** `docs-site/docs/development/research/calendar-data-export-research.md`
- **Related:**
  - `graph-api-integration-research.md` - Graph API infrastructure
  - `mqtt-commands-implementation.md` - MQTT command pattern
  - ADR-006 - Why CLI commands rejected
- **Existing Code:**
  - `app/graphApi/index.js` - GraphApiClient
  - `app/graphApi/ipcHandlers.js` - Calendar IPC channels
  - `app/mqtt/index.js` - MQTT client

### Success Criteria

- [ ] User can retrieve calendar data as JSON via MQTT command
- [ ] Data includes all Graph API fields (subject, start, end, location, attendees, etc.)
- [ ] User can process output with external tools (Python, shell scripts)
- [ ] No internal formatting/transformation logic
- [ ] No internal scheduling (user controls when to fetch)
- [ ] Documentation includes complete workflow with example scripts
- [ ] Works with MQTT broker (localhost Mosquitto or Home Assistant)

---

## Issue 3: Expand E2E Test Coverage with Playwright

**Title:** Automated Testing: Expand E2E Test Coverage

**Labels:** `testing`, `infrastructure`, `good-first-issue`

**Milestone:** Next Release

**Related Issues:** None (new initiative)

**Description:**

### Summary

Expand end-to-end test coverage using Playwright to cover core application workflows and prevent regressions.

### Background

**Current State:**
- Basic smoke test exists: `tests/e2e/smoke.spec.js` (app launch)
- Research complete: `automated-testing-strategy.md` recommends Playwright + Vitest

**Why Now:**
- Project adding more features (MQTT extended status, calendar export, etc.)
- Risk of regressions increasing
- Testing strategy research complete with clear framework selection
- Low barrier to entry (30-minute quick start documented)

### Research Complete

Full testing strategy documented in `docs-site/docs/development/research/automated-testing-strategy.md`:
- **Framework:** Playwright for E2E, Vitest for unit/integration
- **Authentication:** Storage state reuse pattern for Microsoft login
- **Cross-platform:** GitHub Actions matrix (Linux, macOS, Windows)
- **Incremental migration:** Phase 1 (Foundation), Phase 2 (Core), Phase 3 (Advanced)

### Scope for This Issue

**Phase 1: Foundation (E2E)**
Expand Playwright E2E tests to cover:

1. **App Launch Flow**
   - ✅ App launches successfully (existing smoke test)
   - [ ] App window appears
   - [ ] App loads Teams URL

2. **Authentication Flow**
   - [ ] Microsoft login page appears
   - [ ] Authentication storage state setup (one-time manual login)
   - [ ] Subsequent tests reuse auth state (fast execution)

3. **Core Window Management**
   - [ ] Window minimize/restore
   - [ ] Window close behavior (`closeAppOnCross` config)
   - [ ] Tray icon appears (if enabled)

4. **Configuration Loading**
   - [ ] Config file loaded correctly
   - [ ] CLI arguments override config
   - [ ] Default values applied when no config

5. **IPC Communication**
   - [ ] IPC channels registered correctly
   - [ ] IPC security validation works
   - [ ] Invalid channels rejected

### Implementation Plan

**Week 1-2: Test Development**
1. Set up authentication storage state (see research doc for pattern)
2. Create test suite structure:
   ```
   tests/e2e/
   ├── auth.setup.js          # One-time authentication
   ├── app-launch.spec.js     # App launch tests
   ├── authentication.spec.js  # Auth flow tests
   ├── window-management.spec.js # Window behavior
   ├── configuration.spec.js   # Config loading
   └── ipc-communication.spec.js # IPC tests
   ```
3. Write tests for each area (5-10 tests per file)
4. Configure Playwright to use auth storage state

**Week 2: Integration**
1. Update `playwright.config.js` with:
   - Storage state configuration
   - Test dependencies (`auth.setup.js` runs first)
   - Timeout configurations
2. Add npm scripts:
   - `npm run test:e2e` - Run all E2E tests
   - `npm run test:e2e:headed` - Run with UI visible
3. Document how to run tests locally

**Week 3: CI/CD** (separate issue, can be done later)
- Set up GitHub Actions workflow
- Cross-platform testing matrix
- Store auth credentials as secrets

### Example Test

```javascript
// tests/e2e/window-management.spec.js
import { test, expect } from '@playwright/test';
import { _electron as electron } from 'playwright';

test('window minimizes and restores', async () => {
  const electronApp = await electron.launch({ args: ['./app/index.js'] });
  const window = await electronApp.firstWindow();

  // Minimize window
  await window.evaluate(() => {
    require('electron').remote.getCurrentWindow().minimize();
  });

  // Check window is minimized
  const isMinimized = await window.evaluate(() => {
    return require('electron').remote.getCurrentWindow().isMinimized();
  });
  expect(isMinimized).toBe(true);

  // Restore window
  await window.evaluate(() => {
    require('electron').remote.getCurrentWindow().restore();
  });

  const isRestored = await window.evaluate(() => {
    return !require('electron').remote.getCurrentWindow().isMinimized();
  });
  expect(isRestored).toBe(true);

  await electronApp.close();
});
```

### Estimated Effort

**Total:** 1-2 weeks for Phase 1 (E2E Foundation)

- Test suite development: 1 week
- Authentication setup: 2-3 days
- CI/CD integration: 2-3 days (separate issue)

### Risk Assessment

**Low Risk:**
- Playwright officially recommended by Electron team
- Research complete with proven patterns
- Does not block development (runs in CI)
- Can start small and expand coverage over time

### Success Criteria

- [ ] E2E tests cover app launch, authentication, window management, config loading, IPC
- [ ] Authentication storage state working (fast test execution)
- [ ] Tests pass consistently on local development machines
- [ ] Documentation for running tests locally
- [ ] Test execution time < 5 minutes for full E2E suite
- [ ] Zero flaky tests (tests must be deterministic)

### References

- **Research Document:** `docs-site/docs/development/research/automated-testing-strategy.md`
- **Existing Test:** `tests/e2e/smoke.spec.js`
- **Framework Docs:**
  - [Playwright Electron API](https://playwright.dev/docs/api/class-electron)
  - [Electron Testing Guide](https://www.electronjs.org/docs/latest/tutorial/automated-testing)

---

## Issue 4: Add Unit Tests for Core Modules with Vitest

**Title:** Automated Testing: Add Unit Tests for Core Modules

**Labels:** `testing`, `infrastructure`

**Milestone:** Next Release

**Related Issues:** None (new initiative)

**Description:**

### Summary

Add unit and integration tests for critical modules using Vitest to improve code quality and prevent regressions.

### Background

**Current State:**
- No unit tests exist
- Research complete: `automated-testing-strategy.md` recommends Vitest for unit/integration

**Why Vitest:**
- Modern architecture built on Vite (faster startup and execution)
- Native ESM support
- Jest-compatible API (easy learning curve)
- Better TypeScript support out of the box
- Active development

### Scope for This Issue

**Phase 1: Critical Modules**

1. **Configuration System** (`app/config/`, `app/appConfiguration/`)
   - Config file loading
   - Config merging (system → user → CLI → defaults)
   - Config validation
   - Environment variable support

2. **IPC Security** (`app/security/ipcValidator.js`)
   - Channel allowlist validation
   - Payload sanitization
   - Security boundary enforcement

3. **MQTT Client** (`app/mqtt/index.js`)
   - Connection handling
   - Message publishing
   - Topic formatting
   - Error handling

4. **Graph API Client** (`app/graphApi/index.js`)
   - Token acquisition
   - API request formatting
   - Error handling
   - Response parsing

5. **Module Initialization** (select critical modules)
   - Service pattern classes
   - Error handling in constructors
   - Configuration handling

### Implementation Plan

**Week 1: Setup**
1. Install Vitest: `npm install --save-dev vitest`
2. Create `vitest.config.js`:
   ```javascript
   import { defineConfig } from 'vitest/config';

   export default defineConfig({
     test: {
       globals: true,
       environment: 'node',
       coverage: {
         provider: 'v8',
         reporter: ['text', 'json', 'html'],
         exclude: ['tests/**', 'docs-site/**']
       }
     }
   });
   ```
3. Add npm scripts:
   - `npm run test:unit` - Run unit tests
   - `npm run test:unit:watch` - Watch mode
   - `npm run test:unit:coverage` - Coverage report

**Week 2-3: Test Development**

Create test files alongside source files:
```
app/
├── config/
│   ├── index.js
│   └── index.test.js          # NEW
├── security/
│   ├── ipcValidator.js
│   └── ipcValidator.test.js   # NEW
├── mqtt/
│   ├── index.js
│   └── index.test.js          # NEW
└── graphApi/
    ├── index.js
    └── index.test.js          # NEW
```

**Week 3-4: Integration**
1. Achieve >50% coverage of critical modules
2. Add unit tests to CI/CD pipeline
3. Document testing patterns for contributors
4. Create testing guide in docs

### Example Test

```javascript
// app/security/ipcValidator.test.js
import { describe, it, expect } from 'vitest';
import { validateIpcChannel } from './ipcValidator.js';

describe('IPC Security Validator', () => {
  describe('Channel Allowlist', () => {
    it('should allow whitelisted channels', () => {
      expect(validateIpcChannel('get-config', null)).toBe(true);
      expect(validateIpcChannel('get-zoom-level', null)).toBe(true);
      expect(validateIpcChannel('graph-api-get-user-profile', null)).toBe(true);
    });

    it('should reject non-whitelisted channels', () => {
      expect(validateIpcChannel('malicious-channel', null)).toBe(false);
      expect(validateIpcChannel('', null)).toBe(false);
      expect(validateIpcChannel(null, null)).toBe(false);
    });
  });

  describe('Payload Sanitization', () => {
    it('should reject prototype pollution attempts', () => {
      const maliciousPayload = JSON.parse('{"__proto__": {"admin": true}}');
      expect(validateIpcChannel('get-config', maliciousPayload)).toBe(false);
    });

    it('should allow clean payloads', () => {
      const cleanPayload = { option: 'value' };
      expect(validateIpcChannel('get-config', cleanPayload)).toBe(true);
    });
  });
});
```

### Coverage Targets

**Initial Target:** >50% coverage for critical modules

**Priority Modules:**
1. IPC security validation: >80% coverage (security-critical)
2. Configuration system: >70% coverage (touches everything)
3. MQTT client: >60% coverage (external integration)
4. Graph API client: >60% coverage (external integration)

### Mocking Strategy

**External Dependencies:**
- Mock Electron APIs (`app`, `ipcMain`, `BrowserWindow`)
- Mock MQTT broker connections
- Mock Graph API HTTP responses
- Mock file system for config tests

**Use Vitest mocking:**
```javascript
import { vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/mock/path'),
    isReady: vi.fn(() => true)
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn()
  }
}));
```

### Estimated Effort

**Total:** 1-2 weeks

- Vitest setup: 1 day
- Configuration tests: 2-3 days
- IPC security tests: 2 days
- MQTT tests: 2 days
- Graph API tests: 2 days
- Documentation: 1 day

### Risk Assessment

**Low Risk:**
- Tests don't affect production code
- Can run in parallel with feature development
- Vitest is modern, well-supported
- Jest-compatible API (easy transition if needed)

### Success Criteria

- [ ] Vitest configured and working
- [ ] Unit tests cover configuration system (>70% coverage)
- [ ] Unit tests cover IPC security (>80% coverage)
- [ ] Unit tests cover MQTT client (>60% coverage)
- [ ] Unit tests cover Graph API client (>60% coverage)
- [ ] Tests run in CI/CD pipeline
- [ ] Testing documentation for contributors
- [ ] Test execution time < 2 minutes for unit suite

### References

- **Research Document:** `docs-site/docs/development/research/automated-testing-strategy.md`
- **Framework Docs:**
  - [Vitest Documentation](https://vitest.dev/)
  - [Vitest Mocking Guide](https://vitest.dev/guide/mocking.html)
- **Coverage Tool:** [Vitest Coverage](https://vitest.dev/guide/coverage.html)

---

## Summary

**4 Issues Ready to Create:**
1. MQTT Extended Status (1-2 weeks, high impact)
2. Calendar Data Export (2-3 hours, high user value)
3. Expand E2E Tests (1-2 weeks, quality foundation)
4. Add Unit Tests (1-2 weeks, quality foundation)

**Total Effort:** 4-7 weeks for complete Tier 1 implementation

**Recommended Order:**
1. Calendar Data Export (quick win, 2-3 hours)
2. MQTT Extended Status (complete MQTT feature set, 1-2 weeks)
3. E2E Tests + Unit Tests (parallel, 2-3 weeks combined)

Copy each issue template above into GitHub to create the issues.
