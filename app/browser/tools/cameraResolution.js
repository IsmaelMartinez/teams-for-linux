/**
 * CameraResolution Browser Tool
 *
 * Removes or overrides video resolution constraints that Microsoft Teams sets
 * when accessing the camera. By default, Teams requests 720p which may not be
 * the native or preferred resolution of the camera.
 *
 * This tool intercepts getUserMedia and applyConstraints calls to modify
 * video constraints, allowing the camera to use higher resolutions.
 */

function setLegacyChromeConstraint(constraint, name, value) {
  if (constraint.mandatory && name in constraint.mandatory) {
    constraint.mandatory[name] = value;
    return;
  }
  if (constraint.optional) {
    const element = constraint.optional.find((opt) => name in opt);
    if (element) {
      element[name] = value;
      return;
    }
  }
  if (!constraint.optional) {
    constraint.optional = [];
  }
  constraint.optional.push({ [name]: value });
}

function removeLegacyChromeConstraint(constraint, name) {
  if (constraint.mandatory && name in constraint.mandatory) {
    delete constraint.mandatory[name];
  }
  if (constraint.optional) {
    constraint.optional = constraint.optional.filter((opt) => !(name in opt));
  }
}

function removeConstraint(constraint, name) {
  if (constraint.advanced) {
    constraint.advanced = constraint.advanced.filter((opt) => !(name in opt));
    if (constraint.advanced.length === 0) {
      delete constraint.advanced;
    }
  }
  delete constraint[name];
}

const applyCameraResolutionPatch = function (resolutionConfig) {
  const mode = resolutionConfig.mode || "remove";
  const targetWidth = resolutionConfig.width;
  const targetHeight = resolutionConfig.height;

  function modifyVideoConstraints(constraints) {
    if (!constraints?.video || typeof constraints.video !== "object") {
      return;
    }

    // Skip if this is a screen sharing request (not a camera request)
    const video = constraints.video;
    if (
      video.chromeMediaSource === "desktop" ||
      video.mandatory?.chromeMediaSource === "desktop" ||
      video.chromeMediaSourceId ||
      video.mandatory?.chromeMediaSourceId
    ) {
      console.debug("[CAMERA_RESOLUTION] Skipping screen sharing constraints");
      return;
    }

    console.debug(
      "[CAMERA_RESOLUTION] Original video constraints:",
      JSON.stringify(constraints.video)
    );

    if (mode === "remove") {
      // Remove all resolution constraints to let camera use native resolution
      if (video.optional || video.mandatory) {
        // Legacy Chrome constraint format
        for (const name of [
          "minWidth",
          "maxWidth",
          "minHeight",
          "maxHeight",
          "width",
          "height",
        ]) {
          removeLegacyChromeConstraint(video, name);
        }
      } else {
        // Modern MediaStream API format
        for (const name of ["width", "height"]) {
          removeConstraint(video, name);
        }
      }
      console.debug(
        "[CAMERA_RESOLUTION] Removed resolution constraints, camera will use native resolution"
      );
    } else if (mode === "override" && targetWidth && targetHeight) {
      // Override with user-specified resolution
      if (video.optional || video.mandatory) {
        // Legacy Chrome constraint format
        setLegacyChromeConstraint(video, "minWidth", targetWidth);
        setLegacyChromeConstraint(video, "maxWidth", targetWidth);
        setLegacyChromeConstraint(video, "minHeight", targetHeight);
        setLegacyChromeConstraint(video, "maxHeight", targetHeight);
      } else {
        // Modern MediaStream API format - use ideal to suggest but not require
        video.width = { ideal: targetWidth };
        video.height = { ideal: targetHeight };
      }
      console.debug(
        `[CAMERA_RESOLUTION] Overriding resolution to ${targetWidth}x${targetHeight}`
      );
    }

    console.debug(
      "[CAMERA_RESOLUTION] Modified video constraints:",
      JSON.stringify(constraints.video)
    );
  }

  function patchFunction(object, name, createNewFunction) {
    if (name in object) {
      const original = object[name];
      object[name] = createNewFunction(original);
      console.debug(
        `[CAMERA_RESOLUTION] Patched ${object.constructor?.name || "object"}.${name}`
      );
    }
  }

  // Patch modern getUserMedia API
  patchFunction(navigator.mediaDevices, "getUserMedia", function (original) {
    return function getUserMedia(constraints) {
      modifyVideoConstraints(constraints);
      return original.call(this, constraints);
    };
  });

  function patchDeprecatedGetUserMedia(original) {
    return function getUserMedia(constraints, success, error) {
      modifyVideoConstraints(constraints);
      return original.call(this, constraints, success, error);
    };
  }

  // Patch legacy getUserMedia APIs
  patchFunction(navigator, "getUserMedia", patchDeprecatedGetUserMedia);
  patchFunction(navigator, "mozGetUserMedia", patchDeprecatedGetUserMedia);
  patchFunction(navigator, "webkitGetUserMedia", patchDeprecatedGetUserMedia);

  // Patch runtime constraint changes on video tracks
  patchFunction(
    MediaStreamTrack.prototype,
    "applyConstraints",
    function (original) {
      return function applyConstraints(constraints) {
        // Only modify if this is a video track
        if (this.kind === "video") {
          // Wrap in a constraints-like object for the modifier function
          const wrappedConstraints = { video: constraints };
          modifyVideoConstraints(wrappedConstraints);
          constraints = wrappedConstraints.video;
        }
        return original.call(this, constraints);
      };
    }
  );

  console.debug(
    `[CAMERA_RESOLUTION] Successfully initialized - mode: ${mode}${mode === "override" ? `, target: ${targetWidth}x${targetHeight}` : ""}`
  );
};

/**
 * Initialize the cameraResolution tool
 * @param {Object} config - Application configuration
 */
function init(config) {
  const resolutionConfig = config.media?.camera?.resolution;
  if (!resolutionConfig?.enabled) {
    return;
  }

  try {
    applyCameraResolutionPatch(resolutionConfig);
    const mode = resolutionConfig.mode || "remove";
    if (mode === "remove") {
      console.info(
        "[CAMERA_RESOLUTION] Camera resolution constraints will be removed"
      );
    } else {
      console.info(
        `[CAMERA_RESOLUTION] Camera resolution will be set to ${resolutionConfig.width}x${resolutionConfig.height}`
      );
    }
  } catch (error) {
    console.error("[CAMERA_RESOLUTION] Failed to initialize:", error);
  }
}

module.exports = { init };
