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
  /** @type {Map<string, {count:number, flash:boolean, icon:string|null}>} */
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
   * @param {(update: {icon:string|null, flash:boolean, tooltip:string}) => void} deps.applyTray
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
      bucket = { count: 0, flash: false, icon: null };
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
    bucket.flash = !!flash;
    // Legacy {icon, flash} payloads say nothing about the count.
    if (count !== undefined && count !== null) {
      bucket.count = Number.isFinite(count) && count > 0 ? count : 0;
    }
    bucket.iconCount = bucket.count;
    this.#refreshTray();
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
    if (changed) this.#refreshTray();
  }

  removeProfile(profileId) {
    if (!this.#buckets.delete(profileId)) return;
    this.#deps.applyBadgeCount(this.#sum());
    this.#refreshTray();
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

  async #refreshTray() {
    try {
      await this.#applyRefresh();
    } catch (error) {
      console.error("[ProfileUnread] tray refresh failed", {
        message: error.message,
      });
    }
  }

  async #applyRefresh() {
    const unread = this.#unread();
    const sum = this.#sum();
    const flash = unread.some(([, b]) => b.flash);
    const tooltip = this.#tooltip(sum, unread);
    const token = ++this.#renderToken;

    let icon;
    if (unread.length === 0) {
      icon = null;
    } else if (unread.length === 1) {
      const [, bucket] = unread[0];
      if (bucket.icon !== null && bucket.iconCount === bucket.count) {
        icon = bucket.icon;
      } else {
        // The stored icon has a different number baked in (out-of-band
        // badge change) — re-render.
        icon =
          (await this.#deps.requestBadgeRender(
            Math.min(bucket.count, 9999)
          )) ?? null;
        if (token !== this.#renderToken) return;
        icon ??= bucket.icon ?? this.#lastBadgedIcon;
      }
    } else {
      // Token guard: only the newest render may apply.
      icon = (await this.#deps.requestBadgeRender(Math.min(sum, 9999))) ?? null;
      if (token !== this.#renderToken) return;
      if (icon === null) {
        const best = unread.reduce(
          (a, b) => (b[1].count > a[1].count ? b : a),
          unread[0]
        );
        icon = best[1].icon ?? this.#lastBadgedIcon;
      }
    }

    if (icon) this.#lastBadgedIcon = icon;
    this.#deps.applyTray({ icon, flash, tooltip });
  }
}

module.exports = ProfileUnreadAggregator;
