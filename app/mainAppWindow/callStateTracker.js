/**
 * Per-window call state (ADR-032).
 *
 * The renderer reports `call-connected` / `call-disconnected` over IPC and the
 * main process used to keep a single boolean for the whole app. With more than
 * one Teams document on the same session (the secondary window, profile views)
 * that boolean lies: a connect in one window overwrote the other's state and
 * the first disconnect released screen-lock inhibition while another call was
 * still running. This tracker keeps one entry per reporting webContents so a
 * disconnect only clears the window it came from, and offers the derived
 * "any call active" that app-wide consumers (power save blocker, auth
 * recovery) actually want.
 *
 * Entries are keyed by the webContents object itself, never by `id`: a
 * destroyed webContents still compares by identity but throws on property
 * access, and the IPC event's `sender` is the same object every time.
 */
class CallStateTracker {
  #active = new Map();

  /**
   * Record a connected call for `webContents`.
   *
   * @param {object} webContents - The reporting renderer (IPC event sender).
   * @param {(webContents: object) => void} [onDestroyed] - Called if the
   *   renderer goes away while still in a call, after its entry is dropped.
   * @returns {{ first: boolean }} `first` is true when no other call was active.
   */
  connect(webContents, onDestroyed) {
    if (!webContents) return { first: false };
    const first = this.#active.size === 0;
    if (!this.#active.has(webContents)) {
      let detach = null;
      if (typeof webContents.once === "function") {
        const handler = () => {
          if (this.#active.delete(webContents) && onDestroyed) onDestroyed(webContents);
        };
        webContents.once("destroyed", handler);
        detach = () => {
          if (typeof webContents.removeListener === "function") {
            webContents.removeListener("destroyed", handler);
          }
        };
      }
      this.#active.set(webContents, detach);
    }
    return { first };
  }

  /**
   * Drop the call recorded for `webContents`.
   *
   * @returns {{ wasActive: boolean, last: boolean }} `last` is true when no
   *   call remains active after this disconnect.
   */
  disconnect(webContents) {
    const detach = this.#active.get(webContents);
    const wasActive = this.#active.delete(webContents);
    if (typeof detach === "function") detach();
    return { wasActive, last: wasActive && this.#active.size === 0 };
  }

  has(webContents) {
    return this.#active.has(webContents);
  }

  get anyActive() {
    return this.#active.size > 0;
  }

  get count() {
    return this.#active.size;
  }
}

module.exports = CallStateTracker;
