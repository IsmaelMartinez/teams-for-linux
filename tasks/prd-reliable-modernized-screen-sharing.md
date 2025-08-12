# PRD: Reliable & Modernized Screen Sharing (X11 & Wayland)

## Document Info
- Owner: (to assign)
- Stakeholders: Maintainer, Contributors, Affected Users (Slackware, Debian-based, other distros), Electron platform integrators
- Status: Draft
- Related Issue(s): #1743 (Cannot share screen – selection UI unresponsive)
- Last Updated: 2025-08-12

---

## 1. Problem Statement
Users report that initiating screen sharing produces a selection strip (share entire screen / window) that becomes unresponsive. Clicking options or the close button does nothing; only restarting the app clears the UI. Logs show native Chromium errors:
```
[ERROR:window_capturer_x11.cc(145)] The window is no longer valid.
```
No visible resolution/rejection of the `getDisplayMedia` promise occurs, resulting in a “dead” overlay.

The current implementation blends two paradigms:
1. Overriding `MediaDevices.getDisplayMedia` (legacy Chromium `chromeMediaSource` path).
2. Electron’s `session.setDisplayMediaRequestHandler` (newer interception pattern).

This dual strategy plus channel naming inconsistencies and potential context isolation mismatch likely leads to unresolved promises and stuck UX.

---

## 2. Goals
1. Deliver a reliable, responsive screen sharing experience on X11 and Wayland.
2. Remove race conditions / deadlocks in the selection flow.
3. Unify on a single, Electron-supported capture strategy per platform.
4. Support pop‑out preview (thumbnail) only when stable; degrade gracefully otherwise.
5. Provide clear user feedback on failures (UI + logs).
6. Add lightweight telemetry / logging hooks (non-PII) to diagnose failures.
7. Make architecture easier to maintain and extend (future audio sharing, multi-monitor differentiation).

---

## 3. Non‑Goals
- Implement system audio capture (unless trivially exposed).
- Implement advanced multi-stream compositing.
- Refactor unrelated media device selection logic.
- Provide full parity with native MS Teams proprietary optimizations.

---

## 4. Users & Use Cases
| User Type | Scenario | Needs |
|-----------|----------|-------|
| Remote developer | Share full desktop during code review | Quick, reliable, low friction |
| Trainer / Presenter | Share a single application window | Precise window selection, feedback if window closes |
| Support engineer | Switch between window & screen mid-call | Fast re-selection |
| Privacy-conscious user | Avoid accidental wrong screen share | Clear confirmation, cancel path |

---

## 5. Current Architecture Summary
Component highlights:
- `chromeApi.js` overrides `getDisplayMedia` for X11 with custom promise + IPC `select-source`.
- `StreamSelector` UI added dynamically via `WebContentsView`.
- `session.setDisplayMediaRequestHandler` also intercepts display capture requests.
- Pop-out preview (`callPopOut.html`) reconstructs stream using stored `sourceId` and legacy constraints.
- Global state: `screenSharingActive`, `currentScreenShareSourceId`.
- Communication: `screen-sharing-started`, `screen-sharing-stopped`.

Pain Points:
- Potential mismatch of IPC channels (`select-source` vs `selected-source`).
- Duplicate interception layers cause ambiguous responsibility.
- Legacy `chromeMediaSource` constraints may break with newer Electron/Chromium.
- Lack of explicit error UI on failure (silent hang).
- No resilience if the chosen window is closed (native error surfaces only).

---

## 6. Root Cause Hypotheses (Ranked)
| Rank | Hypothesis | Evidence | Confidence |
|------|------------|----------|------------|
| 1 | IPC response channel mismatch prevents promise resolution | Renderer listens `select-source`; main may reply differently (`selected-source`) | High |
| 2 | Double interception (override + request handler) conflicts | Both implemented simultaneously | High |
| 3 | Context isolation prevents override from affecting page | Comment alludes to requirement; if not disabled, override inert | Medium |
| 4 | Passing full source object instead of expected shape to handler | `callback({ video: source })` may expect `source.id` in some Electron versions | Medium |
| 5 | Invalid legacy constraints causing capture failure on certain compositors | Fixed width/height + deprecated mandatory constraints | Medium |
| 6 | Race removing selection view before reply dispatch | Use of `once` listeners + UI removal logic | Low-Medium |

