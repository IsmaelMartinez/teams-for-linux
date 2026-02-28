/**
 * CameraAspectRatio Browser Tool
 *
 * Fixes camera video stretching when moving Teams between monitors with
 * different orientations (horizontal to vertical or vice versa).
 *
 * This tool monitors for window/monitor changes and reapplies proper aspect
 * ratio constraints to the actual video MediaStreamTrack, fixing the outgoing
 * stream so other meeting participants don't see a stretched video feed.
 */

function applyCameraAspectRatioPatch() {
  const activeVideoTracks = new Set();
  let lastWindowSize = { width: window.innerWidth, height: window.innerHeight };
  const SIGNIFICANT_RESIZE_THRESHOLD = 100;

  /**
   * Fix aspect ratio on a video track by reapplying proper constraints
   */
  async function fixVideoTrackAspectRatio(track) {
    if (track?.readyState !== "live") {
      return;
    }

    try {
      const settings = track.getSettings();
      console.debug("[CAMERA_ASPECT_RATIO] Current track settings:", settings);

      // Get the native camera resolution
      const width = settings.width;
      const height = settings.height;

      if (!width || !height) {
        console.debug("[CAMERA_ASPECT_RATIO] No dimensions available yet");
        return;
      }

      // Calculate the proper aspect ratio from camera's native resolution
      const nativeAspectRatio = width / height;

      console.debug(
        `[CAMERA_ASPECT_RATIO] Track dimensions: ${width}x${height}, aspect ratio: ${nativeAspectRatio.toFixed(2)}`
      );

      // Reapply constraints with explicit aspect ratio
      // This prevents Teams from messing with it when window size changes
      const constraints = {
        width: { ideal: width },
        height: { ideal: height },
        aspectRatio: { exact: nativeAspectRatio },
      };

      await track.applyConstraints(constraints);
      console.debug(
        "[CAMERA_ASPECT_RATIO] Applied aspect ratio constraint:",
        nativeAspectRatio.toFixed(2)
      );
    } catch (error) {
      console.warn(
        "[CAMERA_ASPECT_RATIO] Failed to apply constraints:",
        error.message
      );

      // If exact aspectRatio fails, try with ideal
      try {
        await track.applyConstraints({
          aspectRatio: { ideal: nativeAspectRatio },
        });
        console.debug(
          "[CAMERA_ASPECT_RATIO] Applied ideal aspect ratio:",
          nativeAspectRatio.toFixed(2)
        );
      } catch (fallbackError) {
        console.error(
          "[CAMERA_ASPECT_RATIO] Fallback constraint failed:",
          fallbackError.message
        );
      }
    }
  }

  /**
   * Monitor all video tracks in a MediaStream
   */
  function monitorStream(stream) {
    const videoTracks = stream.getVideoTracks();

    for (const track of videoTracks) {
      if (!activeVideoTracks.has(track)) {
        activeVideoTracks.add(track);
        console.debug(
          `[CAMERA_ASPECT_RATIO] Monitoring video track: ${track.label}`
        );

        // Apply initial fix
        fixVideoTrackAspectRatio(track);

        // Clean up when track ends
        track.addEventListener("ended", () => {
          activeVideoTracks.delete(track);
          console.debug(
            `[CAMERA_ASPECT_RATIO] Track ended: ${track.label}`
          );
        });
      }
    }
  }

  /**
   * Intercept getUserMedia to monitor camera streams
   */
  function interceptGetUserMedia() {
    const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices
    );

    navigator.mediaDevices.getUserMedia = async function (constraints) {
      const stream = await originalGetUserMedia(constraints);

      // Only monitor if this is a camera stream (has video)
      if (constraints?.video) {
        const videoTracks = stream.getVideoTracks();
        if (videoTracks.length > 0) {
          console.debug(
            `[CAMERA_ASPECT_RATIO] Camera stream acquired, monitoring ${videoTracks.length} video track(s)`
          );
          monitorStream(stream);
        }
      }

      return stream;
    };

    console.debug("[CAMERA_ASPECT_RATIO] getUserMedia intercepted");
  }

  /**
   * Handle window resize/monitor change events
   */
  async function handleWindowChange() {
    const currentSize = {
      width: window.innerWidth,
      height: window.innerHeight,
    };

    // Check if this is a significant size change (not just minor resize)
    const widthChange = Math.abs(currentSize.width - lastWindowSize.width);
    const heightChange = Math.abs(currentSize.height - lastWindowSize.height);

    if (widthChange > SIGNIFICANT_RESIZE_THRESHOLD || heightChange > SIGNIFICANT_RESIZE_THRESHOLD) {
      console.debug(
        `[CAMERA_ASPECT_RATIO] Significant window size change detected: ${lastWindowSize.width}x${lastWindowSize.height} -> ${currentSize.width}x${currentSize.height}`
      );

      // Re-fix all active video tracks
      for (const track of activeVideoTracks) {
        await fixVideoTrackAspectRatio(track);
      }

      lastWindowSize = currentSize;
    }
  }

  // Intercept getUserMedia to monitor streams
  interceptGetUserMedia();

  // Monitor window resize (includes monitor changes)
  let resizeTimeout;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(handleWindowChange, 500);
  });

  // Also monitor screen changes directly
  if (window.screen?.addEventListener) {
    window.screen.addEventListener("change", () => {
      console.debug("[CAMERA_ASPECT_RATIO] Screen change detected");
      handleWindowChange();
    });
  }

  // Monitor when window regains focus (often after moving)
  window.addEventListener("focus", () => {
    console.debug("[CAMERA_ASPECT_RATIO] Window focused");
    setTimeout(handleWindowChange, 100);
  });

  console.debug("[CAMERA_ASPECT_RATIO] Successfully initialized");
}

/**
 * Initialize the cameraAspectRatio tool
 * @param {Object} config - Application configuration
 */
function init(config) {
  const aspectRatioConfig = config.media?.camera?.autoAdjustAspectRatio;
  if (!aspectRatioConfig?.enabled) {
    return;
  }

  try {
    applyCameraAspectRatioPatch();
    console.info(
      "[CAMERA_ASPECT_RATIO] Camera aspect ratio fix enabled - will maintain proper aspect ratio when moving between monitors"
    );
  } catch (error) {
    console.error("[CAMERA_ASPECT_RATIO] Failed to initialize:", error);
  }
}

module.exports = { init };
