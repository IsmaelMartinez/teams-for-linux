<!-- toc -->

# PRD: Improved Screen Sharing Experience

## 1. Introduction/Overview

The current screen sharing solution is functional but lacks visual appeal and modern features. This document outlines the requirements for a new, improved screen sharing experience that is both aesthetically pleasing and highly usable. The goal is to provide a user-friendly screen picker, a thumbnail preview of the shared content, and additional controls for the user.

## 2. Goals

-   **Improve Usability:** Make the screen sharing process more intuitive and user-friendly.
-   **Enhance Aesthetics:** Create a modern and visually appealing UI for the screen picker and thumbnail window.
-   **Increase Functionality:** Add new features such as live previews, quality selection, and a thumbnail window.

## 3. User Stories

-   As a user, I want to see a live preview of my screens and windows before I start sharing, so I can be confident that I am sharing the correct content.
-   As a user, I want to be able to select the video quality of my screen share, so I can optimize for performance or clarity.
-   As a user, I want to see a thumbnail of what I am sharing, so I can be aware of what others are seeing.
-   As a user, I want to be able to move and resize the thumbnail window, so it doesn't obstruct my view.
-   As a user, I want to be able to stop sharing from the thumbnail window, so I can quickly end the screen share without having to go back to the main window.
-   As a user, I want to be able to share my system audio, so others can hear the audio from my shared content.

## 4. Functional Requirements

### Phase 1: The Screen Picker

1.  The system must display a screen picker window when the user initiates a screen share.
2.  The screen picker must show a list of available screens and windows.
3.  Each item in the list must show a live preview of the content.
4.  The user must be able to select a screen or window to share.
5.  The user must be able to start the screen share by clicking a "Share" button.
6.  The user must be able to cancel the screen share by closing the picker window.

### Phase 2: The Thumbnail Window

1.  After the screen share starts, the system must display a thumbnail window.
2.  The thumbnail window must show a live preview of the shared content.
3.  The thumbnail window must be movable and resizable.
4.  The thumbnail window must have a button to stop the screen share.

### Phase 3: Additional Features

1.  The screen picker must include a checkbox to allow the user to share their system audio.
2.  The screen picker must include a dropdown to allow the user to select the video quality (e.g., 720p, 1080p, 4K).

## 5. Non-Goals (Out of Scope)

-   This feature will not include annotation tools for screen sharing.
-   This feature will not include the ability to share a portion of the screen (region sharing).

## 6. Design Considerations (Optional)

-   The UI should be modern, clean, and consistent with the rest of the application.
-   The old screen picker can be used as a source of inspiration, but new designs should be explored.
-   The thumbnail window should be unobtrusive and easy to manage.

## 7. Technical Considerations (Optional)

-   The implementation should use Electron's `desktopCapturer` API to get the available sources.
-   The screen picker should be implemented as a separate `BrowserWindow`.
-   The thumbnail window should also be a separate `BrowserWindow` with a transparent background.
-   The implementation should be cross-platform and work on X11 and Wayland.

## 8. Success Metrics

-   Successful implementation of all functional requirements.
-   Positive user feedback on the new screen sharing experience.

## 9. Open Questions

-   What should be the default video quality?
-   What should be the default behavior for audio sharing (opt-in or opt-out)?
