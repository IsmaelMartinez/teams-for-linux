const { ipcMain, dialog } = require("electron");
const path = require("node:path");
const createDialogWindow = require("../../_shared/createDialogWindow");

// Single-instance dispatch pointer mirrors `AddProfileDialog` — handlers are
// registered exactly once and route through whichever ManageProfileDialog
// is currently visible.
let activeHandlers = null;
let handlersRegistered = false;

function ensureIpcHandlers() {
  if (handlersRegistered) return;
  handlersRegistered = true;
  // Inline rename request from the renderer. Uses request/response
  // (`ipcMain.handle` / `ipcRenderer.invoke`) so the renderer can `await`
  // the result and keep the input open on validation rejection — losing
  // the user's typed value on error was a gemini-flagged UX bug on
  // PR #2510. Payload carries the profile `id` and the new `name`.
  ipcMain.handle("manage-profile-rename", async (_event, payload) => {
    if (!activeHandlers) return;
    return activeHandlers.onRename(payload);
  });
  // Remove request from the renderer; main shows the destructive confirmation
  // before forwarding to ProfilesManager.
  ipcMain.on("manage-profile-remove", (_event, id) => {
    activeHandlers?.onRemove(id);
  });
  // User dismissed the dialog (Close button or Escape).
  ipcMain.on("manage-profile-close", () => {
    activeHandlers?.onClose();
  });
}

class ManageProfileDialog {
  #window = null;
  #parentWindow = null;
  #profilesManager = null;
  #profileChangeListener = null;

  constructor(parentWindow, profilesManager) {
    this.#parentWindow = parentWindow;
    this.#profilesManager = profilesManager;
  }

  show() {
    ensureIpcHandlers();

    if (this.#window) {
      if (this.#window.isMinimized()) {
        this.#window.restore();
      }
      this.#window.show();
      this.#window.focus();
      this.#pushState();
      return;
    }

    this.#window = createDialogWindow({
      title: "Manage profiles",
      width: 520,
      height: 420,
      parent: this.#parentWindow,
      preload: path.join(__dirname, "preload.js"),
    });

    activeHandlers = {
      onRename: this.#handleRename,
      onRemove: this.#handleRemove,
      onClose: this.#handleClose,
    };

    this.#window.loadFile(path.join(__dirname, "manageProfile.html"));

    this.#window.once("ready-to-show", () => {
      this.#window.show();
      this.#window.focus();
      this.#pushState();
    });

    // Keep the dialog list in sync with ProfilesManager mutations from any
    // source (Add-profile dialog, programmatic switch, etc.).
    this.#profileChangeListener = () => this.#pushState();
    this.#profilesManager.on("add", this.#profileChangeListener);
    this.#profilesManager.on("remove", this.#profileChangeListener);
    this.#profilesManager.on("switch", this.#profileChangeListener);
    this.#profilesManager.on("update", this.#profileChangeListener);

    this.#window.on("closed", () => {
      activeHandlers = null;
      if (this.#profileChangeListener) {
        this.#profilesManager.off("add", this.#profileChangeListener);
        this.#profilesManager.off("remove", this.#profileChangeListener);
        this.#profilesManager.off("switch", this.#profileChangeListener);
        this.#profilesManager.off("update", this.#profileChangeListener);
        this.#profileChangeListener = null;
      }
      this.#window = null;
    });
  }

  #pushState() {
    if (!this.#window || this.#window.isDestroyed()) return;
    const profiles = this.#profilesManager.list();
    const activeId = this.#profilesManager.getActive()?.id ?? null;
    this.#window.webContents.send("manage-profile-state", {
      profiles,
      activeId,
    });
  }

  #handleRename = ({ id, name }) => {
    try {
      // ProfilesManager.update is `(id, patch)` — two args, not a single
      // record object like `add()`. Easy mistake to make from the IPC shape.
      this.#profilesManager.update(id, { name });
      // Success: ProfilesManager emits "update", #pushState fires via the
      // listener wired in show(). Returning undefined resolves the invoke
      // promise on the renderer side.
    } catch (error) {
      // Re-throw with the [ProfilesManager] prefix stripped so the renderer
      // shows a clean sentence. ipcMain.handle propagates the rejection to
      // the awaiting ipcRenderer.invoke caller.
      const raw =
        typeof error?.message === "string" && error.message
          ? error.message
          : "Failed to rename profile.";
      throw new Error(raw.replace(/^\[ProfilesManager\]\s*/, ""));
    }
  };

  #handleRemove = async (id) => {
    if (!this.#window || this.#window.isDestroyed()) return;
    const profile = this.#profilesManager.list().find((p) => p.id === id);
    if (!profile) return;

    // Async showMessageBox keeps the main process responsive while the
    // confirmation is up (gemini-flagged on PR #2510).
    const { response } = await dialog.showMessageBox(this.#window, {
      type: "warning",
      title: "Remove profile",
      message: `Remove "${profile.name}"?`,
      detail:
        "This will permanently delete this profile's login and local data. " +
        "If you re-add this profile later, Teams will need to re-authenticate.",
      buttons: ["Cancel", "Remove"],
      defaultId: 0,
      cancelId: 0,
    });
    if (response !== 1) return;

    // Re-check window after the async dialog roundtrip — the user may have
    // closed Manage while the OS confirm was open.
    if (!this.#window || this.#window.isDestroyed()) return;

    try {
      this.#profilesManager.remove(id);
      // ProfileViewManager's "remove" listener clears partition storage and
      // destroys the WebContentsView (see ADR-020 § "Remove a profile" and
      // app/mainAppWindow/profileViewManager.js #destroyView).
    } catch (error) {
      this.#sendError(error, "Failed to remove profile.");
    }
  };

  #sendError(error, fallback) {
    if (!this.#window || this.#window.isDestroyed()) return;
    const raw =
      typeof error?.message === "string" && error.message
        ? error.message
        : fallback;
    const cleaned = raw.replace(/^\[ProfilesManager\]\s*/, "");
    this.#window.webContents.send("manage-profile-error", cleaned);
  }

  #handleClose = () => {
    this.close();
  };

  close() {
    if (this.#window) {
      this.#window.close();
    }
  }

  isVisible() {
    return this.#window && this.#window.isVisible();
  }
}

module.exports = ManageProfileDialog;
