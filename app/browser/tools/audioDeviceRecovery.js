/**
 * AudioDeviceRecovery Browser Tool
 *
 * Keeps Teams working when the set of audio devices changes underneath it.
 * On Linux that happens most often with Bluetooth headsets: PipeWire and
 * PulseAudio switch a headset from the A2DP (music) profile to HFP/HSP
 * (call) when the microphone is opened, and back again when the call ends.
 * On the sound servers shipped by Ubuntu 22.04/24.04 (PulseAudio, PipeWire
 * 1.0) the headset microphone only exists while the call profile is active,
 * so the device Teams selected during a call vanishes as soon as it hangs
 * up. Hot-plugging or re-pairing a headset has the same effect in reverse.
 *
 * Chromium only learns about audio device changes on Linux through udev
 * "sound" subsystem events, which Bluetooth (and any purely PipeWire/
 * PulseAudio) devices never emit. As a result:
 *
 *   - `devicechange` never fires, so Teams keeps a stale device list until
 *     the app is restarted (issues #864, #2168, #2531).
 *   - Teams keeps asking for the vanished device by id, and `getUserMedia`
 *     rejects with NotFoundError / OverconstrainedError / NotReadableError.
 *     The call then joins with no microphone at all.
 *   - `setSinkId` for the vanished speaker rejects with NotFoundError and
 *     ringtones and call audio go nowhere.
 *
 * This tool closes those gaps from the renderer:
 *
 *   1. It polls `enumerateDevices()` and dispatches a synthetic
 *      `devicechange` on `navigator.mediaDevices` when the list differs from
 *      the last one seen, so Teams refreshes its device picker the way it
 *      does on Windows and macOS.
 *   2. It wraps `getUserMedia`: when a request that pins an audio device by
 *      id fails with a device error it is retried once without the id, so
 *      the call gets the system default microphone. With WirePlumber this is
 *      exactly what triggers the headset's switch to the call profile.
 *   3. It wraps `HTMLMediaElement.setSinkId` (and `AudioContext.setSinkId`
 *      where present): a rejected sink is replaced by the default output.
 *
 * Only the failure paths change behaviour; a request that succeeds is passed
 * through untouched, and the original error is rethrown if the fallback
 * fails as well.
 */

const LOG_PREFIX = "[AUDIO_DEVICE_RECOVERY]";
const DEFAULT_POLL_INTERVAL_MS = 5000;

// getUserMedia / setSinkId error names that mean "this particular device is
// not usable right now" rather than "the user said no".
const DEVICE_ERROR_NAMES = new Set([
  "NotFoundError",
  "OverconstrainedError",
  "NotReadableError",
  "AbortError",
]);

const state = {
  lastSignature: null,
  timer: null,
};

function isDeviceError(error) {
  return Boolean(error) && DEVICE_ERROR_NAMES.has(error.name);
}

/**
 * Deep-copies a constraints object well enough for getUserMedia (plain
 * objects, arrays and primitives only), so the retry is not affected by
 * other tools mutating the original in place.
 */
function cloneConstraints(value) {
  if (Array.isArray(value)) {
    return value.map(cloneConstraints);
  }
  if (value && typeof value === "object") {
    const copy = {};
    for (const [key, entry] of Object.entries(value)) {
      copy[key] = cloneConstraints(entry);
    }
    return copy;
  }
  return value;
}

/** True when the audio constraints pin a specific capture device. */
function hasAudioDeviceId(constraints) {
  const audio = constraints?.audio;
  if (!audio || typeof audio !== "object") {
    return false;
  }
  if (audio.deviceId !== undefined) {
    return true;
  }
  if (Array.isArray(audio.advanced) && audio.advanced.some((c) => c && c.deviceId !== undefined)) {
    return true;
  }
  // Legacy Chrome constraint shape still used by parts of Teams.
  if (audio.mandatory && audio.mandatory.sourceId !== undefined) {
    return true;
  }
  return Array.isArray(audio.optional) && audio.optional.some((c) => c && c.sourceId !== undefined);
}

/**
 * Returns a copy of `constraints` with every audio device pin removed, so
 * the browser picks the system default microphone. Other audio constraints
 * (echo cancellation, sample rate, ...) are kept.
 */
function stripAudioDeviceId(constraints) {
  const copy = cloneConstraints(constraints);
  const audio = copy.audio;
  delete audio.deviceId;
  delete audio.groupId;
  if (Array.isArray(audio.advanced)) {
    audio.advanced = audio.advanced.filter((c) => !c || c.deviceId === undefined);
  }
  if (audio.mandatory) {
    delete audio.mandatory.sourceId;
  }
  if (Array.isArray(audio.optional)) {
    audio.optional = audio.optional.filter((c) => !c || c.sourceId === undefined);
  }
  return copy;
}

function deviceSignature(devices) {
  return devices
    .map((d) => `${d.kind}|${d.deviceId}|${d.label}`)
    .sort()
    .join("\n");
}

