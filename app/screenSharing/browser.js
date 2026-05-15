// In-app screen-share picker. Loaded inside a child WebContentsView that
// covers the main Teams window while the user picks a source. See
// app/screenSharing/index.js for the host plumbing and
// app/screenSharing/service.js for the IPC handlers.

const SVG_NS = "http://www.w3.org/2000/svg";

const QUALITY_OPTIONS = [
  { id: "720p",  width: 1280, height: 720,  label: "720p",  tag: "draft" },
  { id: "1080p", width: 1920, height: 1080, label: "1080p", tag: "default", default: true },
  { id: "2k",    width: 2048, height: 1080, label: "2K",    tag: "high" },
  { id: "4k",    width: 3840, height: 2160, label: "4K",    tag: "max" },
];

const THUMBNAIL_SIZE = { width: 640, height: 360 };

const DEFAULT_QUALITY = QUALITY_OPTIONS.find((q) => q.default) || QUALITY_OPTIONS[0];

const state = {
  displays: [],
  sources: [],
  screenItems: [],   // joined: source + display info, sorted
  windowItems: [],
  activeTab: "screens",
  searchTerm: "",
  selectedId: "",        // source id of the picked screen or window, "" when none
  selectedKind: "",      // "screen" | "window" | "" when nothing is selected
  hoveredScreenId: "",   // source id of the hovered/focused screen tile, "" when none
  quality: DEFAULT_QUALITY.id,
};

globalThis.addEventListener("DOMContentLoaded", () => {
  populateQualityMenu();
  wireEvents();
  void loadSources();
});

function populateQualityMenu() {
  const menu = document.getElementById("quality-menu");
  for (const q of QUALITY_OPTIONS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("role", "option");
    btn.dataset.quality = q.id;
    btn.setAttribute("aria-selected", q.id === state.quality ? "true" : "false");

    const label = document.createElement("span");
    label.textContent = q.label;
    btn.appendChild(label);

    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = q.tag;
    btn.appendChild(tag);

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      setQuality(q.id);
      closeQualityMenu();
    });
    menu.appendChild(btn);
  }
  updateQualityLabel();
}

function setQuality(id) {
  state.quality = id;
  updateQualityLabel();
  for (const btn of document.querySelectorAll("#quality-menu button")) {
    btn.setAttribute("aria-selected", btn.dataset.quality === id ? "true" : "false");
  }
}

function updateQualityLabel() {
  const q = QUALITY_OPTIONS.find((o) => o.id === state.quality) || DEFAULT_QUALITY;
  document.getElementById("quality-val").textContent = q.label;
}

function openQualityMenu() {
  document.getElementById("quality-chip").classList.add("open");
  document.getElementById("quality-trigger").setAttribute("aria-expanded", "true");
}

function closeQualityMenu() {
  document.getElementById("quality-chip").classList.remove("open");
  document.getElementById("quality-trigger").setAttribute("aria-expanded", "false");
}

function wireEvents() {
  document.getElementById("btn-cancel").addEventListener("click", cancel);
  document.getElementById("btn-share").addEventListener("click", shareSelection);

  document.getElementById("search-input").addEventListener("input", (e) => {
    state.searchTerm = e.target.value;
    renderWindows();
  });

  for (const tab of document.querySelectorAll(".seg button")) {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
    tab.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        switchTab(tab.dataset.tab);
      }
    });
  }

  const qChip = document.getElementById("quality-chip");
  const qTrigger = document.getElementById("quality-trigger");
  qTrigger.addEventListener("click", () => {
    qChip.classList.contains("open") ? closeQualityMenu() : openQualityMenu();
  });
  qTrigger.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && qChip.classList.contains("open")) {
      e.stopPropagation();
      closeQualityMenu();
    }
  });
  document.addEventListener("click", (e) => {
    if (!qChip.contains(e.target)) closeQualityMenu();
  });

  document.addEventListener("keydown", onGlobalKeydown);
}

