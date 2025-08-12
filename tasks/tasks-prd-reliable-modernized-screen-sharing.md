## System Analysis

### ADR Review

-   No formal Architecture Decision Records (ADRs) found in `docs/adr/`.

### Documentation Review

-   The core screen sharing logic is split between `app/browser/tools/chromeApi.js` (renderer-side override), `app/mainAppWindow/index.js` (main process `setDisplayMediaRequestHandler` setup and `StreamSelector` integration), and `app/streamSelector/` (the UI for source selection).
-   IPC communication for screen sharing involves `select-source` (from renderer, unhandled in main process), `screen-sharing-started`, and `screen-sharing-stopped`.
-   The `package.json` confirms Electron version 37.2.4.

### Pattern Analysis

-   The project uses Electron's `ipcRenderer` and `ipcMain` for inter-process communication.
-   `BrowserWindow` and `WebContentsView` are used for UI elements.
-   Configuration is managed via `AppConfiguration`.
-   The `app/browser` directory contains renderer-side code that interacts with the browser page in a non-traditional way, including direct manipulation of the DOM and interaction with React components (e.g., via `ReactHandler`). This involves "hacks" to integrate with the Teams web application.
-   The current screen sharing implementation deviates from a unified Electron-native approach by introducing a custom `getDisplayMedia` override in the renderer process.

### Conflicts and Constraints

-   **Conflict:** The `MediaDevices.prototype.getDisplayMedia` override in `app/browser/tools/chromeApi.js` directly conflicts with the `window.webContents.session.setDisplayMediaRequestHandler` setup in `app/mainAppWindow/index.js`. The renderer-side override sends an IPC message (`select-source`) that is not handled, while the main process is correctly intercepting `getDisplayMedia` via the `setDisplayMediaRequestHandler`.
-   **Conflict:** `contextIsolation` is enabled, which `chromeApi.js` comments suggest should be disabled for its functionality. This likely renders the `chromeApi.js` override ineffective or problematic and poses a security risk.
-   **Constraint:** The existing `StreamSelector` UI is integrated with `setDisplayMediaRequestHandler` via `streamSelector.show()`.

### Research Spikes Identified

-   **Phase 1 Verification:** Confirm that simply removing the `chromeApi.js` override for X11 allows `setDisplayMediaRequestHandler` to function correctly and resolves the unresponsive UI issue.

## Relevant Files

-   `app/browser/tools/chromeApi.js` - Contains the `getDisplayMedia` override for X11 and Wayland.
-   `app/mainAppWindow/index.js` - Sets up `setDisplayMediaRequestHandler` and integrates `StreamSelector`.
-   `app/streamSelector/` - Directory containing the StreamSelector UI and its logic.
-   `app/index.js` - Main process entry point, handles `screen-sharing-started` and `screen-sharing-stopped` IPC.
-   `app/config/index.js` - Configuration for `contextIsolation` and potential feature flags.
-   `app/inAppUI/callPopOut.html` - Pop-out preview UI.
-   `app/inAppUI/callPopOutPreload.js` - Preload script for pop-out preview.

## Tasks

-   [ ] **Phase 1: Targeted IPC Fix Verification**
    -   [ ] 1.1 Research: Confirm the exact impact of `contextIsolation` on `MediaDevices.prototype.getDisplayMedia` override.
    -   [ ] 1.2 Modify `app/browser/tools/chromeApi.js`: Remove or comment out the `customGetDisplayMediaX11` override and the `ipcRenderer.send("select-source")` call. Ensure Wayland handling remains.
    -   [ ] 1.3 Test: Manually test screen sharing on X11 to verify if the unresponsive UI issue is resolved.
    -   [ ] 1.4 Document: Record findings from testing Phase 1. If the issue is resolved, note this as a temporary fix.

-   [ ] **Phase 2: Modernization and Robustness**
    -   [ ] 2.1 Unify Screen Capture Strategy and IPC
        -   [ ] 2.1.1 Refactor `app/browser/tools/chromeApi.js`: Remove all `getDisplayMedia` overrides (both X11 and Wayland custom implementations). Rely entirely on Electron's native `getDisplayMedia` and `setDisplayMediaRequestHandler`.
        -   [ ] 2.1.2 Standardize IPC Channels: Remove any remaining `select-source` IPC calls/listeners. Ensure `screen-share:started`, `screen-share:stopped`, and `screen-share:error` are consistently used and handled.
        -   [ ] 2.1.3 Review `app/mainAppWindow/index.js`: Ensure `setDisplayMediaRequestHandler` is robust and correctly handles all `getDisplayMedia` requests.
        -   [ ] 2.1.4 Address `contextIsolation` implications: Review any code that was previously dependent on `contextIsolation` being disabled and adapt it to work with `contextIsolation` enabled, or remove it if no longer necessary.
        -   [ ] 2.1.5 Update `StreamSelector` integration: Ensure `StreamSelector` correctly provides the `sourceId` to the `setDisplayMediaRequestHandler` callback.
    -   [ ] 2.2 Modernize Pop-out Preview and Error Handling
        -   [ ] 2.2.1 Refactor Pop-out Preview: Update `callPopOut.html` and related logic to use modern `getUserMedia` constraints for attaching the stream. Implement graceful degradation if preview is not available.
        -   [ ] 2.2.2 Implement Failure Handling UX: Add inline toast messages for screen share selection timeouts and `window_capturer_x11` errors.
        -   [ ] 2.2.3 Implement Timeout for Selection: Add a timeout mechanism for the screen share selection process.
    -   [ ] 2.3 Implement Telemetry and Observability
        -   [ ] 2.3.1 Add Structured Logging: Implement `logScreenShare(event, payload)` helper to log structured JSON entries to `main.log`.
        -   [ ] 2.3.2 Integrate Logging: Add logging for `select_opened`, `source_chosen`, `capture_started`, `capture_error`, and `capture_stopped` events.
        -   [ ] 2.3.3 Implement Debug Flag: Add `--screenShareDebug` flag to increase verbosity and dump selected source metadata.
    -   [ ] 2.4 Define and Execute QA Test Matrix
        -   [ ] 2.4.1 Develop Detailed Test Cases: Based on the PRD's QA Test Matrix, create comprehensive test cases for X11 and Wayland.
        -   [ ] 2.4.2 Execute Manual Tests: Perform manual testing across specified environments (Ubuntu, Debian, Fedora, Slackware, Arch).
        -   [ ] 2.4.3 Automate Tests (where feasible): Identify and implement automated tests for core screen sharing functionality.

## Future Improvements

This section captures enhancements and non-critical features that could be implemented after the core functionality is complete:

### Priority 2 (Nice-to-Have)

-   Implement system audio capture (if trivially exposed by Electron).
-   Refactor unrelated media device selection logic (if identified during implementation).

### Priority 3 (Future Consideration)

-   Multi-source simultaneous sharing (screen + window).
-   Region (partial screen) selection.
-   System audio capture mixing.

### Technical Debt Considerations

-   Review and potentially remove any remaining legacy code related to the old screen sharing implementation.
-   Further investigate and refactor any other areas impacted by `contextIsolation` if not fully addressed in Phase 2.
-   Address "hacks" and non-traditional integrations in `app/browser` related to screen sharing or `contextIsolation` that may introduce technical debt or instability.
