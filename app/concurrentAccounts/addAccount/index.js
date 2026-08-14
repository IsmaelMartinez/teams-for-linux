const { ipcMain } = require("electron");
const path = require("node:path");
const createDialogWindow = require("../../_shared/createDialogWindow");

let activeHandlers = null;
let handlersRegistered = false;

function ensureIpcHandlers() {
  if (handlersRegistered) return;
  handlersRegistered = true;
  // Form submit from the renderer; `record` is `{ name }`.
  ipcMain.on("account-add-submit", (_event, record) => {
    activeHandlers?.onSubmit(record);
  });
  // User dismissed the dialog (Cancel button or Escape).
  ipcMain.on("account-add-cancel", () => {
    activeHandlers?.onCancel();
  });
}

class AddAccountDialog {
  #window = null;
  #parentWindow = null;
  #accountsManager = null;

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
      return;
    }

    this.#window = createDialogWindow({
      title: "Open another account",
      width: 460,
      height: 280,
      parent: this.#parentWindow,
      preload: path.join(__dirname, "preload.js"),
    });

    activeHandlers = {
      onSubmit: this.#handleSubmit,
      onCancel: this.#handleCancel,
    };

    this.#window.loadFile(path.join(__dirname, "addAccount.html"));

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
      this.#accountsManager.add(record);
      this.close();
    } catch (error) {
      const message =
        typeof error?.message === "string" && error.message
          ? error.message
          : "Failed to add account.";
      const cleaned = message.replace(/^\[ConcurrentAccounts\]\s*/, "");
      this.#window?.webContents.send("account-add-error", cleaned);
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

module.exports = AddAccountDialog;
