// In-app screen-share picker. Loaded inside a child WebContentsView that
// covers the main Teams window while the user picks a source. See
// app/screenSharing/index.js for the host plumbing and
// app/screenSharing/service.js for the IPC handlers.

const QUALITY_OPTIONS = [
  { width: 1280, height: 720,  name: "HD (720p)" },
  { width: 1920, height: 1080, name: "FHD (1080p)", default: true },
  { width: 2048, height: 1080, name: "2K" },
  { width: 3840, height: 2160, name: "4K" },
];

const THUMBNAIL_SIZE = { width: 640, height: 360 };

const state = {
  displays: [],         // [{ id, label, internal, bounds, scaleFactor }]
  sources: [],          // raw sources from desktopCapturer
  screenItems: [],      // joined: source + display info, sorted
  windowItems: [],      // window sources
  activeTab: "screens", // "screens" | "windows"
  searchTerm: "",
  selectedId: null,
};

globalThis.addEventListener("DOMContentLoaded", () => {
  populateQualityDropdown();
  wireEvents();
  void loadSources();
});

function populateQualityDropdown() {
  const select = document.getElementById("quality-select");
  for (const [i, q] of QUALITY_OPTIONS.entries()) {
    const opt = document.createElement("option");
    opt.value = String(i);
    opt.textContent = q.name;
    select.appendChild(opt);
  }
  const defaultIndex = QUALITY_OPTIONS.findIndex((q) => q.default);
  select.selectedIndex = defaultIndex > -1 ? defaultIndex : QUALITY_OPTIONS.length - 1;
}

function wireEvents() {
  document.getElementById("btn-close").addEventListener("click", cancel);
  document.getElementById("btn-cancel").addEventListener("click", cancel);
  document.getElementById("btn-share").addEventListener("click", confirm);

  document.getElementById("search-input").addEventListener("input", (e) => {
    state.searchTerm = e.target.value;
    renderActivePane();
  });

  for (const tab of document.querySelectorAll(".tab")) {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
    tab.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        switchTab(tab.dataset.tab);
      }
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { cancel(); return; }
    if (e.key === "Enter" && state.selectedId) { confirm(); return; }
  });
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
  renderActivePane();

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
        display,
        index: i,
        label: display?.label || source.name || `Display ${i + 1}`,
        internal: !!display?.internal,
        bounds: display?.bounds || null,
        scaleFactor: display?.scaleFactor || 1,
      };
    })
    .sort((a, b) => {
      if (a.internal !== b.internal) return a.internal ? -1 : 1;
      if (!a.bounds || !b.bounds) return 0;
      return (a.bounds.y - b.bounds.y) || (a.bounds.x - b.bounds.x);
    })
    .map((item, displayNumber) => ({ ...item, displayNumber: displayNumber + 1 }));

  state.windowItems = state.sources.filter((s) => s.id.startsWith("window:"));
}

function renderActivePane() {
  const pane = document.getElementById("pane");
  pane.dataset.view = state.activeTab;
  document.getElementById("empty-state").hidden = true;

  if (state.activeTab === "screens") {
    renderScreens();
  } else {
    renderWindows();
  }
}

function renderScreens() {
  const grid = document.getElementById("screens-grid");
  grid.replaceChildren();

  const term = state.searchTerm.toLowerCase().trim();
  const visible = state.screenItems.filter(
    (item) => !term || item.label.toLowerCase().includes(term)
  );

  if (visible.length === 0) {
    showEmptyState(
      term ? "No screens match your filter" : "No screens available",
      term ? "Try a different search term." : "Connect a display or check system permissions."
    );
    return;
  }

  for (const item of visible) {
    grid.appendChild(buildScreenTile(item));
  }
}

function buildScreenTile(item) {
  const tile = document.createElement("div");
  tile.className = "screen-tile";
  tile.tabIndex = 0;
  tile.dataset.id = item.source.id;
  tile.setAttribute("role", "option");
  tile.setAttribute("aria-label", `${item.label}${item.internal ? " (Main)" : ""}`);

  if (item.source.thumbnailDataUrl?.startsWith("data:")) {
    const img = document.createElement("img");
    img.className = "thumb";
    img.src = item.source.thumbnailDataUrl;
    img.alt = "";
    tile.appendChild(img);
  }

  const badge = document.createElement("div");
  badge.className = "badge-num";
  badge.textContent = String(item.displayNumber);
  tile.appendChild(badge);

  if (item.internal) {
    const main = document.createElement("div");
    main.className = "badge-main";
    main.textContent = "Main";
    tile.appendChild(main);
  }

  const meta = document.createElement("div");
  meta.className = "tile-meta";
  const name = document.createElement("div");
  name.className = "name";
  name.textContent = item.label;
  meta.appendChild(name);
  if (item.bounds) {
    const res = document.createElement("div");
    res.className = "res";
    res.textContent = `${item.bounds.width}×${item.bounds.height} @ ${item.scaleFactor}x`;
    meta.appendChild(res);
  }
  tile.appendChild(meta);

  tile.addEventListener("click", () => selectItem(item.source.id, tile));
  tile.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      selectItem(item.source.id, tile);
    }
  });
  if (item.source.id === state.selectedId) tile.classList.add("selected");
  return tile;
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

  const title = document.createElement("div");
  title.className = "title";
  title.textContent = source.name || "Untitled";
  title.title = source.name || "";
  metaRow.appendChild(title);

  tile.appendChild(metaRow);

  tile.addEventListener("click", () => selectItem(source.id, tile));
  tile.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      selectItem(source.id, tile);
    }
  });
  if (source.id === state.selectedId) tile.classList.add("selected");
  return tile;
}

// Data URLs already start with a scheme but may contain characters that
// confuse CSS url(). Wrapping in double quotes and escaping closing quotes
// is enough for the data: URL shape we get back from desktopCapturer.
function cssEscapeUrl(url) {
  return url.replace(/"/g, '\\"');
}

function selectItem(id, tileEl) {
  state.selectedId = id;
  for (const el of document.querySelectorAll(".screen-tile.selected, .window-tile.selected")) {
    el.classList.remove("selected");
  }
  if (tileEl) tileEl.classList.add("selected");
  document.getElementById("btn-share").disabled = false;
}

function switchTab(tab) {
  if (tab !== "screens" && tab !== "windows") return;
  state.activeTab = tab;
  for (const t of document.querySelectorAll(".tab")) {
    const isActive = t.dataset.tab === tab;
    t.classList.toggle("active", isActive);
    t.setAttribute("aria-selected", isActive ? "true" : "false");
  }
  renderActivePane();
}

function showEmptyState(title, body) {
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

function confirm() {
  if (!state.selectedId) return;
  const qualityIndex = Number(document.getElementById("quality-select").value);
  const quality = QUALITY_OPTIONS[qualityIndex] || QUALITY_OPTIONS[1];
  globalThis.api.selectedSource({
    id: state.selectedId,
    screen: { width: quality.width, height: quality.height, name: quality.name },
  });
}

function cancel() {
  globalThis.api.closeView();
}
