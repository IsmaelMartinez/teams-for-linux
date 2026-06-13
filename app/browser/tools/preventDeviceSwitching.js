/**
 * Browser tool to suppress device change events and prevent Teams from auto-switching audio/video devices.
 */
class PreventDeviceSwitching {
  init(config) {
    if (!config?.media?.preventDeviceSwitching) {
      return;
    }

    console.info("[PreventDeviceSwitching] Device change event suppression active");

    try {
      if (navigator.mediaDevices) {
        // Suppress addEventListener('devicechange')
        const originalAddEventListener = navigator.mediaDevices.addEventListener.bind(navigator.mediaDevices);
        navigator.mediaDevices.addEventListener = function (type, listener, options) {
          if (type === "devicechange") {
            console.debug("[PreventDeviceSwitching] Suppressed addEventListener for devicechange");
            return;
          }
          return originalAddEventListener(type, listener, options);
        };

        // Suppress ondevicechange property setter
        Object.defineProperty(navigator.mediaDevices, "ondevicechange", {
          set(fn) {
            console.debug("[PreventDeviceSwitching] Suppressed ondevicechange setter");
          },
          get() {
            return null;
          },
          configurable: true,
          enumerable: true,
        });
      }
    } catch (e) {
      console.warn("[PreventDeviceSwitching] Failed to patch mediaDevices:", e.message);
    }
  }
}

module.exports = new PreventDeviceSwitching();
