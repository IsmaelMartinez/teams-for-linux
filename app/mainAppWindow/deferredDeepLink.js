/**
 * A deep link held back while a call is active.
 *
 * The fallback for a route the SPA declines is a full navigation, which ends
 * a running call. The link waits here instead and opens once the call is
 * over. One slot: the newest navigation always wins, so anything that moves
 * the window elsewhere first (a later link, a reload, auth recovery) cancels
 * it, up to the moment it opens.
 *
 * With multiple accounts the link belongs to the surface it was aimed at (the
 * root window or one profile's view), fixed when it is held: a profile switch
 * during the call does not redirect it. A navigation of that surface cancels
 * the link, as a navigation of the root window always has.
 */
class DeferredDeepLink {
  #open;
  #delayMs;
  #url = null;
  #target = null;
  #onTargetNavigate = null;
  #timer = null;

  /**
   * @param {(url: string, target: object|null) => void} open - Opens the link
   *   once released, on the surface it was held for
   * @param {number} delayMs - Wait after the call ends, for its teardown
   */
  constructor(open, delayMs) {
    this.#open = open;
    this.#delayMs = delayMs;
  }

  get pending() {
    return this.#url !== null;
  }

  /**
   * Holds `url`, replacing any link already waiting.
   *
   * @param {string} url
   * @param {Electron.WebContents|null} [target] - Surface the link opens on;
   *   its navigation cancels the held link
   */
  defer(url, target = null) {
    this.cancel();
    this.#url = url;
    this.#target = target;
    if (typeof target?.once === "function") {
      this.#onTargetNavigate = () => this.cancel();
      target.once("did-navigate", this.#onTargetNavigate);
    }
  }

  /** The call ended: open the held link after the delay, unless cancelled. */
  release() {
    if (this.#url === null || this.#timer !== null) {
      return;
    }
    this.#timer = setTimeout(() => {
      const url = this.#url;
      const target = this.#target;
      this.#timer = null;
      this.#clearHold();
      this.#open(url, target);
    }, this.#delayMs);
  }

  /** Drops the held link, whether it is still waiting or already released. */
  cancel() {
    clearTimeout(this.#timer);
    this.#timer = null;
    this.#clearHold();
  }

  #clearHold() {
    if (this.#onTargetNavigate) {
      this.#target.removeListener("did-navigate", this.#onTargetNavigate);
    }
    this.#onTargetNavigate = null;
    this.#target = null;
    this.#url = null;
  }
}

module.exports = { DeferredDeepLink };
