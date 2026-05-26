/**
 * Custom Stickers Browser Tool
 *
 * Renderer-side companion to app/customStickers. Mounts a floating toggle
 * button and a hidden sticker panel at document.body when
 * config.customStickers.enabled === true. Neither element touches Teams's own
 * DOM tree, so Teams refactors cannot break the mount.
 *
 * Clicking a sticker focuses Teams's chat compose box and dispatches a
 * synthetic ClipboardEvent('paste') carrying the image as a File. Teams's
 * editor (CKEditor 5) consumes the event the same way it handles a real
 * paste — validated end-to-end during the feasibility spike. See
 * spike/2476-stickers/SPIKE.md for the research and DESIGN.md for the design.
 */

const LOG_PREFIX = "[CUSTOM_STICKERS]";
const BUTTON_ID = "tfl-sticker-button";
const PANEL_ID = "tfl-sticker-panel";
const STYLES_ID = "tfl-sticker-styles";
const URL_INPUT_ID = "tfl-sticker-url-input";

// Selector cascade mirrors the spike harness — most-specific first.
const COMPOSE_SELECTORS = [
  'div[id^="new-message-"]',
  'div[contenteditable="true"][role="textbox"][aria-label*="message" i]',
  'div[contenteditable="true"][role="textbox"]',
  '[contenteditable="true"][aria-label*="message" i]',
  '[data-tid*="ckeditor"]',
  '[data-tid*="message-area"]',
  '.ck-editor__editable',
];

class CustomStickers {
  #enabled = false;
  #ipcRenderer = null;
  #panel = null;
  #grid = null;
  #panelOpen = false;
  #toastTimer = null;

