(function () {
  let isScreenSharing = false;
  let activeStreams = [];
  let activeMediaTracks = [];

  // Monitor for screen sharing streams and detect when they stop
  function monitorScreenSharing() {
    // Hook into getDisplayMedia for screen sharing
    const originalGetDisplayMedia = navigator.mediaDevices.getDisplayMedia.bind(
      navigator.mediaDevices
    );

    navigator.mediaDevices.getDisplayMedia = function (constraints) {
      // v2.5.4: Prevent audio echo by disabling audio in screen sharing constraints
      const modifiedConstraints = { ...constraints };
      if (modifiedConstraints.audio !== false) {
        console.debug("[SCREEN_SHARE_ECHO] Disabling audio in getDisplayMedia to prevent echo");
        modifiedConstraints.audio = false;
      }
      
      return originalGetDisplayMedia(modifiedConstraints)
        .then((stream) => {
          console.debug("Screen sharing stream detected via getDisplayMedia");
          handleScreenShareStream(stream, "getDisplayMedia");
          return stream;
        })
        .catch((error) => {
          console.error("getDisplayMedia error:", error);
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

      // v2.5.4: Prevent audio echo by disabling audio in screen sharing constraints
      const modifiedConstraints = { ...constraints };
      if (isScreenShare && modifiedConstraints.audio !== false) {
        console.debug("[SCREEN_SHARE_ECHO] Disabling audio in getUserMedia screen share to prevent echo");
        modifiedConstraints.audio = false;
      }

      return originalGetUserMedia(modifiedConstraints)
        .then((stream) => {
          if (isScreenShare) {
            console.debug("Screen sharing stream detected");
            handleScreenShareStream(stream, "getUserMedia");
          }

          return stream;
        })
        .catch((error) => {
          console.error("getUserMedia error:", error);
          throw error;
        });
    };
  }

  // Centralized handler for screen sharing streams
  function handleScreenShareStream(stream, source) {
    console.debug("Screen sharing stream started from:", source);
    
    // v2.5.3: Enhanced logging for audio duplication diagnosis
    console.debug(`[SCREEN_SHARE_DIAG] Stream created - ID: ${stream.id}, Source: ${source}`);
    console.debug(`[SCREEN_SHARE_DIAG] Current active streams count: ${activeStreams.length}`);
    console.debug(`[SCREEN_SHARE_DIAG] isScreenSharing state: ${isScreenSharing}`);
    
    // v2.5.4: Enhanced audio track analysis for echo diagnosis (#1800)
    const audioTracks = stream.getAudioTracks();
    const videoTracks = stream.getVideoTracks();
    console.debug(`[SCREEN_SHARE_ECHO] Stream tracks - Audio: ${audioTracks.length}, Video: ${videoTracks.length}`);
    
    if (audioTracks.length > 0) {
      console.warn(`[SCREEN_SHARE_ECHO] UNEXPECTED: Audio tracks still present despite audio blocking!`, {
        audioTrackCount: audioTracks.length,
        streamSource: source,
        streamId: stream.id,
        note: 'This suggests the audio blocking may not be working correctly'
      });
      
      audioTracks.forEach((track, index) => {
        const trackInfo = {
          index: index,
          trackId: track.id,
          enabled: track.enabled,
          muted: track.muted,
          readyState: track.readyState,
          kind: track.kind,
          label: track.label
        };
        console.debug(`[SCREEN_SHARE_ECHO] Audio track ${index} details:`, trackInfo);
        
        // Check if this audio track might cause echo
        if (track.enabled && !track.muted && track.readyState === 'live') {
          console.error(`[SCREEN_SHARE_ECHO] CRITICAL: Active audio track still present despite blocking!`, trackInfo);
        }
      });
    } else {
      console.debug(`[SCREEN_SHARE_ECHO] SUCCESS: No audio tracks detected - echo prevention working`);
    }

    const electronAPI = window.electronAPI;

    if (!electronAPI) {
      console.error("electronAPI not available");
      return;
    }

    // Check if we're creating a duplicate session
    if (isScreenSharing) {
      console.warn(`[SCREEN_SHARE_DIAG] WARNING: Screen sharing already active! This might create duplicate sessions.`);
      console.debug(`[SCREEN_SHARE_DIAG] Previous active streams: ${activeStreams.map(s => s.id).join(', ')}`);
    }

    isScreenSharing = true;
    activeStreams.push(stream);
    
    console.debug(`[SCREEN_SHARE_DIAG] Stream added to activeStreams. New count: ${activeStreams.length}`);

    // Send screen sharing started event
    if (electronAPI.sendScreenSharingStarted) {
      // Prefer the MediaStream's own id when available to avoid collisions
      const sourceId = stream?.id
        ? stream.id
        : `screen-share-${crypto.randomUUID()}`;
      electronAPI.sendScreenSharingStarted(sourceId);
      electronAPI.send("active-screen-share-stream", stream);
    }

    // Start UI monitoring for stop sharing buttons
    startUIMonitoring();

    // Track stream and tracks for reference, but don't auto-close popup based on their state
    // Popup window should only close when manually closed or screen sharing explicitly stopped
    const trackingVideoTracks = stream.getVideoTracks();
    activeMediaTracks.push(...trackingVideoTracks);

    // Optional: Log when tracks end (for debugging, doesn't affect popup)
    trackingVideoTracks.forEach((track, index) => {
      track.addEventListener("ended", () => {
        console.debug("Video track", index, "ended (popup remains open)");
      });
    });
  }

  // Function to handle stream ending - used by UI button detection
  function handleStreamEnd(reason) {
    console.debug("Stream ending detected, reason:", reason);
    
    // v2.5.3: Enhanced logging for stream ending diagnosis
    console.debug(`[SCREEN_SHARE_DIAG] Stream ending - Reason: ${reason}`);
    console.debug(`[SCREEN_SHARE_DIAG] Active streams before cleanup: ${activeStreams.length}`);
    console.debug(`[SCREEN_SHARE_DIAG] Active streams IDs: ${activeStreams.map(s => s.id).join(', ')}`);
    console.debug(`[SCREEN_SHARE_DIAG] Active media tracks: ${activeMediaTracks.length}`);

    if (isScreenSharing) {
      isScreenSharing = false;
      console.debug(`[SCREEN_SHARE_DIAG] Screen sharing state set to false`);

      const electronAPI = window.electronAPI;
      if (electronAPI?.sendScreenSharingStopped) {
        electronAPI.sendScreenSharingStopped();
      }

      // Clear active streams and tracks
      activeStreams = [];
      activeMediaTracks = [];
    }
  }

  // Monitor Teams UI for stop sharing actions
  function startUIMonitoring() {
    console.debug("Starting UI monitoring for screen sharing controls");

    // Look for common screen sharing control selectors
    const stopSharingSelectors = [
      '[data-tid*="stop-share"]',
      '[data-tid*="stopShare"]',
      '[data-tid*="screen-share"][data-tid*="stop"]',
      'button[title*="Stop sharing"]',
      'button[aria-label*="Stop sharing"]',
      '[data-tid="call-screen-share-stop-button"]',
      '[data-tid="desktop-share-stop-button"]',
      ".ts-calling-screen-share-stop-button",
      'button[data-testid*="stop-sharing"]',
      '[data-tid*="share"] button',
      ".share-stop-button",
      '[aria-label*="share"]',
      '[title*="share"]',
      '[data-tid*="hangup"]',
      '[data-tid*="call-end"]',
      'button[data-tid="call-hangup"]',
    ];

    // Monitor for clicks on stop sharing buttons
    function addStopSharingListeners() {
      let foundButtons = 0;

      foundButtons = monitorScreenSharingButtons(
        stopSharingSelectors,
        foundButtons,
        handleStopSharing
      );

      if (foundButtons > 0) {
        console.debug(
          "Added stop sharing listeners to",
          foundButtons,
          "buttons"
        );
      }
    }

    // Handle stop sharing button clicks
    function handleStopSharing(event) {
      console.debug("Stop sharing button clicked", event);

      if (isScreenSharing) {
        // Force stop all active media tracks
        terminateActiveStreams(); // Small delay to let Teams process the stop action
      }
    }

    // Monitor for DOM changes and add listeners to new buttons
    const observer = new MutationObserver((mutations) => {
      let shouldCheckForButtons = false;
      mutations.forEach((mutation) => {
        if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
          shouldCheckForButtons = true;
        }
      });

      if (shouldCheckForButtons) {
        addStopSharingListeners();
      }
    });

    // Start observing
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Initial check
    addStopSharingListeners();

    // Periodic check as fallback
    const checkInterval = setInterval(() => {
      if (isScreenSharing) {
        addStopSharingListeners();
      } else {
        clearInterval(checkInterval);
      }
    }, 2000);
  }

  // Initialize monitoring
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      monitorScreenSharing();
    });
  } else {
    monitorScreenSharing();
  }

  function monitorScreenSharingButtons(
    stopSharingSelectors,
    foundButtons,
    handleStopSharing
  ) {
    stopSharingSelectors.forEach((selector) => {
      const elements = document.querySelectorAll(selector);

      elements.forEach((element) => {
        if (!element.hasAttribute("data-screen-share-monitored")) {
          foundButtons++;
          element.setAttribute("data-screen-share-monitored", "true");
          element.addEventListener("click", handleStopSharing);
        }
      });
    });
    return foundButtons;
  }

  function terminateActiveStreams() {
    activeMediaTracks.forEach((track) => {
      track.stop();
    });

    // Force stop all active streams
    activeStreams.forEach((stream) => {
      stream.getTracks().forEach((track) => {
        track.stop();
      });
    });

    setTimeout(() => {
      handleStreamEnd("ui-button-click");
    }, 500);
  }
})();
