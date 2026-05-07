const { ipcMain } = require("electron");
const path = require("node:path");
const createDialogWindow = require("../../_shared/createDialogWindow");

// Single-instance dispatch pointer mirrors `JoinMeetingDialog`: handlers are
// registered exactly once and route through whichever AddProfileDialog is
// currently visible. Keeps us from leaking duplicate `ipcMain.on` listeners
// across show/close cycles.
let activeHandlers = null;
let handlersRegistered = false;

function ensureIpcHandlers() {
  if (handlersRegistered) return;
  handlersRegistered = true;
  // Form submit from the renderer; `record` is a plain object matching the
  // shape ProfilesManager.add() accepts: `name`, optional `url`,
  // `avatarInitials`, `avatarColor`.
  ipcMain.on("add-profile-submit", (_event, record) => {
    activeHandlers?.onSubmit(record);
  });
  // User dismissed the dialog (Cancel button or Escape).
  ipcMain.on("add-profile-cancel", () => {
    activeHandlers?.onCancel();
  });
}

class AddProfileDialog {
  #window = null;
  #parentWindow = null;
  #profilesManager = null;

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
      return;
    }

    this.#window = createDialogWindow({
      title: "Add profile",
      width: 460,
      height: 380,
      parent: this.#parentWindow,
      preload: path.join(__dirname, "preload.js"),
    });

    activeHandlers = {
      onSubmit: this.#handleSubmit,
      onCancel: this.#handleCancel,
    };

    this.#window.loadFile(path.join(__dirname, "addProfile.html"));

    this.#window.once("ready-to-show", () => {
      this.#window.show();
      this.#window.focus();
    });

    this.#window.on("closed", () => {
      activeHandlers = null;
      this.#window = null;
    });
  }

  #handleSubmit = (record) => {
    try {
      const profile = this.#profilesManager.add(record);
      // Switch to the new profile immediately so the user lands on its
      // login flow without having to open Switch-to manually. `add` only
      // sets activeId when the list was empty; for any subsequent add the
      // active profile would otherwise stay on the previous one.
      this.#profilesManager.switch(profile.id);
      this.close();
    } catch (error) {
      // Surface the validation message back to the renderer rather than
      // closing — the user should be able to fix the field and retry without
      // losing what they typed. ProfilesManager.add throws Error(...) for
      // missing name and any over-length field.
      const message =
        typeof error?.message === "string" && error.message
          ? error.message
          : "Failed to add profile.";
      // Strip the "[ProfilesManager] " noise from the manager-thrown errors
      // so the dialog shows a plain sentence.
      const cleaned = message.replace(/^\[ProfilesManager\]\s*/, "");
      this.#window?.webContents.send("add-profile-error", cleaned);
    }
  };

  #handleCancel = () => {
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

module.exports = AddProfileDialog;
