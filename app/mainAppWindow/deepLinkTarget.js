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
 *   isInstalled: () => boolean,
 *   resolve: () => Electron.WebContents}}
 */
function createDeepLinkTarget(getRootWebContents) {
  let getter = null;

  return {
    set(newGetter) {
      getter = typeof newGetter === "function" ? newGetter : null;
    },

    /** True once a getter is in place, i.e. multi-account has wired its views. */
    isInstalled() {
      return getter !== null;
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
