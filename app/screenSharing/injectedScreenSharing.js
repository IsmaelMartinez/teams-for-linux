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
      console.debug("[SCREEN_SHARE_DIAG] getDisplayMedia call intercepted", {
        hasAudioConstraint: !!constraints?.audio,
        hasVideoConstraint: !!constraints?.video,
        timestamp: new Date().toISOString(),
        activeStreamsCount: activeStreams.length
      });
      
      return originalGetDisplayMedia(constraints)
        .then((stream) => {
          console.debug("[SCREEN_SHARE_DIAG] Screen sharing stream created via getDisplayMedia", {
            streamId: stream.id,
            audioTracks: stream.getAudioTracks().length,
            videoTracks: stream.getVideoTracks().length,
            totalActiveStreams: activeStreams.length
          });
          handleScreenShareStream(stream, "getDisplayMedia");
          return stream;
        })
        .catch((error) => {
          console.error("[SCREEN_SHARE_DIAG] getDisplayMedia failed", {
            error: error.message,
            errorName: error.name,
            constraints: constraints
          });
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
        console.debug("[SCREEN_SHARE_DIAG] getUserMedia call for screen sharing detected", {
          hasAudioConstraint: !!constraints?.audio,
          videoConstraintType: typeof constraints.video,
          chromeMediaSource: constraints.video?.chromeMediaSource,
          chromeMediaSourceId: !!constraints.video?.chromeMediaSourceId,
          activeStreamsCount: activeStreams.length,
          currentScreenSharingState: isScreenSharing
        });
      }

      return originalGetUserMedia(constraints)
        .then((stream) => {
          if (isScreenShare) {
            console.debug("[SCREEN_SHARE_DIAG] Screen sharing stream created via getUserMedia", {
              streamId: stream.id,
              audioTracks: stream.getAudioTracks().length,
              videoTracks: stream.getVideoTracks().length
            });
            handleScreenShareStream(stream, "getUserMedia");
          }

          return stream;
        })
        .catch((error) => {
          if (isScreenShare) {
            console.error("[SCREEN_SHARE_DIAG] getUserMedia screen sharing failed", {
              error: error.message,
              errorName: error.name,
              constraints: constraints
            });
          }
          throw error;
        });
    };
  }

  // Centralized handler for screen sharing streams
  function handleScreenShareStream(stream, source) {
    console.debug("[SCREEN_SHARE_DIAG] Processing new screen sharing stream", {
      streamId: stream.id,
      source: source,
      currentlyScreenSharing: isScreenSharing,
      existingActiveStreams: activeStreams.length,
      existingStreamIds: activeStreams.map(s => s.id)
    });

    const electronAPI = window.electronAPI;

    if (!electronAPI) {
      console.error("[SCREEN_SHARE_DIAG] electronAPI not available - cannot notify main process");
      return;
    }

    // Check if we're creating a duplicate session - this could cause issues
    if (isScreenSharing) {
      console.warn("[SCREEN_SHARE_DIAG] Multiple screen sharing sessions detected", {
        riskLevel: "HIGH - may cause preview window conflicts or audio issues",
        newStreamId: stream.id,
        existingStreamIds: activeStreams.map(s => s.id),
        totalStreams: activeStreams.length + 1
      });
    }

    isScreenSharing = true;
    activeStreams.push(stream);
    
    console.debug("[SCREEN_SHARE_DIAG] Stream registered in active list", {
      streamId: stream.id,
      totalActiveStreams: activeStreams.length,
      isFirstStream: activeStreams.length === 1
    });

    // Send screen sharing started event
    if (electronAPI.sendScreenSharingStarted) {
      // Prefer the MediaStream's own id when available to avoid collisions
      const sourceId = stream?.id
        ? stream.id
        : `screen-share-${crypto.randomUUID()}`;
      
      console.debug("[SCREEN_SHARE_DIAG] Sending screen-sharing-started event", {
        sourceId: sourceId,
        streamId: stream.id,
        willTriggerPreviewWindow: true
      });
      
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
        console.debug("[SCREEN_SHARE_DIAG] Video track ended", {
          trackIndex: index,
          trackId: track.id,
          streamId: stream.id,
          note: "Popup remains open - this is expected behavior"
        });
      });
    });
  }

  // Function to handle stream ending - used by UI button detection
  function handleStreamEnd(reason) {
    console.debug("[SCREEN_SHARE_DIAG] Stream ending detected", {
      reason: reason,
      activeStreamsBefore: activeStreams.length,
      activeStreamIds: activeStreams.map(s => s.id),
      activeMediaTracks: activeMediaTracks.length
    });

    if (isScreenSharing) {
      isScreenSharing = false;
      console.debug("[SCREEN_SHARE_DIAG] Screen sharing state changed to inactive");

      const electronAPI = window.electronAPI;
      if (electronAPI?.sendScreenSharingStopped) {
        console.debug("[SCREEN_SHARE_DIAG] Sending screen-sharing-stopped event", {
          reason: reason,
          willClosePreviewWindow: true
        });
        electronAPI.sendScreenSharingStopped();
      }

      // Clear active streams and tracks
      activeStreams = [];
      activeMediaTracks = [];
      
      console.debug("[SCREEN_SHARE_DIAG] Cleared all active streams and tracks", {
        reason: reason
      });
    }
  }

  // Start monitoring UI for "Stop sharing" buttons
  function startUIMonitoring() {
    console.debug("[SCREEN_SHARE_DIAG] Starting UI monitoring for stop sharing buttons");
    
    const observer = new MutationObserver(() => {
      // Look for various "Stop sharing" button patterns
      const stopButtons = [
        ...document.querySelectorAll('[data-tid="stop-sharing-button"]'),
        ...document.querySelectorAll('button[title*="Stop sharing"]'),
        ...document.querySelectorAll('button[aria-label*="Stop sharing"]'),
        ...document.querySelectorAll('button:has-text("Stop sharing")'),
        // More generic patterns
        ...document.querySelectorAll('button[class*="stop-sharing"]'),
        ...document.querySelectorAll('[id*="stop-sharing"]'),
      ];

      stopButtons.forEach((button) => {
        if (!button.dataset.teamsMonitored) {
          button.dataset.teamsMonitored = "true";
          console.debug("[SCREEN_SHARE_DIAG] Found and monitoring stop sharing button", {
            buttonText: button.textContent?.trim(),
            buttonTitle: button.title,
            buttonId: button.id,
            buttonClass: button.className
          });
          
          button.addEventListener("click", () => {
            console.debug("[SCREEN_SHARE_DIAG] Stop sharing button clicked", {
              buttonText: button.textContent?.trim(),
              triggeredBy: "user interaction"
            });
            
            setTimeout(() => {
              console.debug("[SCREEN_SHARE_DIAG] Processing stop sharing after delay");
              handleStreamEnd("stop_button_clicked");
            }, 100);
          });
        }
      });
    });

    observer.observe(document.body, { 
      childList: true, 
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'data-tid', 'title', 'aria-label']
    });
    
    console.debug("[SCREEN_SHARE_DIAG] UI mutation observer started for stop button detection");
  }

  // Initialize monitoring when the page is ready
  function initializeScreenSharingMonitoring() {
    console.debug("[SCREEN_SHARE_DIAG] Initializing screen sharing monitoring", {
      userAgent: navigator.userAgent,
      hasGetDisplayMedia: !!navigator.mediaDevices?.getDisplayMedia,
      hasGetUserMedia: !!navigator.mediaDevices?.getUserMedia,
      timestamp: new Date().toISOString()
    });

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", monitorScreenSharing);
    } else {
      monitorScreenSharing();
    }
  }

  initializeScreenSharingMonitoring();
})();