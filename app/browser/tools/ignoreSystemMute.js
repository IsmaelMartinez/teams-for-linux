/**
 * IgnoreSystemMute Browser Tool
 *
 * Stops Teams' in-app microphone button from following the operating system's
 * microphone mute state on Linux.
 *
 * Why this exists: Chromium's audio service polls the OS capture source every
 * second (services/audio/input_controller.cc, kCheckMutedStateInterval =
 * 1s) and, when the PulseAudio/PipeWire source is muted, reports it to the
 * page as a `MediaStreamTrack` `mute` event with `track.muted === true`.
 * Teams reacts to that signal by toggling its own mute button, so a user who
 * mutes only at the OS level (e.g. a desktop hotkey) sees Teams mute/unmute a
 * second later in lockstep. This is unconditional Chromium behaviour with no
 * feature flag to disable it, and it became noticeable after the Electron 42
 * engine upgrade. See issue referenced in the PR for details.
 *
 * The fix neutralises the OS-mute signal on the *local capture track* only, so
 * Teams keeps its button where the user left it while the OS mute still cuts
 * the audio actually transmitted. Remote participants' tracks (delivered via
 * RTCPeerConnection, not getUserMedia) are never touched, so their genuine
 * mutes remain visible.
 *
 * Implementation mirrors the getUserMedia interception used by
 * disableAutogain.js / overrideMicConstraints.js, patching tracks per-instance
 * as each stream resolves rather than mutating the shared prototype.
 */

const LOG_PREFIX = "[IGNORE_SYSTEM_MUTE]";
const PATCHED_FLAG = "__tflIgnoreSystemMute";

/**
 * Neutralise the OS-driven mute signal on a single local audio capture track.
 * Reports `muted` as false and drops `mute`/`unmute` listener registrations so
 * Teams never observes the system mute toggling.
 * @param {MediaStreamTrack} track - A track from a getUserMedia result.
 */
function patchTrack(track) {
  if (!track || track.kind !== "audio" || track[PATCHED_FLAG]) {
    return;
  }
  track[PATCHED_FLAG] = true;

  try {
    Object.defineProperty(track, "muted", {
      configurable: true,
      enumerable: true,
      get() {
        return false;
      },
    });
  } catch (error) {
    console.debug(`${LOG_PREFIX} Could not redefine muted getter:`, error.message);
  }

  const originalAddEventListener = track.addEventListener?.bind(track);
  if (originalAddEventListener) {
    track.addEventListener = function (type, listener, options) {
      if (type === "mute" || type === "unmute") {
        console.debug(`${LOG_PREFIX} Suppressed addEventListener for ${type}`);
        return;
      }
      return originalAddEventListener(type, listener, options);
    };
  }

  for (const prop of ["onmute", "onunmute"]) {
    try {
      Object.defineProperty(track, prop, {
        configurable: true,
        enumerable: true,
        set() {
          console.debug(`${LOG_PREFIX} Suppressed ${prop} setter`);
        },
        get() {
          return null;
        },
      });
    } catch (error) {
      console.debug(`${LOG_PREFIX} Could not redefine ${prop}:`, error.message);
    }
  }
}

/** Patch every audio track on a resolved MediaStream. */
function patchStream(stream) {
  if (stream && typeof stream.getAudioTracks === "function") {
    for (const track of stream.getAudioTracks()) {
      patchTrack(track);
    }
  }
  return stream;
}

function patchFunction(object, name, createNewFunction) {
  if (object && name in object) {
    const original = object[name];
    object[name] = createNewFunction(original);
    console.debug(
      `${LOG_PREFIX} Patched ${object.constructor?.name || "object"}.${name}`
    );
  }
}

const applyIgnoreSystemMutePatch = function () {
  // Modern promise-based getUserMedia: patch tracks before Teams receives them.
  patchFunction(navigator.mediaDevices, "getUserMedia", function (original) {
    return function getUserMedia(constraints) {
      const result = original.call(this, constraints);
      if (result && typeof result.then === "function") {
        return result.then(patchStream);
      }
      return result;
    };
  });

  // Legacy callback-based getUserMedia: patch tracks in the success callback.
  function patchDeprecatedGetUserMedia(original) {
    return function getUserMedia(constraints, success, error) {
      const wrappedSuccess =
        typeof success === "function"
          ? (stream) => success(patchStream(stream))
          : success;
      return original.call(this, constraints, wrappedSuccess, error);
    };
  }

  patchFunction(navigator, "getUserMedia", patchDeprecatedGetUserMedia);
  patchFunction(navigator, "mozGetUserMedia", patchDeprecatedGetUserMedia);
  patchFunction(navigator, "webkitGetUserMedia", patchDeprecatedGetUserMedia);

  console.debug(
    `${LOG_PREFIX} Successfully initialized - system mute will not toggle Teams`
  );
};

/**
 * Initialize the ignoreSystemMute tool.
 * @param {Object} config - Application configuration.
 */
function init(config) {
  if (!config?.media?.microphone?.ignoreSystemMute) {
    return;
  }

  try {
    applyIgnoreSystemMutePatch();
    console.info(
      `${LOG_PREFIX} Teams mute button will no longer follow the system microphone mute`
    );
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to initialize:`, error);
  }
}

module.exports = { init };
