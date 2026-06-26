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
 *
 * Clone coverage: Teams does not feed the raw getUserMedia track into its call
 * pipeline; it calls `MediaStreamTrack.clone()` and sends the clone. A clone is
 * a fresh object that does not inherit the per-instance patch, so it would once
 * again follow the OS mute and reintroduce the exact symptom. We therefore also
 * wrap `MediaStreamTrack.prototype.clone` and re-apply the patch to clones, but
 * only when the source track was itself patched, so clones of remote
 * participants' tracks keep their genuine mute state.
 */

const LOG_PREFIX = "[IGNORE_SYSTEM_MUTE]";

// Tracks already patched, kept in a WeakSet so entries are garbage-collected
// with the track and no enumerable marker property is added to the track.
const patchedTracks = new WeakSet();

/**
 * Neutralise the OS-driven mute signal on a single local audio capture track.
 * Reports `muted` as false and drops `mute`/`unmute` listener registrations so
 * Teams never observes the system mute toggling.
 * @param {MediaStreamTrack} track - A track from a getUserMedia result.
 */
function patchTrack(track) {
  if (track?.kind !== "audio" || patchedTracks.has(track)) {
    return track;
  }
  patchedTracks.add(track);

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

  try {
    const originalAddEventListener = track.addEventListener;
    if (typeof originalAddEventListener === "function") {
      // Forward `this` so the override behaves like the native method.
      track.addEventListener = function (type, listener, options) {
        if (type === "mute" || type === "unmute") {
          console.debug(`${LOG_PREFIX} Suppressed addEventListener for ${type}`);
          return;
        }
        return originalAddEventListener.call(this, type, listener, options);
      };
    }
  } catch (error) {
    console.debug(`${LOG_PREFIX} Could not patch addEventListener:`, error.message);
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

  return track;
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

// Wraps a legacy callback-based getUserMedia so tracks are patched in the
// success callback. Module-scoped because it closes over nothing local.
function patchDeprecatedGetUserMedia(original) {
  return function getUserMedia(constraints, success, error) {
    const wrappedSuccess =
      typeof success === "function"
        ? (stream) => success(patchStream(stream))
        : success;
    return original.call(this, constraints, wrappedSuccess, error);
  };
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

  // Legacy callback-based getUserMedia (patchDeprecatedGetUserMedia is hoisted).
  patchFunction(navigator, "getUserMedia", patchDeprecatedGetUserMedia);
  patchFunction(navigator, "mozGetUserMedia", patchDeprecatedGetUserMedia);
  patchFunction(navigator, "webkitGetUserMedia", patchDeprecatedGetUserMedia);

  // Teams clones the capture track before sending it into the call; the clone
  // does not inherit the per-instance patch, so re-apply it to clones of tracks
  // we already patched. Clones of remote tracks stay untouched so their genuine
  // mute remains visible.
  if (typeof MediaStreamTrack !== "undefined") {
    patchFunction(MediaStreamTrack.prototype, "clone", function (original) {
      return function clone() {
        const cloned = original.call(this);
        return patchedTracks.has(this) ? patchTrack(cloned) : cloned;
      };
    });
  }

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