---

## 7. Proposed Solution Strategy

### 7.1 Architectural Decision
Adopt a “single capture path” policy:
- Wayland: DO NOT override; use native `navigator.mediaDevices.getDisplayMedia`.
- X11: Prefer `session.setDisplayMediaRequestHandler` alone (modern). Remove the manual override. Only if Electron version lacks required fidelity, fall back to override path (behind feature flag).

### 7.2 IPC Simplification
Standardize channels:
- Request from Teams web content triggers Electron handler (no manual override if possible).
- Stream selector returns `sourceId`.
- Unified events:
  - `screen-share:started` (payload: `{ sourceId, mode: 'window'|'screen' }`)
  - `screen-share:stopped`
  - `screen-share:error` (payload: `{ stage, code, message }`)

### 7.3 Stream Selector Contract
Return normalized object:
```
{
  id: <string>,          // Electron desktopCapturer source id
  type: 'screen'|'window',
  title: <string>,
  display_id?: <string>  // monitor id if available
}
```
Internally pass only `id` to `callback({ video: id })`.

### 7.4 Pop-out Preview Modernization
Attempt to attach using:
```
navigator.mediaDevices.getUserMedia({
  video: {
    displaySurface: (inferred),
    mandatory / legacy ONLY if legacy flag enabled
  }
})
```
If legacy constraints required: keep encapsulated in a helper with capability test. Fallback: show message “Preview not available on this environment.”

### 7.5 Failure Handling UX
- If promise not resolved within 8 seconds: show inline toast “Screen share selection timed out. Retry.”
- If `window_capturer_x11` errors: convert to user message “Selected window is no longer available.”

### 7.6 Telemetry / Logging (non-PII)
Log structured JSON entries to `main.log` with tag `screen-share`:
- `event=select_opened`
- `event=source_chosen`
- `event=capture_started`
- `event=capture_error` (code, stage)
- `event=capture_stopped` (reason=ended|user|error)

### 7.7 Feature Flags
Config additions:
```
screenSharing:
  strategy: 'auto' | 'legacy-override' | 'electron-handler'
  enablePreview: true
  timeoutMs: 8000
```

### 7.8 Backward Compatibility
If Electron version < minimum required for stable `setDisplayMediaRequestHandler` (specify), automatically switch to `legacy-override`.

---

## 8. Detailed Requirements

### Functional
1. User can initiate share and select a screen/window; action completes (receive remote view) within <= 5s median.
2. Canceling the selector cleanly returns control (no stuck overlay).
3. Closing the shared window stops sharing and updates state within 1s.
4. Pop-out preview auto-opens only if `screenSharingThumbnail.enabled = true`.
5. Re-share (change source) supported without needing app restart.

### Non-Functional
- Reliability: < 2% failed attempts (excluding user cancellation) in basic QA matrix (Ubuntu, Debian, Fedora, Slackware (community), Arch).
- Performance: Selector UI loads < 500ms after request.
- Logging: Every attempt produces at least one start or error event.

### Observability
- Add version + platform to structured log lines.
- Provide debug flag `--screenShareDebug` to increase verbosity (dump selected source metadata).

### Security / Privacy
- Do not log window titles unless debug flag enabled.
- Do not persist selected source IDs beyond active session.
- Avoid capturing audio implicitly.

### Accessibility
- Keyboard navigable selector (Tab / Enter / Esc).
- Visible focus ring.

---

## 9. Out of Scope Enhancements (Future Backlog)
- Multi-source simultaneous sharing (screen + window).
- Region (partial screen) selection.
- System audio capture mixing.

---

## 10. Risks & Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| Electron API behavior changes | Break capture | Pin tested Electron version; capability detection |
| Wayland compositor differences | Inconsistent preview | Feature detection; disable preview gracefully |
| Legacy corporate environments (older GPU drivers) | Failure starting stream | Retry with reduced constraint set |
| Race conditions in IPC once-handlers | Stuck promise | Replace with robust state machine + timeout |

