(function () {
  let isScreenSharing = false;
  let activeStreams = [];
  let activeMediaTracks = [];
  let uiObserver = null;
  let periodicCheckInterval = null;
  let streamInactiveHandlers = [];
  let activeFrameRelay = null;

  // Known translations of "Stop sharing" / "Stop presenting" button text.
  // Used as fallback when CSS attribute selectors don't match (non-English locales).
  // Issue #2209: English-only selectors caused thumbnail to never auto-close in French.
  const STOP_SHARING_TRANSLATIONS = [
    "stop sharing", "stop presenting",
    "arrêter le partage", "arrêter la présentation",
    "freigabe beenden", "präsentation beenden",
    "dejar de compartir", "dejar de presentar",
    "parar de compartilhar", "parar de partilhar",
    "interrompi condivisione", "interrompi presentazione",
    "delen stoppen", "stoppen met delen",
    "zatrzymaj udostępnianie",
    "paylaşmayı durdur",
    "sluta dela",
    "slutt å dele",
    "stop deling",
    "lopeta jakaminen",
    "zastavit sdílení",
    "megosztás leállítása",
    "opriți partajarea",
    "停止共享", "停止共用",
    "共有を停止",
    "공유 중지",
    "остановить демонстрацию", "прекратить показ",
    "إيقاف المشاركة",
    "зупинити демонстрацію",
    "หยุดแชร์",
    "ngừng chia sẻ",
    "berhenti berbagi",
    "הפסקת שיתוף",
  ];

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
    // Guard against missing mediaDevices API (e.g. on Chrome error pages)
    if (!navigator.mediaDevices?.getDisplayMedia) {
      console.debug("[SCREEN_SHARE_DIAG] navigator.mediaDevices.getDisplayMedia not available, skipping");
      return;
    }

    // Hook into getDisplayMedia for screen sharing
    const originalGetDisplayMedia = navigator.mediaDevices.getDisplayMedia.bind(
      navigator.mediaDevices
    );

    // Also hook into getUserMedia for fallback detection
    const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices
    );

    navigator.mediaDevices.getDisplayMedia = function (constraints) {
      console.debug("[SCREEN_SHARE_DIAG] getDisplayMedia intercepted");

      // Force disable all audio in screen sharing to prevent echo issues
      disableAudioInConstraints(constraints, "getDisplayMedia");

      // Delegate picking to the platform's native flow:
      //   X11 / Win / macOS: Chromium calls our setDisplayMediaRequestHandler,
      //     which opens the in-app StreamSelector.
      //   Wayland with WebRTCPipeWireCapturer: Chromium calls xdg-desktop-portal
      //     directly (setDisplayMediaRequestHandler is bypassed).
      // Either way we end up here with a single captured MediaStream and avoid
      // the double-picker we used to see on Wayland (#2534).
      return originalGetDisplayMedia(constraints)
        .then((stream) => {
          console.debug(`[SCREEN_SHARE_DIAG] Screen sharing started (${stream.getAudioTracks().length}a/${stream.getVideoTracks().length}v)`);
          handleScreenShareStream(stream, "getDisplayMedia");
          return stream;
        })
        .catch((error) => {
          console.error(`[SCREEN_SHARE_DIAG] getDisplayMedia failed: ${error.name} - ${error.message}`);
          throw error;
        });
    };

    navigator.mediaDevices.getUserMedia = function (constraints) {
      // Check if this is a screen sharing stream - handle multiple constraint formats
      // IMPORTANT: Only match actual desktop capture, not regular video calls with deviceId
      const isScreenShare =
        constraints &&
        constraints.video &&
        // Electron format - explicit desktop capture
        (constraints.video.chromeMediaSource === "desktop" ||
          constraints.video.mandatory?.chromeMediaSource === "desktop" ||
          // Teams format - explicit screen share source ID
          constraints.video.chromeMediaSourceId ||
          constraints.video.mandatory?.chromeMediaSourceId);

      // NOTE: Removed generic deviceId.exact check - it was too broad and matched
      // regular video calls where Teams specifies which camera to use, causing
      // audio to be disabled incorrectly (issues #1871, #1896)

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

    const electronAPI = globalThis.electronAPI;

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

    // Send screen sharing started event. Main opens the preview window if not
    // already open, then posts a MessagePort to both sides so the preview can
    // receive VideoFrames from this stream without a second capture (#2534).
    if (electronAPI.sendScreenSharingStarted) {
      console.debug(`[SCREEN_SHARE_DIAG] Sending screen-sharing-started event (preview window will open)`);
      electronAPI.sendScreenSharingStarted(null);
    }

    // Start relaying VideoFrames to the preview window once the port arrives.
    startVideoFrameRelay(stream);

    // Monitor stream inactive event (fires when all tracks end)
    const inactiveHandler = () => {
      console.debug("[SCREEN_SHARE_DIAG] Stream became inactive");
      if (isScreenSharing) {
        handleStreamEnd("stream_inactive");
      }
    };
    stream.addEventListener("inactive", inactiveHandler);
    streamInactiveHandlers.push({ stream, handler: inactiveHandler });

    // Start UI monitoring for stop sharing buttons
    startUIMonitoring();

    // Start periodic fallback check for track state and button detection
    startPeriodicCheck();

    // Track stream and tracks for cleanup when they end
    const trackingVideoTracks = stream.getVideoTracks();
    for (const [index, track] of trackingVideoTracks.entries()) {
      activeMediaTracks.push(track);

      track.addEventListener("ended", () => {
        console.debug(`[SCREEN_SHARE_DIAG] Video track ${index} ended`);
        // Check if all tracks have ended to trigger cleanup
        const allTracksEnded = activeMediaTracks.every(t => t.readyState === "ended");
        if (allTracksEnded && isScreenSharing) {
          console.debug("[SCREEN_SHARE_DIAG] All video tracks ended, stopping screen sharing");
          handleStreamEnd("video_track_ended");
        }
      });
    }
  }

  // Relay periodic snapshots of the captured screen-share track to the preview
  // window over a MessagePort the main process hands us via window.postMessage
  // (see app/browser/preload.js). Lets the preview render the same source
  // without a second getUserMedia/portal call. We use ImageBitmap transfer
  // rather than VideoFrame because VideoFrame's underlying GPU buffer cannot
  // be deserialised across BrowserWindow renderer processes - the first
  // iteration of this spike hit `messageerror` on every frame for that exact
  // reason. ImageBitmap transfer is cross-process safe.
  function startVideoFrameRelay(stream) {
    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) {
      console.debug("[SCREEN_SHARE_DIAG] No video track on stream - preview relay disabled");
      return;
    }

    // Tear down any prior relay before starting a new one (in case Teams
    // started a second share without our 'inactive' fire-and-forget cleanup).
    stopVideoFrameRelay();

    // Thumbnail-rate is fine for a "what am I sharing" preview; keeps the
    // per-tick canvas draw + ImageBitmap transfer cheap.
    const FPS = 5;
    const FRAME_INTERVAL_MS = Math.round(1000 / FPS);
    // Cap the longest edge of the snapshot. The preview window is ~320x180
    // by default, so we lose nothing by scaling down before transferring.
    const MAX_EDGE = 320;

    let port = null;
    let stopped = false;
    let portListener = null;
    let videoEl = null;
    let canvas = null;
    let canvasCtx = null;
    let intervalId = null;
    let frameCount = 0;

    const stop = () => {
      if (stopped) return;
      stopped = true;
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      if (portListener) {
        window.removeEventListener("message", portListener);
        portListener = null;
      }
      if (videoEl) {
        try {
          videoEl.srcObject = null;
          videoEl.remove();
        } catch { /* noop */ }
        videoEl = null;
      }
      canvas = null;
      canvasCtx = null;
      if (port) {
        try { port.close(); } catch { /* noop */ }
        port = null;
      }
    };

    activeFrameRelay = { stop };

    const startSnapshotTicks = () => {
      const srcWidth = videoEl.videoWidth || 1280;
      const srcHeight = videoEl.videoHeight || 720;
      const scale = Math.min(1, MAX_EDGE / Math.max(srcWidth, srcHeight));
      const targetWidth = Math.max(1, Math.round(srcWidth * scale));
      const targetHeight = Math.max(1, Math.round(srcHeight * scale));
      try {
        canvas = new OffscreenCanvas(targetWidth, targetHeight);
        canvasCtx = canvas.getContext("2d");
      } catch (error) {
        console.error(`[SCREEN_SHARE_DIAG] OffscreenCanvas setup failed: ${error.name} - ${error.message}`);
        stop();
        return;
      }
      intervalId = setInterval(() => {
        if (stopped || !port || !canvas || !canvasCtx || videoTrack.readyState === "ended") {
          stop();
          return;
        }
        try {
          canvasCtx.drawImage(videoEl, 0, 0, targetWidth, targetHeight);
          const bitmap = canvas.transferToImageBitmap();
          port.postMessage(bitmap, [bitmap]);
          frameCount++;
          if (frameCount === 1) {
            console.debug(`[SCREEN_SHARE_DIAG] First preview snapshot posted (${targetWidth}x${targetHeight} @ ${FPS}fps)`);
          }
        } catch (error) {
          console.error(`[SCREEN_SHARE_DIAG] Snapshot relay tick failed: ${error.name} - ${error.message}`);
          stop();
        }
      }, FRAME_INTERVAL_MS);
    };

    portListener = (event) => {
      if (event.source !== window) return;
      if (event.data !== "screen-share-port") return;
      const receivedPort = event.ports?.[0];
      if (!receivedPort) return;
      window.removeEventListener("message", portListener);
      portListener = null;

      if (stopped || !videoTrack || videoTrack.readyState === "ended") {
        try { receivedPort.close(); } catch { /* noop */ }
        return;
      }
      port = receivedPort;

      try {
        // Hidden, muted, off-screen video element so drawImage has something
        // to sample. The track is already playing on Teams' own video element
        // separately; this is a second consumer of the same MediaStreamTrack.
        videoEl = document.createElement("video");
        videoEl.style.cssText = "position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;top:-9999px;left:-9999px;";
        videoEl.muted = true;
        videoEl.autoplay = true;
        videoEl.playsInline = true;
        videoEl.srcObject = new MediaStream([videoTrack]);
        document.body.appendChild(videoEl);

        videoEl.addEventListener(
          "loadedmetadata",
          () => {
            if (stopped) return;
            startSnapshotTicks();
            console.debug("[SCREEN_SHARE_DIAG] Snapshot relay started");
          },
          { once: true }
        );
      } catch (error) {
        console.error(`[SCREEN_SHARE_DIAG] Snapshot relay setup failed: ${error.name} - ${error.message}`);
        stop();
      }
    };

    window.addEventListener("message", portListener);
  }

  function stopVideoFrameRelay() {
    if (activeFrameRelay) {
      activeFrameRelay.stop();
      activeFrameRelay = null;
    }
  }

  // Function to handle stream ending - used by UI button detection
  function handleStreamEnd(reason) {
    console.debug(`[SCREEN_SHARE_DIAG] Stream ending: ${reason} (${activeStreams.length} streams, ${activeMediaTracks.length} tracks)`);

    if (isScreenSharing) {
      isScreenSharing = false;
      console.debug("[SCREEN_SHARE_DIAG] Screen sharing stopped");

      // Clean up monitoring
      stopPeriodicCheck();
      stopUIMonitoring();
      stopVideoFrameRelay();

      const electronAPI = globalThis.electronAPI;
      if (electronAPI?.sendScreenSharingStopped) {
        console.debug(`[SCREEN_SHARE_DIAG] Sending screen-sharing-stopped event (${reason})`);
        electronAPI.sendScreenSharingStopped();
      }

      // Remove stream inactive listeners to prevent memory leaks
      for (const { stream, handler } of streamInactiveHandlers) {
        stream.removeEventListener("inactive", handler);
      }
      streamInactiveHandlers = [];

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

  // Track whether stop button exists in current UI state
  let stopButtonExists = false;

  // Check if a button matches known stop sharing patterns in any language
  function isStopSharingButton(button) {
    const text = (button.textContent || "").trim().toLowerCase();
    const title = (button.getAttribute("title") || "").toLowerCase();
    const ariaLabel = (button.getAttribute("aria-label") || "").toLowerCase();

    return STOP_SHARING_TRANSLATIONS.some(
      (pattern) =>
        text.includes(pattern) ||
        title.includes(pattern) ||
        ariaLabel.includes(pattern)
    );
  }

  // Process discovered stop sharing buttons
  function processStopSharingButtons() {
    const stopButtons = new Set();

    // Fast path: CSS attribute selectors (language-independent + English)
    for (const el of document.querySelectorAll(
      '[data-tid="stop-sharing-button"], ' +
        'button[class*="stop-sharing"], ' +
        '[id*="stop-sharing"], ' +
        'button[title*="Stop sharing"], ' +
        'button[aria-label*="Stop sharing"], ' +
        'button[title*="Stop presenting"], ' +
        'button[aria-label*="Stop presenting"]'
    )) {
      stopButtons.add(el);
    }

    // Fallback: scan buttons for translated text (non-English locales)
    if (stopButtons.size === 0) {
      for (const button of document.querySelectorAll("button")) {
        if (isStopSharingButton(button)) {
          stopButtons.add(button);
        }
      }
    }

    const hadStopButton = stopButtonExists;
    stopButtonExists = stopButtons.size > 0;

    // If stop button was present but now disappeared while screen sharing is active,
    // the meeting likely ended - trigger cleanup
    if (hadStopButton && !stopButtonExists && isScreenSharing) {
      console.debug(
        "[SCREEN_SHARE_DIAG] Stop sharing button disappeared - meeting likely ended"
      );
      handleStreamEnd("meeting_ended_button_removed");
      return;
    }

    for (const button of stopButtons) {
      setupStopButtonMonitoring(button);
    }
  }

  // Start monitoring UI for "Stop sharing" buttons
  function startUIMonitoring() {
    if (uiObserver) return;

    console.debug("[SCREEN_SHARE_DIAG] Starting UI monitoring for stop buttons");

    uiObserver = new MutationObserver(processStopSharingButtons);

    uiObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "data-tid", "title", "aria-label"],
    });

    // Initial check to detect current button state
    processStopSharingButtons();
  }

  // Stop monitoring UI
  function stopUIMonitoring() {
    if (uiObserver) {
      uiObserver.disconnect();
      uiObserver = null;
    }
    stopButtonExists = false;
  }

  // Periodic fallback check for track state and button detection
  function startPeriodicCheck() {
    if (periodicCheckInterval) return;

    periodicCheckInterval = setInterval(() => {
      if (!isScreenSharing) {
        stopPeriodicCheck();
        return;
      }

      // Check if all tracked video tracks have ended (catches missed "ended" events)
      if (
        activeMediaTracks.length > 0 &&
        activeMediaTracks.every((t) => t.readyState === "ended")
      ) {
        console.debug(
          "[SCREEN_SHARE_DIAG] Periodic check: all tracks ended"
        );
        handleStreamEnd("periodic_check_tracks_ended");
        return;
      }

      // Re-run button detection (catches missed mutations)
      processStopSharingButtons();
    }, 5000);
  }

  // Stop periodic check
  function stopPeriodicCheck() {
    if (periodicCheckInterval) {
      clearInterval(periodicCheckInterval);
      periodicCheckInterval = null;
    }
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