function dispatchDeviceChange() {
  try {
    navigator.mediaDevices.dispatchEvent(new Event("devicechange"));
  } catch (error) {
    console.debug(`${LOG_PREFIX} Could not dispatch devicechange:`, error.message);
  }
}

/**
 * Re-enumerates devices and, when the list differs from the last snapshot,
 * notifies Teams with a synthetic `devicechange`. Set `notify` to false to
 * just refresh the snapshot (used after a genuine browser event).
 */
async function checkForDeviceChanges(notify = true) {
  let devices;
  try {
    devices = await navigator.mediaDevices.enumerateDevices();
  } catch (error) {
    console.debug(`${LOG_PREFIX} enumerateDevices failed:`, error.message);
    return false;
  }
  const signature = deviceSignature(devices);
  const changed = state.lastSignature !== null && signature !== state.lastSignature;
  state.lastSignature = signature;
  if (changed && notify) {
    console.info(`${LOG_PREFIX} Audio device list changed, notifying Teams`, {
      audioinput: devices.filter((d) => d.kind === "audioinput").length,
      audiooutput: devices.filter((d) => d.kind === "audiooutput").length,
    });
    dispatchDeviceChange();
  }
  return changed;
}

function startDeviceWatcher(intervalMs) {
  if (state.timer) {
    return;
  }
  // A genuine devicechange (e.g. a USB headset, which udev does report)
  // already reached Teams; just resync the snapshot so it is not re-sent.
  navigator.mediaDevices.addEventListener("devicechange", () => {
    checkForDeviceChanges(false);
  });
  checkForDeviceChanges(false);
  state.timer = setInterval(() => {
    checkForDeviceChanges(true);
  }, intervalMs);
}

function patchFunction(object, name, createNewFunction) {
  if (object && typeof object[name] === "function") {
    const original = object[name];
    object[name] = createNewFunction(original);
    console.debug(`${LOG_PREFIX} Patched ${object.constructor?.name || "object"}.${name}`);
    return true;
  }
  return false;
}

function patchGetUserMedia() {
  patchFunction(navigator.mediaDevices, "getUserMedia", function (original) {
    return function getUserMedia(constraints) {
      if (!hasAudioDeviceId(constraints)) {
        return original.call(this, constraints);
      }
      // Snapshot before the inner wrappers (mic constraint overrides etc.)
      // mutate the object.
      const fallback = stripAudioDeviceId(constraints);
      const target = this;
      return original.call(target, constraints).catch((error) => {
        if (!isDeviceError(error)) {
          throw error;
        }
        console.warn(
          `${LOG_PREFIX} Requested microphone is unavailable, retrying with the system default`,
          { error: error.name }
        );
        return original.call(target, fallback).then(
          (stream) => {
            // The pinned device is most likely gone; let Teams re-read the
            // list so its picker matches what is actually in use.
            checkForDeviceChanges(true);
            return stream;
          },
          () => {
            throw error;
          }
        );
      });
    };
  });
}

function makeSetSinkIdWrapper(original) {
  return function setSinkId(sinkId) {
    const target = this;
    const result = original.call(target, sinkId);
    if (!sinkId || !result || typeof result.then !== "function") {
      return result;
    }
    return result.catch((error) => {
      if (!isDeviceError(error)) {
        throw error;
      }
      console.warn(
        `${LOG_PREFIX} Requested speaker is unavailable, falling back to the system default`,
        { error: error.name }
      );
      return original.call(target, "").then(
        () => {
          checkForDeviceChanges(true);
        },
        () => {
          throw error;
        }
      );
    });
  };
}

function patchSetSinkId() {
  if (typeof HTMLMediaElement !== "undefined") {
    patchFunction(HTMLMediaElement.prototype, "setSinkId", makeSetSinkIdWrapper);
  }
  if (typeof AudioContext !== "undefined") {
    patchFunction(AudioContext.prototype, "setSinkId", makeSetSinkIdWrapper);
  }
}

function init(config) {
  const options = config?.media?.audioDeviceRecovery;
  if (!options?.enabled) {
    return;
  }
  if (typeof process !== "undefined" && process.platform !== "linux") {
    // Chromium's own device monitoring is reliable on Windows and macOS.
    return;
  }
  if (!navigator.mediaDevices) {
    console.warn(`${LOG_PREFIX} navigator.mediaDevices unavailable, tool disabled`);
    return;
  }

  try {
    patchGetUserMedia();
    patchSetSinkId();
    if (config.media?.preventDeviceSwitching) {
      console.info(`${LOG_PREFIX} Device watcher disabled by media.preventDeviceSwitching`);
    } else {
      startDeviceWatcher(DEFAULT_POLL_INTERVAL_MS);
    }
    console.info(`${LOG_PREFIX} Audio device recovery active`);
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to initialize:`, error);
  }
}

module.exports = {
  init,
  // Exposed for unit tests.
  _internal: {
    hasAudioDeviceId,
    stripAudioDeviceId,
    deviceSignature,
    isDeviceError,
    checkForDeviceChanges,
    state,
  },
};
