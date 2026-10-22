/**
 * ADR-020 Phase 2: every profile view runs the title-scrape → badge
 * pipeline, so the sender-blind handlers were last-write-wins across
 * profiles. Main becomes authoritative: dock badge = sum, tooltip = total
 * plus top-3 profiles, tray icon rendered for the aggregate when more than
 * one profile is unread (main has no canvas, so an existing renderer
 * composites via the injected `requestBadgeRender`).
 *
 * Pure module: side effects are injected, keeping it testable without
 * Electron. Entry points and the refresh never throw — the process-wide
 * error handlers exit on anything they cannot classify.
 */
class ProfileUnreadAggregator {
  /** @type {Map<string, {count:number, flash:boolean|undefined, icon:string|null}>} */
  #buckets = new Map();
  #deps;
  #renderToken = 0;
  // Never nulled by the zero path: a failed render falls back here so the
  // tray keeps a badged icon while counts are non-zero.
  #lastBadgedIcon = null;

  /**
   * @param {object} deps
   * @param {(event: object) => string|null} deps.resolveProfileId
   * @param {(event: object) => boolean} deps.isPrimarySender  Root window or
   *   a profile view. Popups scrape their own titles (a popped-out chat
   *   reads 0) and must never write a bucket.
   * @param {(profileId: string) => string|null} deps.getProfileName
   * @param {(count: number) => Promise<string|null>} deps.requestBadgeRender
   * @param {() => boolean} deps.wantsPresenceOverlay  The active renderer draws
   *   a presence dot over the tray icon even at zero unread
   *   (trayIconRenderer.js), so the zero path is worth a render request only
   *   while that option is on — and the dot then belongs to the *selected*
   *   profile, which is the one the render bridge targets: with it on, no
   *   icon is reused from a bucket's own cache.
   * @param {(update: {icon:string|null, flash:boolean|undefined, tooltip:string}) => void} deps.applyTray
   * @param {(count: number) => void} deps.applyBadgeCount
   * @param {string} deps.appTitle
   */
  constructor(deps) {
    this.#deps = deps;
  }