function onGlobalKeydown(e) {
  if (e.key === "Escape") { cancel(); return; }

  const target = e.target;
  const tag = (target?.tagName || "").toLowerCase();
  const inField = tag === "input" || tag === "select" || tag === "textarea";
  // Don't let the global Enter / arrow shortcuts fire while the focus is on
  // the quality chip — Enter and arrow keys belong to the chip's own
  // popover-menu interaction.
  const inQuality = !!target?.closest?.("#quality-chip");

  if (e.key === "Enter" && state.selectedId && !inField && !inQuality) {
    shareSelection();
    return;
  }

  if (state.activeTab === "screens" && !inField && !inQuality &&
      ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
    e.preventDefault();
    navigateScreensSpatial(e.key);
  }
}

async function loadSources() {
  let displays = [];
  try {
    displays = await globalThis.api.getDisplays();
  } catch (err) {
    console.debug("[picker] getDisplays failed", err);
  }
  state.displays = Array.isArray(displays) ? displays : [];

  let sources = [];
  try {
    sources = await globalThis.api.desktopCapturerGetSources({
      types: ["window", "screen"],
      thumbnailSize: THUMBNAIL_SIZE,
      fetchWindowIcons: true,
    });
  } catch (err) {
    console.debug("[picker] desktopCapturerGetSources failed", err);
    sources = [];
  }
  state.sources = Array.isArray(sources) ? sources : [];

  joinAndSort();
  updateHeaderMeta();
  renderActivePane();
  renderDetail();

  if (state.sources.length === 0) {
    showEmptyState(
      "No screens or windows available",
      "This may be a system-permissions or compositor issue. On Wayland, ensure xdg-desktop-portal is installed and running."
    );
  }
}

function joinAndSort() {
  // Screens: join with display info by display_id; sort by internal-first,
  // then bounds.y, then bounds.x. Tiles render in a uniform 2-row grid; the
  // sort keeps the user's primary display in the top-left.
  const displayById = new Map(state.displays.map((d) => [String(d.id), d]));
  const screenSources = state.sources.filter((s) => s.id.startsWith("screen:"));
  state.screenItems = screenSources
    .map((source, i) => {
      const display = source.display_id ? displayById.get(String(source.display_id)) : null;
      return {
        source,
        label: display?.label || source.name || `Display ${i + 1}`,
        internal: !!display?.internal,
        bounds: display?.bounds || null,
        scaleFactor: display?.scaleFactor || 1,
        displayFrequency: display?.displayFrequency || null,
      };
    })
    .sort((a, b) => {
      if (a.internal !== b.internal) return a.internal ? -1 : 1;
      // Items without bounds (some Wayland portal setups expose no
      // display_id) sort to the end deterministically; source.id is a
      // stable tiebreaker.
      if (!a.bounds && !b.bounds) return a.source.id.localeCompare(b.source.id);
      if (!a.bounds) return 1;
      if (!b.bounds) return -1;
      return (a.bounds.y - b.bounds.y) || (a.bounds.x - b.bounds.x);
    })
    .map((item, displayNumber) => ({ ...item, displayNumber: displayNumber + 1 }));

  state.windowItems = state.sources.filter((s) => s.id.startsWith("window:"));
}

function updateHeaderMeta() {
  const s = state.screenItems.length;
  const w = state.windowItems.length;
  const screensLbl = s === 1 ? "1 display" : `${s} displays`;
  const windowsLbl = w === 1 ? "1 window" : `${w} windows`;
  document.getElementById("head-meta").textContent = `${screensLbl} · ${windowsLbl}`;
  document.getElementById("count-screens").textContent = String(s);
  document.getElementById("count-windows").textContent = String(w);
}

function renderActivePane() {
  document.getElementById("empty-state").hidden = true;
  const isScreens = state.activeTab === "screens";
  document.getElementById("pane-screens").classList.toggle("active", isScreens);
  document.getElementById("pane-windows").classList.toggle("active", !isScreens);
  document.getElementById("search-wrap").classList.toggle("disabled", isScreens);

  if (isScreens) {
    renderScreens();
  } else {
    renderWindows();
  }
}

function renderScreens() {
  const grid = document.getElementById("screens-grid");
  grid.replaceChildren();

  if (state.screenItems.length === 0) {
    showEmptyState(
      "No screens available",
      "Connect a display or check system permissions."
    );
    return;
  }

  for (const item of state.screenItems) {
    grid.appendChild(buildScreenTile(item));
  }
}

