/**
 * Which webContents an external link (second instance, Join Meeting) opens in.
 *
 * Without multi-account that is the root window's webContents and nothing
 * else changes. With it, the app injects a getter for the active profile's
 * webContents (Profile 0 lives on the root window, every other profile in a
 * WebContentsView, ADR-020). Whatever the getter fails to deliver, whether
 * null, destroyed or throwing, falls back to the root window.
 *
 * @param {() => Electron.WebContents} getRootWebContents
 * @returns {{set: (getter: (() => Electron.WebContents|null)|null) => void,
 *   resolve: () => Electron.WebContents}}
 */
function createDeepLinkTarget(getRootWebContents) {
  let getter = null;

  return {
    set(newGetter) {
      getter = typeof newGetter === "function" ? newGetter : null;
    },

    resolve() {
      try {
        const target = getter?.();
        if (target && !target.isDestroyed()) return target;
      } catch {
        console.debug("[DEEPLINK] target lookup failed, using the main window");
      }
      return getRootWebContents();
    },
  };
}

module.exports = { createDeepLinkTarget };
