/**
 * DisableAutogain Browser Tool
 *
 * Automatically disables microphone auto gain control in Microsoft Teams web interface.
 * This tool intercepts getUserMedia calls and modifies audio constraints to prevent
 * automatic gain adjustment, providing users with manual control over microphone levels.
 *
 * Originally created by Joey Watts
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
  // `mandatory` options throw errors for unknown keys, so avoid that by
  // setting it under optional.
  if (!constraint.optional) {
    constraint.optional = [];
  }
  constraint.optional.push({ [name]: value });
}

function setConstraint(constraint, name, value) {
  if (constraint.advanced) {
    const element = constraint.advanced.find((opt) => name in opt);
    if (element) {
      element[name] = value;
      return;
    }
  }
  constraint[name] = value;
}

const applyDisableAutogainPatch = function () {

  function disableAutogain(constraints) {
    console.debug("[DISABLE_AUTOGAIN] Automatically disabling auto gain control", constraints);
    if (constraints?.audio) {
      if (typeof constraints.audio !== "object") {
        constraints.audio = {};
      }
      if (constraints.audio.optional || constraints.audio.mandatory) {
        // Legacy Chrome constraint format
        setLegacyChromeConstraint(
          constraints.audio,
          "googAutoGainControl",
          false,
        );
        setLegacyChromeConstraint(
          constraints.audio,
          "googAutoGainControl2",
          false,
        );
      } else {
        // Modern MediaStream API format
        setConstraint(constraints.audio, "autoGainControl", false);
      }
    }
  }

  function patchFunction(object, name, createNewFunction) {
    if (name in object) {
      const original = object[name];
      object[name] = createNewFunction(original);
      console.debug(`[DISABLE_AUTOGAIN] Patched ${object.constructor?.name || 'object'}.${name}`);
    }
  }

  // Patch modern getUserMedia API
  patchFunction(navigator.mediaDevices, "getUserMedia", function (original) {
    return function getUserMedia(constraints) {
      disableAutogain(constraints);
      return original.call(this, constraints);
    };
  });

  function patchDeprecatedGetUserMedia(original) {
    return function getUserMedia(constraints, success, error) {
      disableAutogain(constraints);
      return original.call(this, constraints, success, error);
    };
  }

  // Patch legacy getUserMedia APIs
  patchFunction(navigator, "getUserMedia", patchDeprecatedGetUserMedia);
  patchFunction(navigator, "mozGetUserMedia", patchDeprecatedGetUserMedia);
  patchFunction(navigator, "webkitGetUserMedia", patchDeprecatedGetUserMedia);

  // Patch runtime constraint changes
  patchFunction(
    MediaStreamTrack.prototype,
    "applyConstraints",
    function (original) {
      return function applyConstraints(constraints) {
        disableAutogain(constraints);
        return original.call(this, constraints);
      };
    },
  );

  console.debug(
    "[DISABLE_AUTOGAIN] Successfully initialized - microphone auto gain control disabled"
  );
};

/**
 * Initialize the disableAutogain tool
 * @param {Object} config - Application configuration
 */
function init(config) {
  if (!config.disableAutogain) {
    console.debug("[DISABLE_AUTOGAIN] Feature disabled in configuration");
    return;
  }

  try {
    applyDisableAutogainPatch();
    console.info("[DISABLE_AUTOGAIN] Microphone auto gain control has been disabled");
  } catch (error) {
    console.error("[DISABLE_AUTOGAIN] Failed to initialize:", error);
  }
}

module.exports = { init };