  init(config, ipcRenderer) {
    this.#enabled = config?.customStickers?.enabled === true;
    if (!this.#enabled) {
      return;
    }
    if (!ipcRenderer) {
      console.warn(`${LOG_PREFIX} ipcRenderer missing; tool disabled`);
      return;
    }
    this.#ipcRenderer = ipcRenderer;

    // Defer mount until DOM is ready so document.body exists.
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => this.#mount(), {
        once: true,
      });
    } else {
      this.#mount();
    }
  }

  #mount() {
    try {
      this.#injectStyles();
      this.#createButton();
      this.#createPanel();
      console.info(`${LOG_PREFIX} Initialized`);
    } catch (err) {
      console.error(`${LOG_PREFIX} Failed to initialize: ${err.message}`);
    }
  }

  #injectStyles() {
    if (document.getElementById(STYLES_ID)) {
      return;
    }
    const style = document.createElement("style");
    style.id = STYLES_ID;
    // Colors are driven by CSS custom properties scoped to the sticker panel
    // and the floating button. Defaults are the dark theme. A
    // prefers-color-scheme: light media query flips them to a light theme.
    // The Teams brand purple (#6264a7) is theme-agnostic and stays put on
    // the floating button and accents.
    style.textContent = `
      #${BUTTON_ID} {
        --tfl-accent: #6264a7;
        --tfl-button-fg: #fff;
        --tfl-button-border: rgba(255, 255, 255, 0.15);
      }
      #${PANEL_ID} {
        --tfl-accent: #6264a7;
        --tfl-bg: #2d2c2c;
        --tfl-fg: #e6e6e6;
        --tfl-muted: #aaa;
        --tfl-border: #444;
        --tfl-input-bg: #1f1f1f;
        --tfl-input-border: #555;
        --tfl-input-placeholder: #888;
        --tfl-cell-bg: #1f1f1f;
        --tfl-toast-bg: #c44;
        --tfl-toast-fg: #fff;
        --tfl-cell-delete-bg: rgba(196, 68, 68, 0.92);
      }
      @media (prefers-color-scheme: light) {
        #${BUTTON_ID} {
          --tfl-button-border: rgba(0, 0, 0, 0.15);
        }
        #${PANEL_ID} {
          --tfl-bg: #f5f5f5;
          --tfl-fg: #1f1f1f;
          --tfl-muted: #666;
          --tfl-border: #d4d4d4;
          --tfl-input-bg: #ffffff;
          --tfl-input-border: #b8b8b8;
          --tfl-input-placeholder: #888;
          --tfl-cell-bg: #ffffff;
          --tfl-toast-bg: #c44;
          --tfl-toast-fg: #fff;
          --tfl-cell-delete-bg: rgba(196, 68, 68, 0.92);
        }
      }

      #${BUTTON_ID} {
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        border: 1px solid var(--tfl-button-border);
        background: var(--tfl-accent);
        color: var(--tfl-button-fg);
        font-size: 20px;
        line-height: 1;
        cursor: pointer;
        z-index: 2147483600;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        user-select: none;
      }
      #${BUTTON_ID}:hover { filter: brightness(1.1); }
      #${BUTTON_ID}:focus { outline: 2px solid var(--tfl-button-fg); outline-offset: 2px; }

      #${PANEL_ID} {
        position: fixed;
        bottom: 72px;
        right: 20px;
        width: 320px;
        max-height: 360px;
        background: var(--tfl-bg);
        color: var(--tfl-fg);
        border: 1px solid var(--tfl-border);
        border-radius: 8px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
        z-index: 2147483600;
        display: none;
        flex-direction: column;
        overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 13px;
      }
      #${PANEL_ID}.tfl-sticker-open { display: flex; }
      #${PANEL_ID} .tfl-sticker-header {
        padding: 8px 12px;
        border-bottom: 1px solid var(--tfl-border);
        font-weight: 600;
        flex: 0 0 auto;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      #${PANEL_ID} .tfl-sticker-header-title { flex: 0 0 auto; }
      #${PANEL_ID} .tfl-sticker-url-row {
        display: flex;
        gap: 6px;
        align-items: center;
        flex: 1 1 auto;
      }
      #${PANEL_ID} .tfl-sticker-url-input {
        flex: 1 1 auto;
        min-width: 0;
        padding: 4px 6px;
        background: var(--tfl-input-bg);
        color: var(--tfl-fg);
        border: 1px solid var(--tfl-input-border);
        border-radius: 3px;
        font-size: 12px;
        font-weight: normal;
      }
      #${PANEL_ID} .tfl-sticker-url-input::placeholder { color: var(--tfl-input-placeholder); }
      #${PANEL_ID} .tfl-sticker-url-button {
        padding: 4px 8px;
        background: var(--tfl-accent);
        color: #fff;
        border: none;
        border-radius: 3px;
        font-size: 12px;
        cursor: pointer;
      }
      #${PANEL_ID} .tfl-sticker-url-button:hover { filter: brightness(1.1); }
      #${PANEL_ID} .tfl-sticker-url-button:disabled {
        opacity: 0.5;
        cursor: wait;
      }
      #${PANEL_ID}.tfl-sticker-drop-active {
        outline: 2px dashed var(--tfl-accent);
        outline-offset: -4px;
      }
      #${PANEL_ID} .tfl-sticker-grid {
        padding: 8px;
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 8px;
        overflow-y: auto;
        flex: 1 1 auto;
        align-content: start;
      }
      #${PANEL_ID} .tfl-sticker-cell {
        position: relative;
        background: var(--tfl-cell-bg);
        border: 1px solid transparent;
        border-radius: 4px;
        padding: 4px;
        cursor: pointer;
        aspect-ratio: 1 / 1;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      }
      #${PANEL_ID} .tfl-sticker-cell:hover { border-color: var(--tfl-accent); }
      #${PANEL_ID} .tfl-sticker-cell img {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
        pointer-events: none;
      }
      #${PANEL_ID} .tfl-sticker-cell-delete {
        position: absolute;
        top: 2px;
        right: 2px;
        width: 18px;
        height: 18px;
        border: none;
        border-radius: 50%;
        background: var(--tfl-cell-delete-bg);
        color: #fff;
        font-size: 12px;
        line-height: 1;
        cursor: pointer;
        padding: 0;
        display: none;
        align-items: center;
        justify-content: center;
      }
      #${PANEL_ID} .tfl-sticker-cell:hover .tfl-sticker-cell-delete { display: flex; }
      #${PANEL_ID} .tfl-sticker-cell-delete:hover { filter: brightness(1.1); }
      #${PANEL_ID} .tfl-sticker-empty {
        padding: 16px 12px;
        color: var(--tfl-muted);
        font-size: 12px;
        line-height: 1.4;
        grid-column: 1 / -1;
      }
      #${PANEL_ID} .tfl-sticker-empty code {
        background: var(--tfl-input-bg);
        padding: 1px 4px;
        border-radius: 3px;
        font-size: 11px;
        word-break: break-all;
        display: inline-block;
        margin-top: 6px;
      }
      #${PANEL_ID} .tfl-sticker-toast {
        padding: 8px 12px;
        background: var(--tfl-toast-bg);
        color: var(--tfl-toast-fg);
        font-size: 12px;
        text-align: center;
        flex: 0 0 auto;
      }
    `;
    document.head.appendChild(style);
  }

  #createButton() {
    if (document.getElementById(BUTTON_ID)) {
      return;
    }
    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.setAttribute("aria-label", "Open sticker panel");
    button.title = "Stickers";
    button.textContent = "\u{1F642}"; // slightly smiling face
    button.addEventListener("click", () => {
      this.#togglePanel().catch((err) =>
        console.error(`${LOG_PREFIX} Toggle failed: ${err.message}`),
      );
    });
    document.body.appendChild(button);
  }

  #createPanel() {
    if (document.getElementById(PANEL_ID)) {
      return;
    }
    const panel = document.createElement("div");
    panel.id = PANEL_ID;

    const header = document.createElement("div");
    header.className = "tfl-sticker-header";
    const title = document.createElement("span");
    title.className = "tfl-sticker-header-title";
    title.textContent = "Stickers";
    header.appendChild(title);

    const urlRow = document.createElement("div");
    urlRow.className = "tfl-sticker-url-row";
    const urlInput = document.createElement("input");
    urlInput.id = URL_INPUT_ID;
    urlInput.className = "tfl-sticker-url-input";
    urlInput.type = "url";
    urlInput.placeholder = "Paste image URL";
    urlInput.spellcheck = false;
    const urlButton = document.createElement("button");
    urlButton.className = "tfl-sticker-url-button";
    urlButton.type = "button";
    urlButton.textContent = "Import";
    const triggerImport = () => {
      const value = urlInput.value.trim();
      if (!value) return;
      this.#importUrl(value, urlInput, urlButton).catch((err) =>
        console.error(`${LOG_PREFIX} URL import failed: ${err.message}`),
      );
    };
    urlButton.addEventListener("click", triggerImport);
    urlInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        triggerImport();
      }
    });
    urlRow.appendChild(urlInput);
    urlRow.appendChild(urlButton);
    header.appendChild(urlRow);

    panel.appendChild(header);

    const grid = document.createElement("div");
    grid.className = "tfl-sticker-grid";
    panel.appendChild(grid);

    this.#wireDropTarget(panel);

    document.body.appendChild(panel);
    this.#panel = panel;
    this.#grid = grid;
  }

  #wireDropTarget(panel) {
    panel.addEventListener("dragover", (event) => {
      const types = event.dataTransfer?.types || [];
      if (
        Array.from(types).some(
          (t) => t === "text/uri-list" || t === "text/plain",
        )
      ) {
        event.preventDefault();
        panel.classList.add("tfl-sticker-drop-active");
      }
    });
    panel.addEventListener("dragleave", (event) => {
      // dragleave bubbles from every descendant element. Only clear the
      // drop indicator when the drag actually leaves the panel subtree
      // (relatedTarget is outside the panel, or null when leaving the
      // window entirely).
      if (!panel.contains(event.relatedTarget)) {
        panel.classList.remove("tfl-sticker-drop-active");
      }
    });
    panel.addEventListener("drop", (event) => {
      panel.classList.remove("tfl-sticker-drop-active");
      const data =
        event.dataTransfer?.getData("text/uri-list") ||
        event.dataTransfer?.getData("text/plain") ||
        "";
      // text/uri-list may contain multiple lines; the first non-comment
      // line is the URL.
      const url = data
        .split(/\r?\n/)
        .map((s) => s.trim())
        .find((s) => s && !s.startsWith("#"));
      if (!url) return;
      event.preventDefault();
      const input = document.getElementById(URL_INPUT_ID);
      const button = panel.querySelector(".tfl-sticker-url-button");
      if (input) input.value = url;
      this.#importUrl(url, input, button).catch((err) =>
        console.error(`${LOG_PREFIX} URL import failed: ${err.message}`),
      );
    });
  }

  async #importUrl(url, input, button) {
    if (button) {
      button.disabled = true;
      button.textContent = "Importing...";
    }
    let result;
    try {
      result = await this.#ipcRenderer.invoke("import-sticker-url", url);
    } catch (err) {
      this.#showToast(`Import failed: ${err.message}`);
      console.error(`${LOG_PREFIX} URL import IPC failed: ${err.message}`);
      return;
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = "Import";
      }
    }
    if (!result?.success) {
      this.#showToast(result?.error || "Import failed");
      return;
    }
    if (input) input.value = "";
    await this.#refreshStickers();
  }

  async #togglePanel() {
    if (!this.#panel) {
      return;
    }
    if (this.#panelOpen) {
      this.#closePanel();
    } else {
      await this.#openPanel();
    }
  }

  async #openPanel() {
    this.#panel.classList.add("tfl-sticker-open");
    this.#panelOpen = true;
    await this.#refreshStickers();
  }

  #closePanel() {
    this.#panel.classList.remove("tfl-sticker-open");
    this.#panelOpen = false;
  }

  async #refreshStickers() {
    this.#clearGrid();
    const loading = document.createElement("div");
    loading.className = "tfl-sticker-empty";
    loading.textContent = "Loading...";
    this.#grid.appendChild(loading);

    let result;
    try {
      result = await this.#ipcRenderer.invoke("get-sticker-list");
    } catch (err) {
      console.error(`${LOG_PREFIX} Failed to fetch sticker list: ${err.message}`);
      this.#clearGrid();
      this.#renderEmpty(null);
      return;
    }

    const folder = result?.folder ?? "";
    const stickers = Array.isArray(result?.stickers) ? result.stickers : [];

    this.#clearGrid();
    if (stickers.length === 0) {
      this.#renderEmpty(folder);
      return;
    }

    for (const sticker of stickers) {
      const cell = document.createElement("div");
      cell.className = "tfl-sticker-cell";
      cell.title = sticker.name;
      const img = document.createElement("img");
      img.src = sticker.dataUrl;
      img.alt = sticker.name;
      cell.appendChild(img);
      cell.addEventListener("click", () => {
        this.#sendSticker(sticker).catch((err) =>
          console.error(`${LOG_PREFIX} Send failed: ${err.message}`),
        );
      });

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "tfl-sticker-cell-delete";
      deleteBtn.type = "button";
      deleteBtn.setAttribute("aria-label", `Delete sticker ${sticker.name}`);
      deleteBtn.title = "Delete sticker";
      deleteBtn.textContent = "×"; // ×
      deleteBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        this.#deleteSticker(sticker).catch((err) =>
          console.error(`${LOG_PREFIX} Delete failed: ${err.message}`),
        );
      });
      cell.appendChild(deleteBtn);

      this.#grid.appendChild(cell);
    }
  }

  async #deleteSticker(sticker) {
    const ok = globalThis.confirm(`Delete sticker "${sticker.name}"?`);
    if (!ok) return;
    let result;
    try {
      result = await this.#ipcRenderer.invoke("delete-sticker", {
        name: sticker.name,
        subfolder: sticker.subfolder || "",
      });
    } catch (err) {
      this.#showToast(`Delete failed: ${err.message}`);
      return;
    }
    if (!result?.success) {
      this.#showToast(result?.error || "Delete failed");
      return;
    }
    await this.#refreshStickers();
  }

  #clearGrid() {
    while (this.#grid.firstChild) {
      this.#grid.firstChild.remove();
    }
  }

  #renderEmpty(folder) {
    const empty = document.createElement("div");
    empty.className = "tfl-sticker-empty";
    if (folder) {
      empty.appendChild(
        document.createTextNode(
          "No stickers yet. Paste an image URL above, drop one on this panel, or drop PNG / JPEG / GIF / WebP files into:",
        ),
      );
      const code = document.createElement("code");
      code.textContent = folder;
      empty.appendChild(code);
    } else {
      empty.textContent =
        "Sticker folder could not be read. Check the application log.";
    }
    this.#grid.appendChild(empty);
  }

  #findCompose() {
    for (const selector of COMPOSE_SELECTORS) {
      const el = document.querySelector(selector);
      if (el) {
        return el;
      }
    }
    return null;
  }

  async #sendSticker(sticker) {
    const compose = this.#findCompose();
    if (!compose) {
      this.#showToast("Click into a chat compose box first.");
      return;
    }

    let file;
    try {
      const response = await fetch(sticker.dataUrl);
      const blob = await response.blob();
      file = new File([blob], sticker.name, { type: sticker.mimeType });
    } catch (err) {
      console.error(`${LOG_PREFIX} Failed to build sticker file: ${err.message}`);
      this.#showToast("Could not prepare sticker for paste.");
      return;
    }

    compose.focus();
    // Brief delay lets the focus event flush before we dispatch paste.
    await new Promise((r) => setTimeout(r, 30));

    const dt = new DataTransfer();
    dt.items.add(file);
    const event = new ClipboardEvent("paste", {
      clipboardData: dt,
      bubbles: true,
      cancelable: true,
    });

    const dispatched = compose.dispatchEvent(event);
    if (dispatched && !event.defaultPrevented) {
      // Teams's handler did not consume the event — the image probably will not
      // have been inserted. Warn so the user knows; UX is the same either way.
      console.warn(
        `${LOG_PREFIX} Synthetic paste was not consumed by the editor`,
      );
    }

    this.#closePanel();
  }

  #showToast(message) {
    if (!this.#panel) {
      return;
    }
    let toast = this.#panel.querySelector(".tfl-sticker-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "tfl-sticker-toast";
      this.#panel.appendChild(toast);
    }
    toast.textContent = message;
    if (this.#toastTimer) {
      clearTimeout(this.#toastTimer);
    }
    this.#toastTimer = setTimeout(() => {
      toast.remove();
      this.#toastTimer = null;
    }, 2500);
  }
}

module.exports = new CustomStickers();
