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
      return originalGetDisplayMedia(constraints)
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
      // Enhanced logging for audio echo debugging
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
        console.debug("[Screen Share Audio Debug] getUserMedia called for screen sharing:", {
          audioRequested: !!constraints.audio,
          audioConstraints: constraints.audio,
          videoRequested: !!constraints.video,
          videoConstraints: {
            chromeMediaSource: constraints.video?.chromeMediaSource || constraints.video?.mandatory?.chromeMediaSource,
            chromeMediaSourceId: constraints.video?.chromeMediaSourceId || constraints.video?.mandatory?.chromeMediaSourceId,
            deviceId: constraints.video?.deviceId,
            mandatory: constraints.video?.mandatory
          },
          allConstraints: JSON.stringify(constraints, null, 2),
        });
      }
      
      return originalGetUserMedia(constraints)
        .then((stream) => {
          if (isScreenShare) {
            console.debug("[Screen Share Audio Debug] Screen sharing stream received from getUserMedia");
            handleScreenShareStream(stream, "getUserMedia");
          }

          return stream;
        })
        .catch((error) => {
          if (isScreenShare) {
            console.error("[Screen Share Audio Debug] getUserMedia error for screen sharing:", error);
          } else {
            console.error("[Screen Share Audio Debug] getUserMedia error:", error);
          }
          throw error;
        });
    };
  }

  // Centralized handler for screen sharing streams
  function handleScreenShareStream(stream, source) {
    console.debug("[Screen Share Audio Debug] Stream started from:", source);
    
    // Log detailed stream information for audio echo debugging
    const audioTracks = stream.getAudioTracks();
    const videoTracks = stream.getVideoTracks();
    
    console.debug("[Screen Share Audio Debug] Stream details:", {
      streamId: stream.id,
      source: source,
      audioTracks: audioTracks.length,
      videoTracks: videoTracks.length,
      audioTrackDetails: audioTracks.map(track => ({
        id: track.id,
        kind: track.kind,
        label: track.label,
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState
      })),
      videoTrackDetails: videoTracks.map(track => ({
        id: track.id,
        kind: track.kind,
        label: track.label,
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState
      })),
      timestamp: new Date().toISOString()
    });

    const electronAPI = window.electronAPI;

    if (!electronAPI) {
      console.error("electronAPI not available");
      return;
    }

    isScreenSharing = true;
    activeStreams.push(stream);

    // Send screen sharing started event
    if (electronAPI.sendScreenSharingStarted) {
      // Prefer the MediaStream's own id when available to avoid collisions
      const sourceId = stream?.id
        ? stream.id
        : `screen-share-${crypto.randomUUID()}`;
      console.debug("[Screen Share Audio Debug] Sending screen sharing started event:", {
        sourceId: sourceId,
        originalStreamId: stream.id
      });
      electronAPI.sendScreenSharingStarted(sourceId);
      electronAPI.send("active-screen-share-stream", stream);
    }

    // Start UI monitoring for stop sharing buttons
    startUIMonitoring();

    // Track stream and tracks for reference, but don't auto-close popup based on their state
    // Popup window should only close when manually closed or screen sharing explicitly stopped
    const videoTracks = stream.getVideoTracks();
    const audioTracks = stream.getAudioTracks();
    
    activeMediaTracks.push(...videoTracks);
    activeMediaTracks.push(...audioTracks);

    // Enhanced logging for track monitoring (especially audio for echo debugging)
    videoTracks.forEach((track, index) => {
      console.debug("[Screen Share Audio Debug] Video track added:", {
        index: index,
        trackId: track.id,
        label: track.label,
        enabled: track.enabled
      });
      
      track.addEventListener("ended", () => {
        console.debug("[Screen Share Audio Debug] Video track ended:", {
          index: index,
          trackId: track.id,
          reason: "track ended event"
        });
      });
      
      track.addEventListener("mute", () => {
        console.debug("[Screen Share Audio Debug] Video track muted:", track.id);
      });
      
      track.addEventListener("unmute", () => {
        console.debug("[Screen Share Audio Debug] Video track unmuted:", track.id);
      });
    });

    // Audio track monitoring - critical for echo debugging
    audioTracks.forEach((track, index) => {
      console.debug("[Screen Share Audio Debug] Audio track detected (potential echo source):", {
        index: index,
        trackId: track.id,
        label: track.label,
        enabled: track.enabled,
        muted: track.muted,
        kind: track.kind,
        readyState: track.readyState,
        warning: "Audio track in screen share may cause echo!"
      });
      
      track.addEventListener("ended", () => {
        console.debug("[Screen Share Audio Debug] Audio track ended:", {
          index: index,
          trackId: track.id,
          reason: "track ended event"
        });
      });
      
      track.addEventListener("mute", () => {
        console.warn("[Screen Share Audio Debug] Audio track muted (may reduce echo):", track.id);
      });
      
      track.addEventListener("unmute", () => {
        console.warn("[Screen Share Audio Debug] Audio track unmuted (may cause echo):", track.id);
      });
    });
    
    // Log if audio tracks are present - this is a key indicator for echo potential
    if (audioTracks.length > 0) {
      console.warn("[Screen Share Audio Debug] WARNING: Screen sharing stream contains audio tracks!", {
        audioTrackCount: audioTracks.length,
        message: "This may cause audio echo in Teams calls",
        recommendation: "Consider implementing audio track filtering",
        timestamp: new Date().toISOString()
      });
    }
  }

  // Function to handle stream ending - used by UI button detection
  function handleStreamEnd(reason) {
    console.debug("Stream ending detected, reason:", reason);

    if (isScreenSharing) {
      isScreenSharing = false;

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
