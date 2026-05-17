/**
 * spike/2476-stickers/devtools-paste-test.js
 *
 * Paste this entire file into the DevTools Console of a running teams-for-linux
 * session, with a 1:1 chat open and the compose box visible. It mounts a small
 * floating panel in the bottom-right of the window with three buttons:
 *
 *   - "Phase 0: inspect compose"  — locate the compose element and log everything
 *                                   the spike needs to know about its listeners.
 *   - "Phase 1: synthetic paste"  — dispatch a synthetic ClipboardEvent('paste')
 *                                   at the compose element with a generated PNG
 *                                   in clipboardData. Logs the outcome.
 *   - "Phase 2: keystroke paste"  — placeholder; requires the matching IPC handler
 *                                   from Phase 2 of the spike plan. Logs "needs
 *                                   main-process side" until that lands.
 *
 * The harness generates a 64x64 cyan square PNG at runtime via OffscreenCanvas,
 * so no external assets are needed. The PNG is also dumped to the console as a
 * data URL so you can verify it visually.
 *
 * The harness does not modify Teams. It only attaches a floating div, dispatches
 * one synthetic event when you click, and logs. Closing the panel removes the div.
 */

(() => {
  const PANEL_ID = "tfl-sticker-spike-panel";
  const existing = document.getElementById(PANEL_ID);
  if (existing) {
    existing.remove();
    console.log("[STICKER-SPIKE] removed existing panel; re-run to mount fresh");
    return;
  }

  // -------- Compose element discovery --------

  function findCompose() {
    // Try the most specific signals first.
    const candidates = [
      'div[id^="new-message-"]',
      'div[contenteditable="true"][role="textbox"][aria-label*="message" i]',
      'div[contenteditable="true"][role="textbox"]',
      '[contenteditable="true"][aria-label*="message" i]',
      '[data-tid*="ckeditor"]',
      '[data-tid*="message-area"]',
      '.ck-editor__editable',
    ];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el) return { el, selector: sel };
    }
    return { el: null, selector: null };
  }

  // -------- Test PNG generation (64x64 cyan square with a black border) --------

  async function makeTestPng() {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#00b7c3";
    ctx.fillRect(0, 0, 64, 64);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, 60, 60);
    ctx.fillStyle = "#000";
    ctx.font = "bold 18px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("SPIKE", 32, 32);
    const blob = await new Promise(r => canvas.toBlob(r, "image/png"));
    if (!blob) throw new Error("canvas.toBlob returned null — cannot generate test PNG");
    const buf = await blob.arrayBuffer();
    return { blob, buf, dataUrl: canvas.toDataURL("image/png") };
  }

  // -------- Phase 0: inspect compose --------

  function phase0Inspect() {
    console.group("[STICKER-SPIKE] Phase 0 — compose inspection");
    const { el, selector } = findCompose();
    if (!el) {
      console.warn("compose element not found with any known selector. Focus the compose box and try again, or add a selector to the harness.");
      console.groupEnd();
      return;
    }
    console.log("compose element:", el);
    console.log("matched selector:", selector);
    console.log("id:", el.id);
    console.log("role:", el.getAttribute("role"));
    console.log("contenteditable:", el.contentEditable);
    console.log("aria-label:", el.getAttribute("aria-label"));
    console.log("data-* attributes:", Array.from(el.attributes).filter(a => a.name.startsWith("data-")).map(a => `${a.name}=${a.value}`));
    console.log("bounding rect:", el.getBoundingClientRect());

    // Listeners are not enumerable from JS, but we can at least log what we know.
    console.log("note: paste/drop listeners are not enumerable from JS. Use DevTools Elements > Event Listeners panel to inspect them on the element above.");

    // Detect any wrapping editor framework signals.
    const editorSignals = {
      hasProseMirror: !!el.closest(".ProseMirror, [data-prosemirror]"),
      hasSlate: !!el.closest("[data-slate-editor]"),
      hasLexical: !!el.closest("[data-lexical-editor]"),
      hasCkEditor: !!el.closest(".ck-editor, .ck-editor__editable"),
    };
    console.log("editor framework signals:", editorSignals);
    console.groupEnd();
    return el;
  }

  // -------- Phase 1: synthetic ClipboardEvent --------

  async function phase1Synthetic() {
    console.group("[STICKER-SPIKE] Phase 1 — synthetic ClipboardEvent");
    const { el } = findCompose();
    if (!el) {
      console.warn("compose element not found; aborting Phase 1");
      console.groupEnd();
      return;
    }
    el.focus();
    await new Promise(r => setTimeout(r, 50));

    const png = await makeTestPng();
    console.log("test PNG data URL (paste into a new tab to verify):", png.dataUrl);

    const file = new File([png.blob], "spike-sticker.png", { type: "image/png" });
    const dt = new DataTransfer();
    dt.items.add(file);

    console.log("DataTransfer state before dispatch:", {
      itemsLength: dt.items.length,
      filesLength: dt.files.length,
      types: Array.from(dt.types),
    });

    const ev = new ClipboardEvent("paste", {
      clipboardData: dt,
      bubbles: true,
      cancelable: true,
    });
    console.log("event.isTrusted (will be false):", ev.isTrusted);

    // Snapshot the before-state: child count, innerHTML length, AND the set of
    // blob/data image srcs under the compose root. The image-count delta is the
    // actual signal — counting absolute images would false-positive on any pre-
    // existing attachment or chat-history image the selector happens to catch.
    const composeRoot = el.closest('[role="region"], [data-tid*="message"]') || el.parentElement;
    const snapshotImageSrcs = (root) => {
      if (!root) return new Set();
      return new Set(Array.from(root.querySelectorAll('img[src^="blob:"], img[src^="data:"]')).map(i => i.src));
    };
    const beforeChildCount = el.children.length;
    const beforeHtml = el.innerHTML.length;
    const beforeImgSrcs = snapshotImageSrcs(composeRoot);
    const dispatched = el.dispatchEvent(ev);
    console.log("dispatchEvent returned:", dispatched, "(true means not cancelled)");
    console.log("event.defaultPrevented:", ev.defaultPrevented);

    // Give Teams's handler a moment to react.
    await new Promise(r => setTimeout(r, 500));

    const afterChildCount = el.children.length;
    const afterHtml = el.innerHTML.length;
    const afterImgSrcs = snapshotImageSrcs(composeRoot);
    console.log("compose children: before=", beforeChildCount, "after=", afterChildCount);
    console.log("compose innerHTML length: before=", beforeHtml, "after=", afterHtml);

    // New images = post-snapshot srcs that were not in the pre-snapshot.
    const newImgSrcs = Array.from(afterImgSrcs).filter(s => !beforeImgSrcs.has(s));
    console.log("blob/data images before:", beforeImgSrcs.size, "after:", afterImgSrcs.size, "newly inserted:", newImgSrcs.length);
    newImgSrcs.forEach((src, i) => console.log(`  [${i}]`, src.slice(0, 80) + "..."));

    // Verdict heuristic — only the delta matters; never count absolute presence.
    if (newImgSrcs.length > 0 || afterHtml > beforeHtml + 50) {
      console.log("%c[STICKER-SPIKE] Phase 1 likely SUCCESS — image appears in compose. Verify visually, then try to send the message.", "color: #3fb950; font-weight: bold;");
    } else if (ev.defaultPrevented) {
      console.log("%c[STICKER-SPIKE] Phase 1 PARTIAL — Teams handler called preventDefault(), so it saw the event. But no inserted image detected. The handler may be reading clipboardData.files differently than we provided, or may be filtering on isTrusted. Inspect the handler source via Sources > Event Listeners.", "color: #d29922; font-weight: bold;");
    } else {
      console.log("%c[STICKER-SPIKE] Phase 1 FAIL — synthetic paste did not produce an inserted image and Teams handler did not even preventDefault. Proceed to Phase 2 (keystroke paste).", "color: #f85149; font-weight: bold;");
    }
    console.groupEnd();
  }

  // -------- Phase 2 stub (requires main-process IPC) --------

  function phase2Stub() {
    console.group("[STICKER-SPIKE] Phase 2 — keystroke paste (stub)");
    console.warn("Phase 2 requires a main-process IPC handler that does clipboard.writeImage + webContents.sendInputEvent for Ctrl+V, then restores the prior clipboard. Not yet wired up — see SPIKE.md Phase 2 for the design. This button is here as a reminder to wire it up if Phase 1 fails.");
    console.groupEnd();
  }

  // -------- Floating panel UI --------

  const panel = document.createElement("div");
  panel.id = PANEL_ID;
  Object.assign(panel.style, {
    position: "fixed",
    bottom: "20px",
    right: "20px",
    zIndex: "2147483647",
    background: "#161b22",
    color: "#e6edf3",
    border: "1px solid #30363d",
    borderRadius: "8px",
    padding: "12px",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontSize: "13px",
    boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
    display: "flex",
    flexDirection: "column",
    gap: "8px",
    minWidth: "220px",
  });
  const title = document.createElement("div");
  title.textContent = "Sticker spike (#2476)";
  Object.assign(title.style, { fontWeight: "600", fontSize: "12px", color: "#8d96a0" });
  panel.appendChild(title);

  function mkBtn(label, fn, color = "#58a6ff") {
    const b = document.createElement("button");
    b.textContent = label;
    Object.assign(b.style, {
      background: "#1c2128",
      border: `1px solid ${color}`,
      color,
      padding: "6px 10px",
      borderRadius: "6px",
      cursor: "pointer",
      fontFamily: "inherit",
      fontSize: "12px",
      textAlign: "left",
    });
    b.addEventListener("click", fn);
    return b;
  }

  panel.appendChild(mkBtn("Phase 0: inspect compose", phase0Inspect));
  panel.appendChild(mkBtn("Phase 1: synthetic paste", () => { phase1Synthetic().catch(e => console.error(e)); }, "#d29922"));
  panel.appendChild(mkBtn("Phase 2: keystroke paste (stub)", phase2Stub, "#f85149"));

  const close = mkBtn("Close panel", () => panel.remove(), "#8d96a0");
  Object.assign(close.style, { marginTop: "4px", borderColor: "#30363d", color: "#8d96a0" });
  panel.appendChild(close);

  document.body.appendChild(panel);
  console.log("[STICKER-SPIKE] panel mounted. Run Phase 0 first, then Phase 1. See spike/2476-stickers/SPIKE.md for the full plan.");
})();