---

## 11. Rollout Plan
1. Phase 0 (Experimental): Hidden behind `screenSharing.strategy='electron-handler'` for testers.
2. Phase 1 (Beta): Make ‘auto’ pick new path on supported Electron; fallback logs warning if reverting.
3. Phase 2 (General): Remove legacy override unless explicitly configured.
4. Phase 3 (Cleanup): Deprecate legacy config path; document removal.

---

## 12. QA Test Matrix (Initial)
| Scenario | X11 (Slackware) | X11 (Ubuntu) | Wayland (GNOME) | Wayland (KDE) |
|----------|-----------------|--------------|-----------------|---------------|
| Full screen share success | ✔ | ✔ | ✔ | ✔ |
| Window share success | ✔ | ✔ | ✔ | ✔ |
| Cancel selection | ✔ | ✔ | ✔ | ✔ |
| Share then close window | ✔ (auto stop) | ✔ | ✔ | ✔ |
| Re-share (switch window) | ✔ | ✔ | ✔ | ✔ |
| Pop-out preview enabled | ✔ | ✔ | ✔ | ✔ |
| Pop-out preview disabled | ✔ | ✔ | ✔ | ✔ |
| Timeout injection test | ✔ | ✔ | ✔ | ✔ |

---

## 13. Open Questions
1. Exact Electron version(s) shipped with 2.0.15 / 2.0.17? (Affects API contract).
   - **Answer:** Electron version 37.2.4.
2. Is `contextIsolation` currently enabled for main Teams window?
   - **Answer:** Yes, `contextIsolation` is enabled for the main Teams window.
3. Are there existing user settings depending on legacy override (backward compatibility expectations)?
   - **Answer:** As far as we know, there are no existing user settings that explicitly depend on the legacy override.
4. Should we expose user-facing toggle “Use legacy screen sharing method” in UI?
   - **Answer:** No, a user-facing toggle will not be exposed. The system will handle the strategy automatically, supported by a pre-release phase.

---

## 14. Implementation Status & Task List

### Current Configuration Analysis ✅ COMPLETED  
- **Electron Version:** 37.2.4 (supports modern setDisplayMediaRequestHandler API)  
- **Context Isolation:** Enabled (set via `this.config.contextIsolation` in browserWindowManager.js:75)
- **Window Creation:** Managed by BrowserWindowManager class with proper preload script
- **Preload Script:** Located at `app/browser/index.js`

### Current Implementation Analysis ✅ COMPLETED

#### Dual Interception Strategy (CONFIRMED ROOT CAUSE)
The application implements **both** interception strategies simultaneously:

1. **Legacy Override Path** (`app/browser/tools/chromeApi.js`)
   - Overrides `MediaDevices.prototype.getDisplayMedia` on X11 systems
   - Uses IPC channel `select-source` to request source selection
   - Waits for response on `select-source` channel (same channel name)
   - Uses deprecated `getUserMedia` with `chromeMediaSource: "desktop"` constraints

2. **Modern Handler Path** (`app/mainAppWindow/index.js:79-102`)
   - Uses `session.setDisplayMediaRequestHandler` (Electron 37.2.4 feature)
   - Shows StreamSelector component for source selection
   - Returns source via callback: `callback({ video: source })`

#### IPC Channel Mismatch (CONFIRMED ROOT CAUSE)
**Critical Issue**: Channel name inconsistency creates unresolved promises:
- **chromeApi.js:37** sends `select-source` and listens on `select-source` (line 34)
- **browserWindowManager.js:98** replies on `select-source` 
- **streamSelector/index.js:80** expects response on `selected-source` channel
- **Result**: Promise never resolves, UI hangs

#### StreamSelector Implementation Issues
- Uses deprecated `WebContentsView` and `setBrowserView` (line 86)
- IPC listeners use `once()` which can miss responses in race conditions
- No timeout handling for unresponsive selection UI
- Manual view cleanup has potential memory leaks

