/**
 * A deep link held back while a call is active.
 *
 * The fallback for a route the SPA declines is a full navigation, which ends
 * a running call. The link waits here instead and opens once the call is
 * over. One slot: the newest navigation always wins, so anything that moves
 * the window elsewhere first (a later link, a reload, auth recovery) cancels
 * it, up to the moment it opens.
 */
class DeferredDeepLink {
  #open;
  #delayMs;
  #url = null;
  #timer = null;

  /**
   * @param {(url: string) => void} open - Opens the link once released
   * @param {number} delayMs - Wait after the call ends, for its teardown
   */
  constructor(open, delayMs) {
    this.#open = open;
    this.#delayMs = delayMs;
  }

  get pending() {
    return this.#url !== null;
  }

  /** Holds `url`, replacing any link already waiting. */
  defer(url) {
    this.cancel();
    this.#url = url;
  }

  /** The call ended: open the held link after the delay, unless cancelled. */
  release() {
    if (this.#url === null || this.#timer !== null) {
      return;
    }
    this.#timer = setTimeout(() => {
      const url = this.#url;
      this.#timer = null;
      this.#url = null;
      this.#open(url);
    }, this.#delayMs);
  }

  /** Drops the held link, whether it is still waiting or already released. */
  cancel() {
    clearTimeout(this.#timer);
    this.#timer = null;
    this.#url = null;
  }
}

module.exports = { DeferredDeepLink };
