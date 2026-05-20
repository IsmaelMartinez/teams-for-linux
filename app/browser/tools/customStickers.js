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
  #button = null;
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
    style.textContent = `
      #${BUTTON_ID} {
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 40px;
        height: 40px;
        border-radius: 50%;
        border: 1px solid rgba(255, 255, 255, 0.15);
        background: #6264a7;
        color: #fff;
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
      #${BUTTON_ID}:focus { outline: 2px solid #fff; outline-offset: 2px; }

      #${PANEL_ID} {
        position: fixed;
        bottom: 72px;
        right: 20px;
        width: 320px;
        max-height: 360px;
        background: #2d2c2c;
        color: #e6e6e6;
        border: 1px solid #444;
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
        border-bottom: 1px solid #444;
        font-weight: 600;
        flex: 0 0 auto;
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
        background: #1f1f1f;
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
      #${PANEL_ID} .tfl-sticker-cell:hover { border-color: #6264a7; }
      #${PANEL_ID} .tfl-sticker-cell img {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
        pointer-events: none;
      }
      #${PANEL_ID} .tfl-sticker-empty {
        padding: 16px 12px;
        color: #aaa;
        font-size: 12px;
        line-height: 1.4;
        grid-column: 1 / -1;
      }
      #${PANEL_ID} .tfl-sticker-empty code {
        background: #1f1f1f;
        padding: 1px 4px;
        border-radius: 3px;
        font-size: 11px;
        word-break: break-all;
        display: inline-block;
        margin-top: 6px;
      }
      #${PANEL_ID} .tfl-sticker-toast {
        padding: 8px 12px;
        background: #c44;
        color: #fff;
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
    button.addEventListener("click", () => this.#togglePanel());
    document.body.appendChild(button);
    this.#button = button;
  }

  #createPanel() {
    if (document.getElementById(PANEL_ID)) {
      return;
    }
    const panel = document.createElement("div");
    panel.id = PANEL_ID;

    const header = document.createElement("div");
    header.className = "tfl-sticker-header";
    header.textContent = "Stickers";
    panel.appendChild(header);

    const grid = document.createElement("div");
    grid.className = "tfl-sticker-grid";
    panel.appendChild(grid);

    document.body.appendChild(panel);
    this.#panel = panel;
    this.#grid = grid;
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
      cell.addEventListener("click", () => this.#sendSticker(sticker));
      this.#grid.appendChild(cell);
    }
  }

  #clearGrid() {
    while (this.#grid.firstChild) {
      this.#grid.removeChild(this.#grid.firstChild);
    }
  }

  #renderEmpty(folder) {
    const empty = document.createElement("div");
    empty.className = "tfl-sticker-empty";
    if (folder) {
      empty.appendChild(
        document.createTextNode(
          "No stickers found. Drop PNG / JPEG / GIF files into:",
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
