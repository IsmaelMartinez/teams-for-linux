/**
 * Which renderers are in a call right now.
 *
 * With multiple accounts each profile's view reports its own call, so "a call
 * is active" is "at least one renderer is in one", not a single flag that the
 * first hang-up clears. An entry leaves on its sender's disconnect event, on
 * that sender's own `did-navigate` (a reload resets renderer-side call state,
 * and a missed disconnect would otherwise leave the entry stuck) and when the
 * sender is destroyed. Keyed by webContents id.
 *
 * @param {object} [options]
 * @param {() => void} [options.onIdle] - Called when the last entry leaves
 *   through a navigation or a destroy, which no disconnect handler follows
 * @returns {{connected: (sender: object) => void,
 *   disconnected: (sender: object) => void, readonly active: boolean,
 *   activeIds: () => number[]}}
 */
function createCallRegistry({ onIdle } = {}) {
  // id -> detaches the sender's listeners
  const entries = new Map();

  function remove(id) {
    const detach = entries.get(id);
    if (!detach) return false;
    entries.delete(id);
    detach();
    return true;
  }

  return {
    connected(sender) {
      const { id } = sender;
      remove(id);
      const leave = () => {
        if (remove(id) && entries.size === 0) onIdle?.();
      };
      sender.on("did-navigate", leave);
      sender.once("destroyed", leave);
      entries.set(id, () => {
        sender.removeListener("did-navigate", leave);
        sender.removeListener("destroyed", leave);
      });
    },

    /** The sender hung up. The caller handles what follows, so no `onIdle`. */
    disconnected(sender) {
      remove(sender.id);
    },

    get active() {
      return entries.size > 0;
    },

    /**
     * The ids of the webContents in a call. Auth recovery maps them to
     * profiles to learn whether the profile it would reload has a call.
     */
    activeIds() {
      return [...entries.keys()];
    },
  };
}

module.exports = { createCallRegistry };