function buildCheckSvg() {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", "11");
  svg.setAttribute("height", "11");
  svg.setAttribute("viewBox", "0 0 12 12");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", "M2.5 6.5l2.5 2.5 4.5-5");
  svg.appendChild(path);
  return svg;
}

function buildScreenTile(item) {
  const tile = document.createElement("div");
  tile.className = "screen-tile";
  tile.tabIndex = 0;
  tile.dataset.id = item.source.id;
  tile.setAttribute("role", "option");
  tile.setAttribute(
    "aria-label",
    `${item.label}${item.internal ? " (Main)" : ""}, display ${item.displayNumber}`
  );

  const face = document.createElement("div");
  face.className = "face";
  if (item.source.thumbnailDataUrl?.startsWith("data:")) {
    const img = document.createElement("img");
    img.className = "thumb";
    img.src = item.source.thumbnailDataUrl;
    img.alt = "";
    face.appendChild(img);
  }
  tile.appendChild(face);

  const num = document.createElement("div");
  num.className = "num";
  num.textContent = String(item.displayNumber);
  tile.appendChild(num);

  if (item.internal) {
    const mainBadge = document.createElement("div");
    mainBadge.className = "main-badge";
    mainBadge.textContent = "MAIN";
    tile.appendChild(mainBadge);
  }

  const check = document.createElement("div");
  check.className = "check";
  check.setAttribute("aria-hidden", "true");
  check.appendChild(buildCheckSvg());
  tile.appendChild(check);

  const name = document.createElement("div");
  name.className = "name";
  const lbl = document.createElement("span");
  lbl.className = "lbl";
  lbl.textContent = item.label;
  name.appendChild(lbl);
  if (item.bounds) {
    const res = document.createElement("span");
    res.className = "res";
    res.textContent = `${item.bounds.width}×${item.bounds.height}`;
    name.appendChild(res);
  }
  tile.appendChild(name);

  const stand = document.createElement("div");
  stand.className = "stand";
  tile.appendChild(stand);

  tile.addEventListener("pointerenter", () => setHoveredScreen(item.source.id));
  tile.addEventListener("pointerleave", () => setHoveredScreen(null));
  tile.addEventListener("focus", () => setHoveredScreen(item.source.id));
  tile.addEventListener("blur", () => setHoveredScreen(null));
  tile.addEventListener("click", () => setSelectedScreen(item.source.id));
  tile.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setSelectedScreen(item.source.id);
    }
  });

  if (state.selectedKind === "screen" && state.selectedId === item.source.id) {
    tile.classList.add("selected");
  }
  return tile;
}

function setHoveredScreen(id) {
  state.hoveredScreenId = id || "";
  renderDetail();
}

function setSelectedScreen(id) {
  state.selectedId = id;
  state.selectedKind = "screen";
  applySelectionClasses();
  renderDetail();
  updateShareButton();
}

function setSelectedWindow(id) {
  state.selectedId = id;
  state.selectedKind = "window";
  applySelectionClasses();
  renderDetail();
  updateShareButton();
}

function applySelectionClasses() {
  for (const t of document.querySelectorAll(".screen-tile.selected, .window-tile.selected")) {
    t.classList.remove("selected");
  }
  if (!state.selectedId) return;
  const sel = state.selectedKind === "screen" ? ".screen-tile" : ".window-tile";
  const tile = document.querySelector(`${sel}[data-id="${CSS.escape(state.selectedId)}"]`);
  if (tile) tile.classList.add("selected");
}

function renderDetail() {
  const showId = currentDetailId();
  if (!showId) { clearDetail(); return; }
  const item = state.screenItems.find((s) => s.source.id === showId);
  if (!item) { clearDetail(); return; }
  populateDetail(item, showId);
}

function currentDetailId() {
  const hover = state.activeTab === "screens" ? state.hoveredScreenId : "";
  const selected = state.selectedKind === "screen" ? state.selectedId : "";
  return hover || selected;
}

function clearDetail() {
  removePreviewChildren();
  document.getElementById("preview-placeholder").hidden = false;
  document.getElementById("specs").hidden = true;
  document.getElementById("detail-name").textContent = "No display selected";
  document.getElementById("detail-label").textContent = "PREVIEW";
}

