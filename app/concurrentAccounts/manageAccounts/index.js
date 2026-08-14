const { ipcMain, dialog } = require("electron");
const path = require("node:path");
const createDialogWindow = require("../../_shared/createDialogWindow");

let activeHandlers = null;
let handlersRegistered = false;

function ensureIpcHandlers() {
  if (handlersRegistered) return;
  handlersRegistered = true;
  // Inline rename. Request/response so the renderer can keep the input
  // open on validation rejection.
  ipcMain.handle("account-manage-rename", async (_event, payload) => {
    if (!activeHandlers) return;
    return activeHandlers.onRename(payload);
  });
  // Open (spawn/focus) an account that is not the current process.
  ipcMain.on("account-manage-open", (_event, id) => {
    activeHandlers?.onOpen(id);
  });
  // Remove an extra account after native confirmation.
  ipcMain.on("account-manage-remove", (_event, id) => {
    activeHandlers?.onRemove(id);
  });
  // User dismissed the dialog (Close button or Escape).
  ipcMain.on("account-manage-close", () => {
    activeHandlers?.onClose();
  });
}

class ManageAccountsDialog {
  #window = null;
  #parentWindow = null;
  #accountsManager = null;
  #changeListener = null;

  constructor(parentWindow, accountsManager) {
    this.#parentWindow = parentWindow;
    this.#accountsManager = accountsManager;
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
      title: "Manage accounts",
      width: 520,
      height: 420,
      parent: this.#parentWindow,
      preload: path.join(__dirname, "preload.js"),
    });

    activeHandlers = {
      onRename: this.#handleRename,
      onOpen: this.#handleOpen,
      onRemove: this.#handleRemove,
      onClose: this.#handleClose,
    };

    this.#window.loadFile(path.join(__dirname, "manageAccounts.html"));

    this.#window.once("ready-to-show", () => {
      this.#window.show();
      this.#window.focus();
      this.#pushState();
    });

    this.#changeListener = () => this.#pushState();
    this.#accountsManager.on("add", this.#changeListener);
    this.#accountsManager.on("remove", this.#changeListener);
    this.#accountsManager.on("update", this.#changeListener);

    this.#window.on("closed", () => {
      activeHandlers = null;
      if (this.#changeListener) {
        this.#accountsManager.off("add", this.#changeListener);
        this.#accountsManager.off("remove", this.#changeListener);
        this.#accountsManager.off("update", this.#changeListener);
        this.#changeListener = null;
      }
      this.#window = null;
    });
  }

  #pushState() {
    if (!this.#window || this.#window.isDestroyed()) return;
    this.#window.webContents.send("account-manage-state", {
      accounts: this.#accountsManager.list(),
      max: this.#accountsManager.constructor.MAX_ACCOUNTS || 3,
    });
  }

  #handleRename = ({ id, name }) => {
    try {
      this.#accountsManager.update(id, { name });
    } catch (error) {
      const raw =
        typeof error?.message === "string" && error.message
          ? error.message
          : "Failed to rename account.";
      throw new Error(raw.replace(/^\[ConcurrentAccounts\]\s*/, ""));
    }
  };

  #handleOpen = (id) => {
    try {
      this.#accountsManager.launch(id);
    } catch (error) {
      this.#sendError(error, "Failed to open account.");
    }
  };

  #handleRemove = async (id) => {
    if (!this.#window || this.#window.isDestroyed()) return;
    const account = this.#accountsManager.list().find((entry) => entry.id === id);
    if (!account) return;

    const { response } = await dialog.showMessageBox(this.#window, {
      type: "warning",
      title: "Remove account",
      message: `Remove "${account.label || account.name}"?`,
      detail:
        "This permanently deletes that account's login and local data. " +
        "The original account is never removed this way.",
      buttons: ["Cancel", "Remove"],
      defaultId: 0,
      cancelId: 0,
    });
    if (response !== 1) return;
    if (!this.#window || this.#window.isDestroyed()) return;

    try {
      this.#accountsManager.remove(id);
    } catch (error) {
      this.#sendError(error, "Failed to remove account.");
    }
  };

  #sendError(error, fallback) {
    if (!this.#window || this.#window.isDestroyed()) return;
    const raw =
      typeof error?.message === "string" && error.message
        ? error.message
        : fallback;
    const cleaned = raw.replace(/^\[ConcurrentAccounts\]\s*/, "");
    this.#window.webContents.send("account-manage-error", cleaned);
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

module.exports = ManageAccountsDialog;