  #bucketKey(event) {
    const profileId = this.#deps.resolveProfileId(event);
    const senderKey = `wc:${event?.sender?.id ?? "unknown"}`;
    if (profileId) {
      // Drop the bucket this sender made pre-bootstrap, or its count would
      // double once updates re-key to the profile id.
      this.#buckets.delete(senderKey);
      return profileId;
    }
    return senderKey;
  }

  #bucket(key) {
    let bucket = this.#buckets.get(key);
    if (!bucket) {
      // `undefined` means no flash request has been seen for this bucket yet;
      // a redraw omits the flag and must not be mistaken for "stop flashing".
      bucket = { count: 0, flash: undefined, icon: null };
      this.#buckets.set(key, bucket);
    }
    return bucket;
  }

  onTrayUpdate(event, payload) {
    try {
      this.#onTrayUpdate(event, payload ?? {});
    } catch (error) {
      console.error("[ProfileUnread] tray update failed", {
        message: error.message,
      });
    }
  }

  onBadgeCount(event, count) {
    try {
      this.#onBadgeCount(event, count);
    } catch (error) {
      console.error("[ProfileUnread] badge update failed", {
        message: error.message,
      });
    }
  }

  #onTrayUpdate(event, { icon, flash, count }) {
    if (!this.#deps.isPrimarySender(event)) return;
    const bucket = this.#bucket(this.#bucketKey(event));
    bucket.icon = icon ?? null;
    // An icon/theme redraw omits `flash`; preserving the previous request is
    // what keeps an active notification flash running.
    if (flash !== undefined) bucket.flash = !!flash;
    // Legacy {icon, flash} payloads say nothing about the count.
    if (count !== undefined && count !== null) {
      bucket.count = Number.isFinite(count) && count > 0 ? count : 0;
    }
    bucket.iconCount = bucket.count;
    void this.#refreshTray();
  }

  #onBadgeCount(event, count) {
    if (!this.#deps.isPrimarySender(event)) return;
    const bucket = this.#bucket(this.#bucketKey(event));
    const next = Number.isFinite(count) && count > 0 ? count : 0;
    const changed = bucket.count !== next;
    bucket.count = next;
    this.#deps.applyBadgeCount(this.#sum());
    // Only an out-of-band badge change gets here with a new count; the tray
    // would otherwise keep a stale total with nothing scheduled to fix it.
    if (changed) void this.#refreshTray();
  }

  removeProfile(profileId) {
    const removed = this.#buckets.get(profileId);
    if (!removed) return;
    this.#buckets.delete(profileId);
    this.#deps.applyBadgeCount(this.#sum());
    // The bucket takes its attention request with it, and `#flash()` answers
    // `undefined` once no bucket has made one — which the tray reads as "leave
    // the window alone". So a flash started by the removed profile would
    // outlive it; stop it explicitly. Another bucket's `true` or `false` still
    // wins, because those are real requests.
    const stopFlash = removed.flash === true && this.#flash() === undefined;
    void this.#refreshTray(stopFlash ? false : undefined);
  }

  /**
   * Re-render the aggregate for the currently selected profile. The dot
   * belongs to the selection, and a switch changes whose renderer draws it
   * without changing any count or status — both are deduped upstream — so the
   * switch has to ask for the render explicitly. Never throws.
   */
  refresh() {
    void this.#refreshTray();
  }

  #sum() {
    let sum = 0;
    for (const bucket of this.#buckets.values()) sum += bucket.count;
    return sum;
  }

  #unread() {
    return [...this.#buckets.entries()].filter(([, b]) => b.count > 0);
  }

  #tooltip(sum, unread) {
    const base =
      sum > 0 ? `${this.#deps.appTitle} (${sum})` : this.#deps.appTitle;
    if (unread.length < 2) return base;
    const lines = unread
      .map(([key, bucket]) => ({
        name: key.startsWith("wc:") ? null : this.#deps.getProfileName(key),
        count: bucket.count,
      }))
      .filter((entry) => entry.name)
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map((entry) => `${entry.name}: ${entry.count}`);
    return lines.length > 0 ? `${base}\n${lines.join("\n")}` : base;
  }

  // OR across every bucket, not only the unread ones: a bucket that cleared
  // to zero still has to be able to stop an active flash. `undefined` means
  // that bucket has not made a request, so it must not force `false` — all
  // buckets without one leave the window's flash state untouched.
  #flash() {
    let cleared = false;
    for (const bucket of this.#buckets.values()) {
      if (bucket.flash === true) return true;
      if (bucket.flash === false) cleared = true;
    }
    return cleared ? false : undefined;
  }

  /**
   * Fire-and-forget at every call site (`void`): never rejects.
   *
   * @param {boolean} [flashOverride]  Forces the flash value instead of the
   *   one the remaining buckets ask for; used by removeProfile, which is the
   *   only caller that can be left with no request at all while the window is
   *   already flashing.
   */
  async #refreshTray(flashOverride) {
    try {
      await this.#applyRefresh(flashOverride);
    } catch (error) {
      console.error("[ProfileUnread] tray refresh failed", {
        message: error.message,
      });
    }
  }

  /** @param {boolean} [flashOverride]  See #refreshTray. */
  async #applyRefresh(flashOverride) {
    const unread = this.#unread();
    const sum = this.#sum();
    const flash = flashOverride ?? this.#flash();
    const tooltip = this.#tooltip(sum, unread);
    const token = ++this.#renderToken;

    const icon = await this.#trayIcon(unread, sum);
    // Token guard: a render that finished after a newer refresh started must
    // not overwrite it.
    if (token !== this.#renderToken) return;

    // Only an icon that carries the unread count may become the fallback for a
    // failed badged render; a zero-unread presence icon would drop the badge.
    if (icon && sum > 0) this.#lastBadgedIcon = icon;
    this.#deps.applyTray({ icon, flash, tooltip });
  }

  /**
   * The icon for the current buckets: a single bucket's own composite when it
   * is still fresh and no presence dot is drawn, a fresh render otherwise, and
   * at zero unread the renderer's presence-only composite when the overlay is
   * on. Null means the plain icon.
   *
   * @param {[string, {count:number, icon:string|null, iconCount:number}][]} unread
   * @param {number} sum
   * @returns {Promise<string|null>}
   */
  async #trayIcon(unread, sum) {
    const presenceOverlay = this.#deps.wantsPresenceOverlay();
    if (unread.length === 0) {
      // Nothing unread is the plain icon, unless the renderer still has a
      // presence dot to draw: a zero-count composite resolves null when it has
      // nothing to draw either.
      if (!presenceOverlay) return null;
      return (await this.#deps.requestBadgeRender(0)) ?? null;
    }
    if (unread.length === 1) {
      const [, bucket] = unread[0];
      // A cached composite carries the presence dot of the profile that drew
      // it, which is not necessarily the selected one — the render bridge
      // targets the selection — so with the overlay on the icon is always
      // rendered again; the cache is left as the fallback only.
      if (
        !presenceOverlay &&
        bucket.icon !== null &&
        bucket.iconCount === bucket.count
      ) {
        return bucket.icon;
      }
      // The stored icon has a different number baked in (out-of-band badge
      // change) — re-render.
      const icon =
        (await this.#deps.requestBadgeRender(Math.min(bucket.count, 9999))) ??
        null;
      return icon ?? bucket.icon ?? this.#lastBadgedIcon;
    }
    const icon =
      (await this.#deps.requestBadgeRender(Math.min(sum, 9999))) ?? null;
    if (icon !== null) return icon;
    const best = unread.reduce(
      (a, b) => (b[1].count > a[1].count ? b : a),
      unread[0]
    );
    return best[1].icon ?? this.#lastBadgedIcon;
  }
}

module.exports = ProfileUnreadAggregator;