function populateDetail(item, showId) {
  const preview = document.getElementById("preview");
  removePreviewChildren();
  document.getElementById("preview-placeholder").hidden = true;
  document.getElementById("specs").hidden = false;

  if (item.source.thumbnailDataUrl?.startsWith("data:")) {
    const img = document.createElement("img");
    img.className = "thumb";
    img.src = item.source.thumbnailDataUrl;
    img.alt = "";
    preview.appendChild(img);
  }
  const stamp = document.createElement("span");
  stamp.className = "stamp";
  stamp.textContent = `${THUMBNAIL_SIZE.width} × ${THUMBNAIL_SIZE.height}`;
  preview.appendChild(stamp);

  document.getElementById("detail-label").textContent = detailLabel(showId);
  renderDetailName(item);
  renderDetailSpecs(item);
}

function removePreviewChildren() {
  const preview = document.getElementById("preview");
  for (const node of preview.querySelectorAll("img.thumb, .stamp")) node.remove();
}

function detailLabel(showId) {
  const selectedScreenId = state.selectedKind === "screen" ? state.selectedId : "";
  if (selectedScreenId === showId) return "PREVIEW · SELECTED";
  if (state.hoveredScreenId === showId) return "PREVIEW · HOVER";
  return "PREVIEW";
}

function renderDetailName(item) {
  const nameEl = document.getElementById("detail-name");
  nameEl.replaceChildren();
  nameEl.append(item.label);
  if (item.internal) {
    const sub = document.createElement("span");
    sub.className = "sub";
    sub.textContent = "Primary display";
    nameEl.appendChild(sub);
  }
}

function renderDetailSpecs(item) {
  document.getElementById("spec-res").textContent =
    item.bounds ? `${item.bounds.width}×${item.bounds.height}` : "—";
  document.getElementById("spec-hz").textContent =
    item.displayFrequency ? `${item.displayFrequency} Hz` : "—";
  document.getElementById("spec-scale").textContent = `${item.scaleFactor}×`;
  document.getElementById("spec-pos").textContent =
    item.bounds ? `(${item.bounds.x}, ${item.bounds.y})` : "—";
  document.getElementById("spec-num").textContent = String(item.displayNumber);
}

function renderWindows() {
  const grid = document.getElementById("windows-grid");
  grid.replaceChildren();

  const term = state.searchTerm.toLowerCase().trim();
  const visible = state.windowItems.filter(
    (s) => !term || (s.name || "").toLowerCase().includes(term)
  );

  if (visible.length === 0) {
    showEmptyState(
      term ? "No windows match your filter" : "No windows available",
      term ? "Try a different search term." : "Open an application window and try again."
    );
    return;
  }

  document.getElementById("empty-state").hidden = true;

  for (const source of visible) {
    grid.appendChild(buildWindowTile(source));
  }
}

function buildWindowTile(source) {
  const tile = document.createElement("div");
  tile.className = "window-tile";
  tile.tabIndex = 0;
  tile.dataset.id = source.id;
  tile.setAttribute("role", "option");
  tile.setAttribute("aria-label", source.name || "Window");

  const thumb = document.createElement("div");
  thumb.className = "thumb";
  if (source.thumbnailDataUrl?.startsWith("data:")) {
    thumb.style.backgroundImage = `url("${cssEscapeUrl(source.thumbnailDataUrl)}")`;
  }
  tile.appendChild(thumb);

  const metaRow = document.createElement("div");
  metaRow.className = "meta";

  const ico = document.createElement("div");
  if (source.appIconDataUrl?.startsWith("data:")) {
    ico.className = "ico";
    ico.style.backgroundImage = `url("${cssEscapeUrl(source.appIconDataUrl)}")`;
  } else {
    ico.className = "ico ico-fallback";
    ico.textContent = (source.name || "?").trim().slice(0, 1).toUpperCase();
  }
  metaRow.appendChild(ico);

  const titleWrap = document.createElement("div");
  titleWrap.className = "title-wrap";
  const title = document.createElement("div");
  title.className = "title";
  title.textContent = source.name || "Untitled";
  title.title = source.name || "";
  titleWrap.appendChild(title);
  metaRow.appendChild(titleWrap);

  tile.appendChild(metaRow);

  tile.addEventListener("click", () => setSelectedWindow(source.id));
  tile.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setSelectedWindow(source.id);
    }
  });

  if (state.selectedKind === "window" && state.selectedId === source.id) {
    tile.classList.add("selected");
  }
  return tile;
}

