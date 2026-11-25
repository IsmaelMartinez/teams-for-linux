/**
 * Join Meeting and Return to Teams navigation.
 *
 * Both act on one Teams surface: the root window's webContents, or with
 * multiple accounts (ADR-020) the active profile's view. Joining remembers
 * which surface it left and from where, and Return to Teams puts that same
 * surface back, whichever profile is active by then.
 *
 * Never log a meeting URL: its query parameters may contain tokens.
 */
class MeetingNavigation {
  #getTarget;
  #getConfig;
  #getActivator;
  #getTeamsUrl;
  #showWindow;
  #showError;
  #preJoinUrl = null;
  #preJoinTarget = null;

  /**
   * @param {object} deps
   * @param {() => Electron.WebContents} deps.getTarget - Surface to navigate
   * @param {() => {url: string, chromeUserAgent: string, meetupJoinRegEx: string}} deps.getConfig
   * @param {() => (((webContents: object) => unknown)|null)} [deps.getActivator] -
   *   Multi-account only: brings a webContents' profile to the front
   * @param {(webContents: object) => string} [deps.getTeamsUrl] - The Teams URL
   *   configured for a surface's profile (profiles can name their own host);
   *   defaults to the global `url`
   * @param {() => void} deps.showWindow - Brings the app window to the front
   * @param {(title: string, message: string) => void} deps.showError
   */
  constructor({
    getTarget,
    getConfig,
    getActivator = () => null,
    getTeamsUrl = () => getConfig().url,
    showWindow,
    showError,
  }) {
    this.#getTarget = getTarget;
    this.#getConfig = getConfig;
    this.#getActivator = getActivator;
    this.#getTeamsUrl = getTeamsUrl;
    this.#showWindow = showWindow;
    this.#showError = showError;
  }

  async join(meetingUrl) {
    try {
      // Validate the incoming URL up front so a parse failure or a
      // non-matching URL falls through to the outer catch rather than
      // ending up assigned raw inside the Teams window.
      const parsed = new URL(meetingUrl);
      if (!this.#isMeetingUrl(meetingUrl)) {
        throw new Error("Not a recognised meeting URL");
      }

      // One surface for the whole call, so the snapshot and the navigation
      // cannot land on different profiles.
      const target = this.#getTarget();

      // Snapshot the current Teams URL so the user can jump back after the
      // meeting ends (see #2322). Skip the snapshot if we're already on a
      // meeting URL (e.g. a prior takeover page) so repeat joins don't
      // overwrite the last known good Teams location. A snapshot taken on
      // another surface says nothing about this one, so it is dropped.
      const currentUrl = target.getURL();
      if (!this.#isMeetingUrl(currentUrl)) {
        this.#preJoinUrl = currentUrl;
      } else if (this.#preJoinTarget !== target) {
        this.#preJoinUrl = null;
      }
      this.#preJoinTarget = target;

      // Navigate inside the loaded Teams SPA (same-origin) so the app shell
      // is preserved when the org allows authenticated join. Only rewrite
      // to the current origin when the current page is actually on a Teams
      // host; otherwise (login page, error page) navigate to the URL as-is.
      const destination = this.#isValidTeamsUrl(currentUrl, this.#getTeamsUrl(target))
        ? new URL(currentUrl).origin + parsed.pathname + parsed.search + parsed.hash
        : parsed.href;
      const script = `window.location.assign(${JSON.stringify(destination)});`;
      this.#showWindow();
      // The window's own focus lands on the root webContents, which sits
      // behind a profile's view.
      target.focus();
      await target.executeJavaScript(script, true);
    } catch {
      // Avoid logging the error object: URL query parameters may contain tokens.
      console.error("[JOIN_MEETING] Failed to navigate to meeting URL");
      this.#showError("Error", "Failed to join meeting. Please check the URL.");
    }
  }

  async returnToTeams() {
    const config = this.#getConfig();
    try {
      // The surface that joined, if it is still there. If it is gone (its
      // profile was removed) the snapshot belongs to that account and is
      // ignored: the active surface goes to the configured Teams URL rather
      // than to another account's page.
      const joined = this.#preJoinTarget;
      const joinedGone = Boolean(joined) && joined.isDestroyed();
      const target = joined && !joinedGone ? joined : this.#getTarget();
      // The target profile's own Teams URL, which can be another host than the
      // global one; its origin is also what makes a snapshot a Teams page.
      const teamsUrl = this.#getTeamsUrl(target);
      const url =
        !joinedGone && this.#isValidTeamsUrl(this.#preJoinUrl, teamsUrl)
          ? this.#preJoinUrl
          : teamsUrl;
      // The profile may have been switched away from since joining: bring it
      // back so the navigation is visible.
      this.#getActivator()?.(target);
      this.#showWindow();
      target.focus();
      await target.loadURL(url, { userAgent: config.chromeUserAgent });
    } catch {
      console.error("[RETURN_TO_TEAMS] Navigation failed");
      this.#showError("Error", "Failed to return to Teams.");
    }
  }

  #isMeetingUrl(url) {
    if (!url || typeof url !== "string") return false;
    const pattern = this.#getConfig().meetupJoinRegEx;
    if (!pattern) return false;
    try {
      return new RegExp(pattern).test(url);
    } catch {
      return false;
    }
  }

  // A Teams page: a known Teams host, or the origin of the profile's own
  // configured URL (a profile can sit on another host, such as GovCloud).
  #isValidTeamsUrl(url, teamsUrl) {
    if (!url || typeof url !== "string") return false;
    try {
      const { protocol, hostname, origin } = new URL(url);
      if (protocol !== "https:") return false;
      return (
        /(^|\.)teams\.(microsoft\.com|live\.com|cloud\.microsoft)$/.test(hostname) ||
        (typeof teamsUrl === "string" && origin === new URL(teamsUrl).origin)
      );
    } catch {
      return false;
    }
  }
}

module.exports = MeetingNavigation;
