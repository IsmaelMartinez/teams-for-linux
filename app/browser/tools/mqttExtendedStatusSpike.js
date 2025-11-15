/**
 * MQTT Extended Status - Verification Spike
 *
 * This is a TEMPORARY verification tool to test critical assumptions
 * before implementing the full solution for issue #1938.
 *
 * DO NOT USE IN PRODUCTION - This is for testing only
 *
 * What we're verifying:
 * 1. Teams uses getUserMedia for call streams
 * 2. Teams uses track.enabled (not mute events) for UI buttons
 * 3. Our interception works alongside injectedScreenSharing.js
 * 4. Screen sharing detection logic works correctly
 * 5. Track state changes are detectable
 */

class MQTTExtendedStatusSpike {
  init(config) {
    if (!config.mqttExtendedStatusSpike) {
      console.debug('[MQTT_SPIKE] Spike disabled in config');
      return;
    }

    console.log('[MQTT_SPIKE] ==========================================');
    console.log('[MQTT_SPIKE] MQTT Extended Status Verification Spike');
    console.log('[MQTT_SPIKE] This is for testing only - DO NOT USE IN PRODUCTION');
    console.log('[MQTT_SPIKE] ==========================================');

    this.streams = [];
    this.trackMonitors = new Map();

    this.setupGetUserMediaInterceptor();
  }

  setupGetUserMediaInterceptor() {
    const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);

    navigator.mediaDevices.getUserMedia = (constraints) => {
      console.log('[MQTT_SPIKE] ========================================');
      console.log('[MQTT_SPIKE] getUserMedia INTERCEPTED');
      console.log('[MQTT_SPIKE] Constraints:', JSON.stringify(constraints, null, 2));

      // SPIKE 3: Test screen sharing detection
      const isScreenShare = this.detectScreenShare(constraints);
      console.log('[MQTT_SPIKE] Is Screen Share:', isScreenShare);

      return originalGetUserMedia(constraints).then(stream => {
        console.log('[MQTT_SPIKE] Stream created:', {
          id: stream.id,
          active: stream.active,
          audioTracks: stream.getAudioTracks().length,
          videoTracks: stream.getVideoTracks().length
        });

        if (isScreenShare) {
          console.log('[MQTT_SPIKE] ⚠️  SCREEN SHARE STREAM - Skipping monitoring');
          return stream;
        }

        // Regular call stream - monitor it
        console.log('[MQTT_SPIKE] ✅ REGULAR CALL STREAM - Monitoring');
        this.monitorStream(stream);

        return stream;
      });
    };

    console.log('[MQTT_SPIKE] getUserMedia interceptor installed');
  }

  detectScreenShare(constraints) {
    // Same logic as injectedScreenSharing.js
    return constraints?.video && (
      constraints.video.chromeMediaSource === "desktop" ||
      constraints.video.mandatory?.chromeMediaSource === "desktop" ||
      constraints.video.chromeMediaSourceId ||
      constraints.video.mandatory?.chromeMediaSourceId
    );
  }

  monitorStream(stream) {
    this.streams.push(stream);

    console.log('[MQTT_SPIKE] ----------------------------------------');
    console.log('[MQTT_SPIKE] Monitoring stream:', stream.id);

    // Monitor video tracks (camera)
    stream.getVideoTracks().forEach((track, index) => {
      console.log(`[MQTT_SPIKE] Video Track ${index}:`, {
        id: track.id,
        label: track.label,
        kind: track.kind,
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState
      });

      this.monitorTrack(track, `camera-${index}`);
    });

    // Monitor audio tracks (microphone)
    stream.getAudioTracks().forEach((track, index) => {
      console.log(`[MQTT_SPIKE] Audio Track ${index}:`, {
        id: track.id,
        label: track.label,
        kind: track.kind,
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState
      });

      this.monitorTrack(track, `microphone-${index}`);
    });

    console.log('[MQTT_SPIKE] ----------------------------------------');
  }

  monitorTrack(track, name) {
    console.log(`[MQTT_SPIKE] Setting up monitoring for ${name}`);

    // SPIKE 4: Monitor all possible state change mechanisms

    // Event-based monitoring
    track.addEventListener('ended', () => {
      console.log(`[MQTT_SPIKE] 🔴 EVENT: ${name} ENDED`);
      this.logTrackState(track, name);
    });

    track.addEventListener('mute', () => {
      console.log(`[MQTT_SPIKE] 🔇 EVENT: ${name} MUTED`);
      this.logTrackState(track, name);
    });

    track.addEventListener('unmute', () => {
      console.log(`[MQTT_SPIKE] 🔊 EVENT: ${name} UNMUTED`);
      this.logTrackState(track, name);
    });

    // SPIKE 2: Poll track.enabled to see if Teams uses this
    let lastEnabledState = track.enabled;
    let lastMutedState = track.muted;
    let lastReadyState = track.readyState;

    const pollInterval = setInterval(() => {
      if (track.readyState === 'ended') {
        console.log(`[MQTT_SPIKE] ${name} ended, stopping poll`);
        clearInterval(pollInterval);
        return;
      }

      // Check if enabled changed (CRITICAL TEST)
      if (track.enabled !== lastEnabledState) {
        console.log(`[MQTT_SPIKE] 🎯 PROPERTY CHANGE: ${name}.enabled changed: ${lastEnabledState} → ${track.enabled}`);
        console.log(`[MQTT_SPIKE] ⚠️  THIS CONFIRMS Teams uses track.enabled for UI buttons!`);
        this.logTrackState(track, name);
        lastEnabledState = track.enabled;
      }

      // Check if muted changed (for comparison)
      if (track.muted !== lastMutedState) {
        console.log(`[MQTT_SPIKE] 🔇 PROPERTY CHANGE: ${name}.muted changed: ${lastMutedState} → ${track.muted}`);
        this.logTrackState(track, name);
        lastMutedState = track.muted;
      }

      // Check if readyState changed
      if (track.readyState !== lastReadyState) {
        console.log(`[MQTT_SPIKE] 📊 PROPERTY CHANGE: ${name}.readyState changed: ${lastReadyState} → ${track.readyState}`);
        this.logTrackState(track, name);
        lastReadyState = track.readyState;
      }
    }, 500); // Poll every 500ms

    track.addEventListener('ended', () => clearInterval(pollInterval));

    this.trackMonitors.set(track.id, pollInterval);
  }

  logTrackState(track, name) {
    console.log(`[MQTT_SPIKE] ${name} state:`, {
      enabled: track.enabled,
      muted: track.muted,
      readyState: track.readyState,
      label: track.label
    });
  }
}

module.exports = new MQTTExtendedStatusSpike();
