"use strict";

/**
 * This renderer's own multi-account profile notification flags (ADR-020
 * Phase 2): pulled from main on load, pushed by main when the profile
 * changes. Both off until known.
 */
class ProfileNotificationFlags {
  #flags = { disableNotifications: false, muted: false };
  // Bumped by every push, so a pull that was in flight when a push landed
  // can tell its answer is older.
  #generation = 0;

  get disableNotifications() {
    return this.#flags.disableNotifications;
  }

  get muted() {
    return this.#flags.muted;
  }

  applyPush(flags) {
    this.#generation += 1;
    this.#flags = ProfileNotificationFlags.#normalize(flags);
  }

  /** @param {() => Promise<object>} fetchFlags */
  async pull(fetchFlags) {
    const generation = this.#generation;
    const flags = await fetchFlags();
    if (generation === this.#generation) {
      this.#flags = ProfileNotificationFlags.#normalize(flags);
    }
  }

  static #normalize(flags) {
    return {
      disableNotifications: flags?.disableNotifications === true,
      muted: flags?.muted === true,
    };
  }
}

module.exports = ProfileNotificationFlags;
