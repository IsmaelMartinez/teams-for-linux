/**
 * OverrideMicConstraints Browser Tool
 *
 * Lets users override the microphone constraints Teams requests via
 * `getUserMedia`. This is the Linux equivalent of the "High fidelity music
 * mode" Microsoft only exposes on Windows Teams: users can turn off
 * noiseSuppression / echoCancellation / autoGainControl at the WebRTC APM
 * layer, or pin channelCount / sampleRate, so external mixers, vocoder
 * voice effects, and sound-pad effects reach the other meeting participants
 * without being gated as "non-speech noise".
 *
 * Related: disableAutogain.js already toggles autoGainControl through the
 * same getUserMedia / applyConstraints surface. This tool generalises that
 * plumbing to the other standard audio constraints and to optional numeric
 * ones. Omitting a key in config means "do not touch it" (important so a
 * user who only wants to disable noise suppression doesn't accidentally
 * pin a sample rate their device can't honour).
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
  // `mandatory` options throw errors for unknown keys, so set under optional.
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

// Maps modern constraint names to their legacy goog*-prefixed equivalents.
// Only the three boolean APM toggles have legacy aliases; channelCount and
// sampleRate use the same name in both formats.
const LEGACY_CONSTRAINT_NAMES = {
  echoCancellation: ["googEchoCancellation", "googEchoCancellation2"],
  noiseSuppression: ["googNoiseSuppression", "googNoiseSuppression2"],
  autoGainControl: ["googAutoGainControl", "googAutoGainControl2"],
};

function applyOverride(audio, name, value, isLegacy) {
  if (isLegacy) {
    const legacyNames = LEGACY_CONSTRAINT_NAMES[name];
    if (legacyNames) {
      for (const legacyName of legacyNames) {
        setLegacyChromeConstraint(audio, legacyName, value);
      }
    } else {
      // Numeric constraints (channelCount, sampleRate) keep the same name.
      setLegacyChromeConstraint(audio, name, value);
    }
  } else {
    setConstraint(audio, name, value);
  }
}

const applyOverrideMicConstraintsPatch = function (overrides) {
  function overrideConstraints(constraints) {
    if (!constraints?.audio) {
      return;
    }
    if (typeof constraints.audio !== "object") {
      constraints.audio = {};
    }
    const isLegacy = Boolean(
      constraints.audio.optional || constraints.audio.mandatory
    );
    console.debug(
      "[OVERRIDE_MIC_CONSTRAINTS] Applying overrides",
      overrides,
      "legacy:",
      isLegacy
    );
    for (const [name, value] of Object.entries(overrides)) {
      applyOverride(constraints.audio, name, value, isLegacy);
    }
  }

  function patchFunction(object, name, createNewFunction) {
    if (name in object) {
      const original = object[name];
      object[name] = createNewFunction(original);
      console.debug(
        `[OVERRIDE_MIC_CONSTRAINTS] Patched ${
          object.constructor?.name || "object"
        }.${name}`
      );
    }
  }

  // Patch modern getUserMedia API
  patchFunction(navigator.mediaDevices, "getUserMedia", function (original) {
    return function getUserMedia(constraints) {
      overrideConstraints(constraints);
      return original.call(this, constraints);
    };
  });

  function patchDeprecatedGetUserMedia(original) {
    return function getUserMedia(constraints, success, error) {
      overrideConstraints(constraints);
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
        // applyConstraints is called per-track, so `this.kind` tells us the
        // track type. We only want to touch audio tracks.
        if (this.kind === "audio" && constraints) {
          // Wrap in an audio-shaped object so overrideConstraints can
          // reuse the same path. Don't mutate the original reference.
          const wrapper = { audio: constraints };
          overrideConstraints(wrapper);
        }
        return original.call(this, constraints);
      };
    }
  );

  console.debug(
    "[OVERRIDE_MIC_CONSTRAINTS] Successfully initialized - audio constraints will be overridden"
  );
};

/**
 * Build the overrides object from config.
 * Only includes keys that are actually set (non-undefined), so unset keys
 * are left untouched by the constraint patch.
 */
function buildOverrides(micOverride) {
  const overrides = {};
  const candidates = [
    "echoCancellation",
    "noiseSuppression",
    "autoGainControl",
    "channelCount",
    "sampleRate",
  ];
  for (const key of candidates) {
    if (micOverride[key] !== undefined) {
      overrides[key] = micOverride[key];
    }
  }
  return overrides;
}

/**
 * Initialize the overrideMicConstraints tool
 * @param {Object} config - Application configuration
 */
function init(config) {
  const micOverride = config.media?.microphone?.overrideConstraints;
  if (!micOverride || !micOverride.enabled) {
    return;
  }

  const overrides = buildOverrides(micOverride);
  if (Object.keys(overrides).length === 0) {
    console.debug(
      "[OVERRIDE_MIC_CONSTRAINTS] Enabled but no constraint keys set; nothing to do"
    );
    return;
  }

  try {
    applyOverrideMicConstraintsPatch(overrides);
    console.info(
      "[OVERRIDE_MIC_CONSTRAINTS] Microphone constraints are being overridden:",
      overrides
    );
  } catch (error) {
    console.error(
      "[OVERRIDE_MIC_CONSTRAINTS] Failed to initialize:",
      error
    );
  }
}

module.exports = { init };
