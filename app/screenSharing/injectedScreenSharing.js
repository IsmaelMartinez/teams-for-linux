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

    navigator.mediaDevices.getDisplayMedia = new Proxy(originalGetDisplayMedia, {
      apply: (target, thisArg, args) => {
        return Reflect.apply(target, thisArg, args)
          .then((stream) => {
            console.debug("Screen sharing stream detected via getDisplayMedia");
            handleScreenShareStream(stream, "getDisplayMedia");
            return stream;
          })
          .catch((error) => {
            console.error("getDisplayMedia error:", error);
            throw error;
          });
      }
    });

    // Also hook into getUserMedia for fallback detection
    const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices
    );

    navigator.mediaDevices.getUserMedia = new Proxy(originalGetUserMedia, {
      apply: (target, thisArg, args) => {
        let constraints = args[0] || {};
        
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

        return Reflect.apply(target, thisArg, [constraints])
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
      }
    });
  }

  // Centralized handler for screen sharing streams
  function handleScreenShareStream(stream, source) {
    console.debug("Screen sharing stream started from:", source);

    const electronAPI = window.electronAPI;

    if (!electronAPI) {
      console.error("electronAPI not available");
      return;
    }

    isScreenSharing = true;
    activeStreams.push(stream);

    // Send screen sharing started event
    if (electronAPI.sendScreenSharingStarted) {
      electronAPI.sendScreenSharingStarted(stream.id || `screen-share-${Date.now()}`);
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