#### Pop-out Preview Legacy Constraints
- **File**: `app/inAppUI/callPopOut.html:45-53`
- Uses deprecated `mandatory` constraints with `chromeMediaSource`
- No graceful fallback when constraints fail
- Fixed dimensions instead of dynamic constraints

### Tasks

- [x] 1. Inventory: Confirm current Electron version & window creation flags (contextIsolation) ✅
  - [x] 1.1 Check package.json for Electron version 
  - [x] 1.2 Find main window creation code and verify contextIsolation setting
  - [x] 1.3 Document current configuration in task file

- [x] 2. Analyze current screen sharing implementation ✅ 
  - [x] 2.1 Review chromeApi.js override implementation
  - [x] 2.2 Examine session.setDisplayMediaRequestHandler usage  
  - [x] 2.3 Analyze StreamSelector component and IPC channels
  - [x] 2.4 Review pop-out preview implementation
  - [x] 2.5 Document current pain points and root causes

- [x] 3. Refactor: Remove override by default; wrap in strategy switch ✅
  - [x] 3.1 Create ScreenShareController with strategy pattern
  - [x] 3.2 Add configuration options for screen sharing strategy  
  - [x] 3.3 Disable legacy override by default, wrap in strategy check
  - [x] 3.4 Update main window to use ScreenShareController

- [x] 4. IPC Standardization: Introduce new channel names; deprecate old ones ✅
  - [x] 4.1 Fix StreamSelector IPC channel mismatch (selected-source → select-source)
  - [x] 4.2 Standardize IPC event names to new format (screen-share:started, screen-share:stopped, screen-share:error)
  - [x] 4.3 Add deprecation warnings for old IPC channels

---

## 15. Acceptance Criteria (Sample)
- AC1: On Slackware 15.0, initiating screen share completes successfully (manual verification + log shows `capture_started`).
- AC2: Selector cancel returns UI control; log shows `capture_error` with code `user_cancel`.
- AC3: Closing shared window triggers `screen-share:stopped` within 1s (log + UI state).
- AC4: No unhandled promise rejections in console during 10 sequential share attempts.
- AC5: Pop-out preview window shows actual content or a graceful “Preview unavailable” message (never blank black window with no message).

---

## 15. Implementation Plan (High-Level Tasks)
1. Inventory: Confirm current Electron version & window creation flags (contextIsolation).
2. Refactor: Remove override by default; wrap in strategy switch.
3. IPC Standardization: Introduce new channel names; deprecate old ones with warnings.
4. StreamSelector: Ensure it replies on unified channel; pass only `source.id`.
5. State Machine: Introduce `ScreenShareController` (states: idle -> selecting -> starting -> active -> stopping -> error).
6. Pop-out Preview: Refactor to capability-detect constraint style.
7. Logging: Add structured logger helper `logScreenShare(event, payload)`.
8. Timeout Handling: Implement abort controller for selection > timeout.
9. UX: Add failure toast & cancel options.
10. QA + Automated Tests (where feasible).
11. Documentation updates (README / docs/ipc-api.md).
12. Release notes & migration guidance.

---

## 16. Appendix: Proposed Data Structures

```ts
interface ScreenShareState {
  status: 'idle' | 'selecting' | 'starting' | 'active' | 'stopping' | 'error';
  sourceId?: string;
  sourceType?: 'screen'|'window';
  error?: { stage: string; code: string; message: string };
  startedAt?: number;
}
```

```json
// Example structured log line
{
  "ts": "2025-08-12T12:34:56.789Z",
  "component": "screen-share",
  "event": "capture_error",
  "stage": "starting",
  "code": "NO_SOURCE_REPLY",
  "electronVersion": "XX.YY.Z",
  "platform": "linux-x11"
}
```

---

## 17. Success Metrics
- Reduction in user-reported “cannot share screen” issues by ≥80% over two release cycles.
- <5% share attempts requiring retry (sample telemetry / community feedback).
- Issue #1743 closed with confirmed reporter validation.

---

(End of Document)