// Data URLs from NativeImage are base64-encoded PNGs so they cannot
// contain backslashes or double quotes in practice. Escape both anyway
// (backslash first, otherwise the escape introduced by the quote
// replacement would be double-escaped) as defence-in-depth — CodeQL
// flags the partial-escape pattern even when it cannot be exploited.
function cssEscapeUrl(url) {
  return url.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function switchTab(tab) {
  if (tab !== "screens" && tab !== "windows") return;
  state.activeTab = tab;
  for (const btn of document.querySelectorAll(".seg button")) {
    btn.setAttribute("aria-selected", btn.dataset.tab === tab ? "true" : "false");
  }
  renderActivePane();
  renderDetail();
}

function updateShareButton() {
  const btn = document.getElementById("btn-share");
  const label = document.getElementById("btn-share-label");
  const has = !!state.selectedId;
  btn.disabled = !has;
  label.textContent = has && state.selectedKind === "window" ? "Share window" : "Share screen";
}

function showEmptyState(title, body) {
  document.getElementById("pane-screens").classList.remove("active");
  document.getElementById("pane-windows").classList.remove("active");
  const el = document.getElementById("empty-state");
  el.replaceChildren();
  const t = document.createElement("div");
  t.className = "title";
  t.textContent = title;
  el.appendChild(t);
  const b = document.createElement("div");
  b.className = "body";
  b.textContent = body;
  el.appendChild(b);
  el.hidden = false;
}

// Picks the candidate whose center is in the requested direction relative
// to the current tile's center, biased so the dominant axis matches the
// arrow key (e.g. ArrowLeft requires |dx| > |dy|).
const SPATIAL_ALIGNERS = {
  ArrowLeft:  (dx, dy) => dx < 0 && Math.abs(dx) > Math.abs(dy),
  ArrowRight: (dx, dy) => dx > 0 && Math.abs(dx) > Math.abs(dy),
  ArrowUp:    (dx, dy) => dy < 0 && Math.abs(dy) > Math.abs(dx),
  ArrowDown:  (dx, dy) => dy > 0 && Math.abs(dy) > Math.abs(dx),
};

function navigateScreensSpatial(key) {
  const aligned = SPATIAL_ALIGNERS[key];
  const items = state.screenItems;
  if (!aligned || items.length === 0) return;

  const cur = items.find((i) => i.source.id === currentScreenIdForNav(items));
  if (!cur?.bounds) return;

  const best = pickClosestAligned(items, cur, aligned);
  if (!best) return;
  const tile = document.querySelector(`.screen-tile[data-id="${CSS.escape(best.source.id)}"]`);
  tile?.focus();
}

function currentScreenIdForNav(items) {
  if (state.selectedKind === "screen" && state.selectedId) return state.selectedId;
  if (state.hoveredScreenId) return state.hoveredScreenId;
  return items[0].source.id;
}

function pickClosestAligned(items, cur, aligned) {
  const cx = cur.bounds.x + cur.bounds.width / 2;
  const cy = cur.bounds.y + cur.bounds.height / 2;
  let best = null;
  let bestScore = Infinity;
  for (const candidate of items) {
    if (candidate.source.id === cur.source.id || !candidate.bounds) continue;
    const dx = (candidate.bounds.x + candidate.bounds.width / 2) - cx;
    const dy = (candidate.bounds.y + candidate.bounds.height / 2) - cy;
    if (!aligned(dx, dy)) continue;
    const score = Math.hypot(dx, dy);
    if (score < bestScore) { bestScore = score; best = candidate; }
  }
  return best;
}

function shareSelection() {
  if (!state.selectedId) return;
  const quality = QUALITY_OPTIONS.find((q) => q.id === state.quality) || DEFAULT_QUALITY;
  globalThis.api.selectedSource({
    id: state.selectedId,
    screen: { width: quality.width, height: quality.height, name: quality.label },
  });
}

function cancel() {
  globalThis.api.closeView();
}
