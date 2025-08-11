## System Analysis

### ADR Review

- No Architecture Decision Records found in `docs/adr/`.

### Documentation Review

- `docs/configuration.md`: Relevant for understanding existing configuration management.
- `docs/ipc-api.md`: Relevant for defining new IPC channels for communication between main and renderer processes.
- `app/appConfiguration/index.js`: Centralized configuration management.
- `app/mainAppWindow/index.js`: Manages the main `BrowserWindow`.
- `app/browser/tools/`: Client-side scripts injected into the Teams web interface.

### Pattern Analysis

- **Modularity:** New features should be placed in separate, dedicated modules.
- **Modernization:** Use `async/await`, `const`/`let`, and class private fields.
- **Robustness:** Comprehensive error handling, structured logging.
- **IPC Communication:** Moving towards a centralized event bus or IPC abstraction layer. New IPC channels should be well-documented.
- **Configuration Management:** All configuration is managed through `AppConfiguration` class; treat as immutable after startup.
- **State Management:** Avoid global variables; use dedicated state management modules.

### Conflicts and Constraints

- The "separate window" feature introduces a new `BrowserWindow` which needs to share the existing session for authentication and cookies. This aligns with the PRD's goal of "Maintain Application Flow" and "non-blocking operation" for the overlay.
- The "separate window" will require careful management of its lifecycle and communication with the main window to ensure a seamless user experience.

### Research Spikes Identified

- **Electron Session Sharing:** Investigate the best approach for sharing the Electron session (auth/cookies) between the main window and the new pop-out window. This is critical for the "separate window" feature.
- **Video Grid/Active Speaker Integration:** Research indicates that capturing video from a webview for display in a separate Electron window is complex due to security isolation. The most promising approach involves using `session.setDisplayMediaRequestHandler` in the main process to obtain a `MediaStream` from the webview's `webContents`, which can then be passed to the renderer process for display in a `<video>` element. This requires careful handling of `webviewTag`, `web-contents-created` events, and secure API exposure via `contextBridge`.
- **In-call Toolbar Replication:** Determine the feasibility and complexity of replicating the basic in-call toolbar (mute/unmute mic, toggle camera, share screen, end call) within the separate window. This might require reverse-engineering Teams' internal APIs or simulating user interactions.

## Relevant Files

- `app/inAppUI/`: New module for the in-app UI and separate window.
- `app/inAppUI/index.js`: Main entry point for the in-app UI module.
- `app/inAppUI/callPopOut.html`: HTML for the pop-out call window.
- `app/inAppUI/callPopOutPreload.js`: Preload script for the pop-out call window.
- `app/browser/tools/popOutCall.js`: Script injected into Teams web app to add pop-out button.
- `app/index.js`: Main Electron process, will need modifications for IPC handlers and potentially window management.
- `app/menus/appMenu.js`: Menu definition for adding the "In-App UI" entry.
- `app/menus/index.js`: Menu handling logic, will need to call the new in-app UI module.
- `docs/ipc-api.md`: Will need to be updated with new IPC channels.
- `app/mainAppWindow/index.js`: May need to interact with the new separate window.
- `app/browser/tools/`: Potential location for scripts injected into the Teams web app to facilitate video/toolbar integration.
- `app/appConfiguration/index.js`: Will need to be updated to include configuration options for the separate window (e.g., auto-pop).

### Notes

- Unit tests should typically be placed alongside the code files they are testing (e.g., `MyComponent.tsx` and `MyComponent.test.tsx` in the same directory).
- Use `npx jest [optional/path/to/test/file]` to run tests. Running without a path executes all tests found by the Jest configuration.
- Follow established patterns identified in the Pattern Analysis section
- Address any conflicts noted in the System Analysis before implementation

## Tasks

- [x] 1.0 Implement Separate Call Window (Pop-out)
  - [x] 1.1 **Research Spike: Electron Session Sharing**
    - [x] 1.1.1 Investigate methods for sharing session/cookies between `BrowserWindow` instances.
    - [x] 1.1.2 Determine the most robust and secure approach for session persistence.
  - [x] 1.2 Create a new `BrowserWindow` for the pop-out call window.
  - [x] 1.3 Implement a "Pop out" icon/button in the main Teams toolbar (requires injecting script into Teams web app).
  - [x] 1.4 Implement logic to "undock" the meeting into the new window when the "Pop out" button is clicked.
  - [x] 1.5 **Research Spike: Video Grid/Active Speaker Integration**
    - [x] 1.5.1 Investigate methods to capture and display the video grid/active speaker from the Teams web app.
    - [x] 1.5.2 Explore using `desktopCapturer` or direct DOM manipulation via injected scripts.

  - [x] 1.6 Implement "Always-on-top" setting for the pop-out window.
  - [x] 1.7 Implement optional "Auto-pop when sharing" feature (requires configuration option).
  - [x] 1.8 Implement show what is being shared in the pop-out window (when screen sharing is and not for full screen).
  - [x] 1.9 Display the actual shared screen content in the pop-out window.
  - [x] 1.10 Resize the pop-out window to half its current size.


## Future Improvements

This section captures enhancements and non-critical features that could be implemented after the core functionality is complete:

- **Implement the basic in-call toolbar** (mute/unmute mic, toggle camera, share screen, end call) within the pop-out window.

### Technical Debt Considerations

- **Centralized IPC Abstraction:** Refactor existing IPC handling in `app/index.js` towards a more centralized event bus or IPC abstraction layer.
- **Comprehensive Testing:** Introduce a formal testing framework and build a comprehensive test suite for the new in-app UI modules.
- **Error Handling Refinement:** Implement a more robust and consistent error handling strategy across all new modules.
