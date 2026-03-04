globalThis.addEventListener("DOMContentLoaded", () => {
  const screens = [
    { width: 1280, height: 720, name: "HD", alt_name: "720p", default: false },
    { width: 1920, height: 1080, name: "FHD", alt_name: "1080p", default: true },
    { width: 2048, height: 1080, name: "2K", alt_name: "QHD", default: false },
    { width: 3840, height: 2160, name: "4K", alt_name: "UHD", default: false },
  ];
  let windowsIndex = 0;
  const sscontainer = document.getElementById("screen-size");
  createEventHandlers({ screens, sscontainer });

  globalThis.api
    .desktopCapturerGetSources({
      types: ["window", "screen"],
      thumbnailSize: { width: 320, height: 180 },
      fetchWindowIcons: true
    })
    .then((sources) => {
      const rowElement = document.querySelector(".container-fluid .row");

      if (!sources || sources.length === 0) {
        showMessage(rowElement, "No screens or windows available for sharing", [
          "This may be due to system permissions. On Linux:",
          "• On Wayland: Ensure xdg-desktop-portal is installed and running",
          "• On Ubuntu: Install xdg-desktop-portal-gnome package"
        ]);
        return;
      }

      for (const source of sources) {
        createPreview({
          source,
          title: source.id.startsWith("screen:") ? source.name : `Window ${++windowsIndex}`,
          rowElement,
          screens,
          sscontainer,
        });
      }
    })
    .catch((error) => {
      const rowElement = document.querySelector(".container-fluid .row");
      showMessage(rowElement, "Failed to access screen capture", [error.message || "Unknown error"]);
    });
});

function showMessage(container, title, details) {
  const msgDiv = document.createElement("div");
  msgDiv.className = "col-12 text-center";
  msgDiv.style.cssText = "padding: 20px; color: #ff6b6b;";

  const titleEl = document.createElement("p");
  const strong = document.createElement("strong");
  strong.textContent = title;
  titleEl.appendChild(strong);
  msgDiv.appendChild(titleEl);

  const detailsEl = document.createElement("p");
  detailsEl.style.cssText = "font-size: 12px; color: #aaa;";
  detailsEl.textContent = details.join(" ");
  msgDiv.appendChild(detailsEl);

  container.appendChild(msgDiv);
}

/**
 * Creates a preview element using static thumbnail instead of live video stream.
 * This prevents SIGILL crashes caused by too many simultaneous getUserMedia calls.
 * @author bluvulture (PR #2089)
 */
function createPreview(properties) {
  const columnElement = document.createElement("div");
  columnElement.className = `col-5 ${properties.source.id.startsWith("screen:") ? "screen" : "window"}`;

  const imageContainerElement = document.createElement("div");
  imageContainerElement.className = "video-container";
  imageContainerElement.style.cssText = "position: relative; min-height: 108px; background: #2d2d2d; border-radius: 4px; display: flex; align-items: center; justify-content: center;";

  const thumbnailUrl = properties.source.thumbnailDataUrl;
  if (thumbnailUrl?.startsWith("data:")) {
    const imgElement = document.createElement("img");
    imgElement.dataset.id = properties.source.id;
    imgElement.title = properties.source.name;
    imgElement.style.cssText = "width: 100%; height: auto; cursor: pointer; border-radius: 4px;";
    imgElement.src = thumbnailUrl;
    imgElement.onclick = () => selectSource(properties);
    imageContainerElement.appendChild(imgElement);
  } else {
    const placeholder = document.createElement("div");
    placeholder.style.cssText = "text-align: center; padding: 20px; cursor: pointer; width: 100%;";

    const icon = document.createElement("div");
    icon.style.fontSize = "32px";
    icon.textContent = properties.source.id.startsWith("screen:") ? "🖥️" : "🪟";
    placeholder.appendChild(icon);

    const label = document.createElement("div");
    label.style.cssText = "font-size: 11px; color: #888; margin-top: 5px;";
    label.textContent = properties.source.id.startsWith("screen:")
      ? (properties.source.name || "Screen")
      : "Window";
    placeholder.appendChild(label);

    placeholder.onclick = () => selectSource(properties);
    imageContainerElement.appendChild(placeholder);
  }

  const labelElement = document.createElement("div");
  labelElement.className = "label-container";
  labelElement.textContent = properties.title;

  columnElement.appendChild(imageContainerElement);
  columnElement.appendChild(labelElement);
  properties.rowElement.appendChild(columnElement);
}

function selectSource(properties) {
  globalThis.api.selectedSource({
    id: properties.source.id,
    screen: properties.screens[properties.sscontainer.value]
  });
}

function createEventHandlers(properties) {
  createQualitySelector(properties);
  document.querySelector("#btn-screens").addEventListener("click", toggleSources);
  document.querySelector("#btn-windows").addEventListener("click", toggleSources);
  document.querySelector("#btn-close").addEventListener("click", () => globalThis.api.closeView());
}

function toggleSources(e) {
  for (const b of document.querySelectorAll("button")) {
    b.classList.toggle("btn-primary");
    b.classList.toggle("btn-secondary");
  }
  document.querySelector(".container-fluid").dataset.view = e.target.dataset.view;
}

function createQualitySelector(properties) {
  for (const [i, s] of properties.screens.entries()) {
    const opt = document.createElement("option");
    opt.textContent = s.name;
    opt.value = i;
    properties.sscontainer.appendChild(opt);
  }
  let defaultSelection = properties.screens.findIndex((s) => s.default);
  properties.sscontainer.selectedIndex = defaultSelection > -1 ? defaultSelection : properties.screens.length - 1;
}
