/**
 * ProfileUnreadAggregator — ADR-020 Phase 2. With several profiles running
 * warm, every profile view runs its own title-scrape → badge pipeline and the
 * main-side `tray-update` / `set-badge-count` handlers were last-write-wins:
 * a background profile settling to 0 cleared the badge for the profile the
 * user is looking at. This module makes main authoritative — it keeps one
 * bucket per sender, attributes each to a profile via the SenderProfileMap
 * (through ProfileViewManager), and drives the tray and dock badge from the
 * AGGREGATE: badge = sum across profiles, tooltip = total plus the top-3
 * profiles by unread count.
 *
 * Bucketing: attributed senders key by profile id (a reloaded view replaces
 * its own bucket); unattributed senders (the root window before Profile 0
 * bootstrap) key by webContents id, participate in the sum, and are dropped
 * the moment the same sender starts resolving to a profile.
 *
 * Icon: main cannot composite (no canvas), so when more than one bucket is
 * unread the aggregate icon is rendered by an existing renderer via the
 * injected `requestBadgeRender` (trayIconRenderer's canvas path, reused).
 * With zero or one unread bucket the sender's own icon is used unchanged —
 * the single-profile look stays byte-identical to today's.
 *
 * Pure module (no Electron imports): every side effect is injected, so the
 * aggregation logic is unit-testable under plain `node --test`.
 */
class ProfileUnreadAggregator {
  /** @type {Map<string, {count:number, flash:boolean, icon:string|null}>} */
  #buckets = new Map();
  #deps;
  #renderToken = 0;
  // The last badge-carrying icon we applied — never nulled by the zero-unread
  // path, so a failed aggregate render can fall back to SOME badged icon
  // rather than regressing to the bare base icon while counts are non-zero.
  #lastBadgedIcon = null;

  /**
   * @param {object} deps
   * @param {(event: object) => string|null} deps.resolveProfileId  Sender →
   *   profile id (ProfileViewManager.getProfileFor-style resolution by event).
   * @param {(event: object) => boolean} deps.isPrimarySender  True only for
   *   a profile's PRIMARY surface (root window or a profile view). Popups
   *   and webview guests run the same unread pipeline but scrape their own
   *   window titles — a popped-out chat reads 0 — so their updates must
   *   never touch the buckets (the intra-profile last-write-wins trap).
   * @param {(profileId: string) => string|null} deps.getProfileName
   * @param {(count: number) => Promise<string|null>} deps.requestBadgeRender
   *   Renders the aggregate badge in a live renderer; resolves a dataURL or
   *   null when no renderer could produce one.
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
      // The sender is attributable now — drop any bucket it created while it
      // was not (the root window's pre-bootstrap updates), so that count is
      // never double-counted once its updates re-key to the profile id.
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

  // Public entry points never throw: they run inside ipcMain handlers and a
  // synchronous dep failure (settings-store read, webContents race) there is
  // a fatal uncaughtException — a badge update must never take the app down.
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
    // Legacy payloads ({icon, flash} only, still supported by the tray) say
    // nothing about the count — leave it alone rather than zeroing.
    if (count !== undefined && count !== null) {
      bucket.count = Number.isFinite(count) && count > 0 ? count : 0;
    }
    this.#refreshTray();
  }

  #onBadgeCount(event, count) {
    if (!this.#deps.isPrimarySender(event)) return;
    const bucket = this.#bucket(this.#bucketKey(event));
    const next = Number.isFinite(count) && count > 0 ? count : 0;
    const changed = bucket.count !== next;
    bucket.count = next;
    this.#deps.applyBadgeCount(this.#sum());
    // The organic pipeline sends tray-update with the same count first, so
    // this refresh only fires for out-of-band badge changes (page script
    // calling electronAPI.setBadgeCount directly) — without it the tray
    // would keep showing a stale total with no recomputation scheduled.
    if (changed) this.#refreshTray();
  }

  /** A removed profile must stop contributing immediately. */
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
    // Top-3 by count; only profile-attributed buckets can be named.
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
    // Never allowed to reject: the process-wide unhandledRejection handler
    // exits on anything it cannot classify, and the injected deps can throw
    // (settings-store reads, webContents races).
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
      icon = null; // tray falls back to the base icon, exactly like today
    } else if (unread.length === 1) {
      icon = unread[0][1].icon; // the sender's own composited icon, unchanged
    } else {
      // Aggregate: rendered by a live renderer. Coalesce — only the newest
      // request may apply. On failure fall back to the highest-count
      // bucket's own icon, then to the last badge-carrying icon, so the
      // tray never regresses to a bare base icon while counts are non-zero.
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
