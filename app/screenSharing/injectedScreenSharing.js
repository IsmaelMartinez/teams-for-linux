(function () {
  let isScreenSharing = false;
  let activeStreams = [];
  let activeMediaTracks = [];

  // Helper function to disable audio in screen sharing constraints
  function disableAudioInConstraints(constraints, context) {
    if (constraints) {
      constraints.audio = false;
      if (constraints.systemAudio !== undefined) {
        constraints.systemAudio = "exclude";
      }
      console.debug(`[SCREEN_SHARE_DIAG] Audio disabled for ${context}`);
    }
  }

  // Monitor for screen sharing streams and detect when they stop
  function monitorScreenSharing() {
    // Hook into getDisplayMedia for screen sharing
    const originalGetDisplayMedia = navigator.mediaDevices.getDisplayMedia.bind(
      navigator.mediaDevices
    );

    navigator.mediaDevices.getDisplayMedia = function (constraints) {
      console.debug("[SCREEN_SHARE_DIAG] getDisplayMedia intercepted, disabling audio");
      
      // Force disable all audio in screen sharing to prevent echo issues
      disableAudioInConstraints(constraints, "getDisplayMedia");
      
      return originalGetDisplayMedia(constraints)
        .then((stream) => {
          console.debug(`[SCREEN_SHARE_DIAG] Screen sharing started via getDisplayMedia (${stream.getAudioTracks().length}a/${stream.getVideoTracks().length}v)`);
          handleScreenShareStream(stream, "getDisplayMedia");
          return stream;
        })
        .catch((error) => {
          console.error(`[SCREEN_SHARE_DIAG] getDisplayMedia failed: ${error.name} - ${error.message}`);
          throw error;
        });
    };

    // Also hook into getUserMedia for fallback detection
    const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices
    );

    navigator.mediaDevices.getUserMedia = function (constraints) {
      // Check if this is a screen sharing stream - handle multiple constraint formats
      const isScreenShare =
        constraints &&
        constraints.video &&
        // Electron format
        (constraints.video.chromeMediaSource === "desktop" ||
          constraints.video.mandatory?.chromeMediaSource === "desktop" ||
          // Teams format
          constraints.video.chromeMediaSourceId ||
          constraints.video.mandatory?.chromeMediaSourceId ||
          // Generic desktop capture
          (typeof constraints.video === "object" &&
            constraints.video.deviceId &&
            typeof constraints.video.deviceId === "object" &&
            constraints.video.deviceId.exact));

      if (isScreenShare) {
        console.debug("[SCREEN_SHARE_DIAG] Screen sharing getUserMedia detected, disabling audio");
        
        // Force disable audio for screen sharing streams to prevent echo
        disableAudioInConstraints(constraints, "getUserMedia screen sharing");
      }

      return originalGetUserMedia(constraints)
        .then((stream) => {
          if (isScreenShare) {
            console.debug(`[SCREEN_SHARE_DIAG] Screen sharing started via getUserMedia (${stream.getAudioTracks().length}a/${stream.getVideoTracks().length}v)`);
            handleScreenShareStream(stream, "getUserMedia");
          }

          return stream;
        })
        .catch((error) => {
          if (isScreenShare) {
            console.error(`[SCREEN_SHARE_DIAG] getUserMedia screen sharing failed: ${error.name} - ${error.message}`);
          }
          throw error;
        });
    };
  }

  // Centralized handler for screen sharing streams
  function handleScreenShareStream(stream, source) {
    console.debug(`[SCREEN_SHARE_DIAG] Processing stream from ${source} (${activeStreams.length} active)`);

    const electronAPI = window.electronAPI;

    if (!electronAPI) {
      console.error("[SCREEN_SHARE_DIAG] electronAPI not available - cannot notify main process");
      return;
    }

    // Check if we're creating a duplicate session - this could cause issues
    if (isScreenSharing) {
      console.warn(`[SCREEN_SHARE_DIAG] Multiple screen sharing sessions detected - total: ${activeStreams.length + 1}`);
    }

    isScreenSharing = true;
    activeStreams.push(stream);
    
    console.debug(`[SCREEN_SHARE_DIAG] Stream registered (${activeStreams.length} total active)`);

    // Send screen sharing started event
    if (electronAPI.sendScreenSharingStarted) {
      // Prefer the MediaStream's own id when available to avoid collisions
      const sourceId = stream?.id
        ? stream.id
        : `screen-share-${crypto.randomUUID()}`;
      
      console.debug(`[SCREEN_SHARE_DIAG] Sending screen-sharing-started event (preview window will open)`);
      
      electronAPI.sendScreenSharingStarted(sourceId);
      electronAPI.send("active-screen-share-stream", stream);
    }

    // Start UI monitoring for stop sharing buttons
    startUIMonitoring();

    // Track stream and tracks for reference, but don't auto-close popup based on their state
    // Popup window should only close when manually closed or screen sharing explicitly stopped
    const trackingVideoTracks = stream.getVideoTracks();
    trackingVideoTracks.forEach((track, index) => {
      activeMediaTracks.push(track);
      
      track.addEventListener("ended", () => {
        console.debug(`[SCREEN_SHARE_DIAG] Video track ${index} ended (popup remains open)`);
      });
    });
  }

  // Function to handle stream ending - used by UI button detection
  function handleStreamEnd(reason) {
    console.debug(`[SCREEN_SHARE_DIAG] Stream ending: ${reason} (${activeStreams.length} streams, ${activeMediaTracks.length} tracks)`);

    if (isScreenSharing) {
      isScreenSharing = false;
      console.debug("[SCREEN_SHARE_DIAG] Screen sharing stopped");

      const electronAPI = window.electronAPI;
      if (electronAPI?.sendScreenSharingStopped) {
        console.debug(`[SCREEN_SHARE_DIAG] Sending screen-sharing-stopped event (${reason})`);
        electronAPI.sendScreenSharingStopped();
      }

      // Clear active streams and tracks
      activeStreams = [];
      activeMediaTracks = [];
      
      console.debug("[SCREEN_SHARE_DIAG] Cleared all active streams and tracks");
    }
  }

  // Handle stop sharing button click
  function handleStopButtonClick(button) {
    console.debug(`[SCREEN_SHARE_DIAG] Stop sharing button clicked: "${button.textContent?.trim()}"`);    
    setTimeout(() => {
      handleStreamEnd("stop_button_clicked");
    }, 100);
  }

  // Set up monitoring for a single stop button
  function setupStopButtonMonitoring(button) {
    if (!button.dataset.teamsMonitored) {
      button.dataset.teamsMonitored = "true";
      console.debug(`[SCREEN_SHARE_DIAG] Monitoring stop button: "${button.textContent?.trim()}"`);
      
      button.addEventListener("click", () => handleStopButtonClick(button));
    }
  }

  // Process discovered stop sharing buttons
  function processStopSharingButtons() {
    // Look for various "Stop sharing" button patterns
    const stopButtons = [
      ...document.querySelectorAll('[data-tid="stop-sharing-button"]'),
      ...document.querySelectorAll('button[title*="Stop sharing"]'),
      ...document.querySelectorAll('button[aria-label*="Stop sharing"]'),
      // More generic patterns
      ...document.querySelectorAll('button[class*="stop-sharing"]'),
      ...document.querySelectorAll('[id*="stop-sharing"]'),
    ];

    stopButtons.forEach(setupStopButtonMonitoring);
  }

  // Start monitoring UI for "Stop sharing" buttons
  function startUIMonitoring() {
    console.debug("[SCREEN_SHARE_DIAG] Starting UI monitoring for stop buttons");
    
    const observer = new MutationObserver(processStopSharingButtons);

    observer.observe(document.body, { 
      childList: true, 
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'data-tid', 'title', 'aria-label']
    });
  }

  // Initialize monitoring when the page is ready
  function initializeScreenSharingMonitoring() {
    console.debug("[SCREEN_SHARE_DIAG] Initializing screen sharing monitoring");

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", monitorScreenSharing);
    } else {
      monitorScreenSharing();
    }
  }

  initializeScreenSharingMonitoring();
})();