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
- **Video Grid/Active Speaker Integration:** Research how to effectively capture and display the video grid or active speaker from the Teams web app within a separate Electron window. This might involve injecting scripts or using Electron's `desktopCapturer` if direct DOM manipulation is not feasible or reliable.
- **In-call Toolbar Replication:** Determine the feasibility and complexity of replicating the basic in-call toolbar (mute/unmute mic, toggle camera, share screen, end call) within the separate window. This might require reverse-engineering Teams' internal APIs or simulating user interactions.

## Relevant Files

- `app/inAppUI/`: New module for the in-app UI and separate window.
- `app/inAppUI/index.js`: Main entry point for the in-app UI module.
- `app/inAppUI/inAppUI.html`: HTML for the in-app UI modal.
- `app/inAppUI/inAppUI.css`: Custom styles for the in-app UI modal.
- `app/inAppUI/preload.js`: Preload script for the in-app UI modal.
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

- [ ] 1.0 Implement Core In-App UI Modal (About/System Info)
  - [x] 1.1 Add a close button to the `inAppUI.html` modal
  - [x] 1.2 Implement dismissal of the modal via Escape key and clicking outside.
  - [x] 1.3 Implement keyboard shortcut (e.g., Ctrl+Shift+H) to open the modal.
  - [x] 1.4 Ensure the modal is responsive across different screen sizes.
  - [x] 1.5 Add basic styling to align with the project's aesthetic.
- [ ] 2.0 Implement Separate Call Window (Pop-out)
  - [ ] 2.1 **Research Spike: Electron Session Sharing**
    - [ ] 2.1.1 Investigate methods for sharing session/cookies between `BrowserWindow` instances.
    - [ ] 2.1.2 Determine the most robust and secure approach for session persistence.
  - [ ] 2.2 Create a new `BrowserWindow` for the pop-out call window.
  - [ ] 2.3 Implement a "Pop out" icon/button in the main Teams toolbar (requires injecting script into Teams web app).
  - [ ] 2.4 Implement logic to "undock" the meeting into the new window when the "Pop out" button is clicked.
  - [ ] 2.5 **Research Spike: Video Grid/Active Speaker Integration**
    - [ ] 2.5.1 Investigate methods to capture and display the video grid/active speaker from the Teams web app.
    - [ ] 2.5.2 Explore using `desktopCapturer` or direct DOM manipulation via injected scripts.
  - [ ] 2.6 Implement the basic in-call toolbar (mute/unmute mic, toggle camera, share screen, end call) within the pop-out window.
  - [ ] 2.7 Implement "Always-on-top" setting for the pop-out window.
  - [ ] 2.8 Implement optional "Auto-pop when sharing" feature (requires configuration option).
- [ ] 3.0 Integrate Configuration Management Interface
  - [ ] 3.1 Design and implement the UI for displaying all current configuration settings.
  - [ ] 3.2 Implement input controls (text fields, checkboxes, dropdowns, file pickers) for modifying configuration values.
  - [ ] 3.3 Implement validation of configuration changes before applying them.
  - [ ] 3.4 Implement saving changes to the appropriate configuration files.
  - [ ] 3.5 Implement reset-to-defaults option for each configuration section.
  - [ ] 3.6 Implement configuration export/import functionality.
  - [ ] 3.7 Handle configuration reload without requiring application restart where possible.
- [ ] 4.0 Integrate Knowledge Base Search and Access
  - [ ] 4.1 Implement full-text search across all documentation content (from `docs/` directory).
  - [ ] 4.2 Display search results with relevance ranking and content previews.
  - [ ] 4.3 Organize content by categories (Installation, Audio, Display, Configuration, etc.).
  - [ ] 4.4 Provide direct links to full documentation pages.
  - [ ] 4.5 Support filtering search results by content type or category.
  - [ ] 4.6 Highlight search terms in results and content.
  - [ ] 4.7 Support markdown rendering for rich content display.
- [ ] 5.0 Refine User Interface Design and Accessibility
  - [ ] 5.1 Ensure distinct design that clearly separates from Teams interface.
  - [ ] 5.2 Provide clear visual hierarchy and intuitive navigation.
  - [ ] 5.3 Ensure consistent styling across all panels and sections.
  - [ ] 5.4 Implement dark/light mode preferences.
  - [ ] 5.5 Provide clear indicators for unsaved changes.
  - [ ] 5.6 Implement loading states and error handling.
  - [ ] 5.7 Ensure full keyboard navigation and screen reader compatibility.

## Future Improvements

This section captures enhancements and non-critical features that could be implemented after the core functionality is complete:

### Priority 2 (Nice-to-Have)

- **Custom CSS/Background Management UI:** A visual interface to manage custom CSS or backgrounds, as mentioned in the PRD.
- **Real-time Preview of Changes:** For configuration changes, provide a real-time preview where applicable.
- **Contextual Help System:** Provide searchable, immediately accessible troubleshooting assistance based on the current context within the application.

### Priority 3 (Future Consideration)

- **Advanced Scripting/Automation:** Explore possibilities for advanced scripting or automation capabilities within the UI.
- **Plugin/Extension System:** Consider a system for third-party additions to the in-app UI.
- **Advanced Analytics/Usage Tracking:** Implement analytics within the UI to track feature usage and effectiveness (with user consent).

### Technical Debt Considerations

- **Centralized IPC Abstraction:** Refactor existing IPC handling in `app/index.js` towards a more centralized event bus or IPC abstraction layer.
- **Comprehensive Testing:** Introduce a formal testing framework and build a comprehensive test suite for the new in-app UI modules.
- **Error Handling Refinement:** Implement a more robust and consistent error handling strategy across all new modules.
