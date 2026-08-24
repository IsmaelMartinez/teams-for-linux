"use strict";

// Routes main-process notification lifecycle events (app/notifications/service.js)
// back to the Notification-like stubs preload hands Teams. Teams attaches its own
// click handler to that stub, and relaying the click is what lets it open the
// conversation the notification came from (issue #2768 follow-up).
//
// Two ipcRenderer listeners for the whole renderer, keyed by id, rather than a
// pair per notification. Electron does not guarantee a close event for every
// notification, so per-notification listeners leaked one entry for each one the
// system discarded silently, and page JS decides how many notifications exist.
// ipcRenderer's default maxListeners is 10, so that also produced
// MaxListenersExceededWarning on a busy day.

// Entries deliberately outlive close. stub.close() only tells Teams the
// notification is over; it does not dismiss the native notification, which the
// user can still click afterwards. Dropping the entry on close would swallow
// exactly the click this bridge exists to deliver. Bounded by evicting the
// oldest entry instead, since a Map iterates in insertion order.
const MAX_TRACKED_NOTIFICATIONS = 50;

class NotificationBridge {
  #entries = new Map();
  #limit;

  constructor(ipcRenderer, { limit = MAX_TRACKED_NOTIFICATIONS } = {}) {
    this.#limit = limit;
    ipcRenderer.on("notification-clicked", (_event, id) => this.#click(id));
    ipcRenderer.on("notification-closed", (_event, id) => this.close(id));
  }

  register(id, stub) {
    this.#entries.set(id, { stub, closed: false });
    while (this.#entries.size > this.#limit) {
      this.#entries.delete(this.#entries.keys().next().value);
    }
  }

  unregister(id) {
    this.#entries.delete(id);
  }

  // Idempotent: Teams calling stub.close() and the main process reporting the
  // system dismissal must fire Teams' onclose exactly once.
  close(id) {
    const entry = this.#entries.get(id);
    if (!entry || entry.closed) return;
    entry.closed = true;
    this.#dispatch(entry.stub, entry.stub.onclose, "close");
  }

  // An unknown id is a stale event after a page reload, or a notification that
  // has since been evicted. Ignore it.
  #click(id) {
    const entry = this.#entries.get(id);
    if (!entry) return;
    this.#dispatch(entry.stub, entry.stub.onclick, "click");
  }

  #dispatch(stub, handler, type) {
    if (typeof handler !== "function") return;
    try {
      // contextIsolation is false (mainAppWindow/browserWindowManager.js), so
      // preload shares the page's realm and this is a genuine page-side Event
      // that satisfies `e instanceof Event` inside Teams. If contextIsolation is
      // ever enabled this must move to a page-side dispatch. target and
      // currentTarget are shimmed because a real notification event exposes the
      // notification there and Teams' handler is minified.
      const event = new Event(type);
      Object.defineProperty(event, "target", { value: stub });
      Object.defineProperty(event, "currentTarget", { value: stub });
      handler.call(stub, event);
    } catch (e) {
      // Teams' handler is third-party code. An uncaught throw inside an
      // ipcRenderer listener aborts the rest of that emit, which would let one
      // broken handler swallow the event for every other live notification.
      console.debug("[NOTIFICATIONS] notification handler threw", e);
    }
  }
}

module.exports = NotificationBridge;
