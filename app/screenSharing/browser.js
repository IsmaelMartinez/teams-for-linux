globalThis.addEventListener("DOMContentLoaded", () => {
  const screens = [
    {
      width: 1280,
      height: 720,
      name: "HD",
      alt_name: "720p",
      default: false,
    },
    {
      width: 1920,
      height: 1080,
      name: "FHD",
      alt_name: "1080p",
      default: true,
    },
    {
      width: 2048,
      height: 1080,
      name: "2K",
      alt_name: "QHD",
      default: false,
    },
    {
      width: 3840,
      height: 2160,
      name: "4K",
      alt_name: "UHD",
      default: false,
    },
  ];
  let windowsIndex = 0;
  const sscontainer = document.getElementById("screen-size");
  createEventHandlers({ screens, sscontainer });

  // Request sources WITH thumbnails - this is safe and doesn't create capture sessions
  globalThis.api
    .desktopCapturerGetSources({
      types: ["window", "screen"],
      thumbnailSize: { width: 320, height: 180 },
      fetchWindowIcons: true
    })
    .then(async (sources) => {
      const rowElement = document.querySelector(".container-fluid .row");

      // Check if no sources are available (permission denied or system restriction)
      if (!sources || sources.length === 0) {
        console.error("[SCREEN_SHARE] No screen/window sources available - possible permission issue");
        const noSourcesMsg = document.createElement("div");
        noSourcesMsg.className = "col-12 text-center";
        noSourcesMsg.innerHTML = `
          <div style="padding: 20px; color: #ff6b6b;">
            <p><strong>No screens or windows available for sharing</strong></p>
            <p style="font-size: 12px; color: #aaa;">
              This may be due to system permissions. On Linux:
              <br>• On Wayland: Ensure xdg-desktop-portal is installed and running
              <br>• On Ubuntu: Install xdg-desktop-portal-gnome package
              <br>• Check if your compositor supports screen capture
            </p>
          </div>
        `;
        rowElement.appendChild(noSourcesMsg);
        return;
      }

      for (const source of sources) {
        console.debug(`[SCREEN_SHARE] Browser: source ${source.id}, hasThumbnail=${!!source.thumbnailDataUrl}`);
        createPreview({
          source,
          title: source.id.startsWith("screen:")
            ? source.name
            : `Window ${++windowsIndex}`,
          rowElement,
          screens,
          sscontainer,
        });
      }
    })
    .catch((error) => {
      console.error("[SCREEN_SHARE] Failed to get desktop capturer sources:", error);
      const rowElement = document.querySelector(".container-fluid .row");
      if (rowElement) {
        const errorMsg = document.createElement("div");
        errorMsg.className = "col-12 text-center";
        errorMsg.innerHTML = `
          <div style="padding: 20px; color: #ff6b6b;">
            <p><strong>Failed to access screen capture</strong></p>
            <p style="font-size: 12px; color: #aaa;">Error: ${error.message || 'Unknown error'}</p>
          </div>
        `;
        rowElement.appendChild(errorMsg);
      }
    });
});

/**
 * Creates a preview element using static thumbnail instead of live video stream.
 * This prevents SIGILL crashes caused by too many simultaneous getUserMedia calls.
 *
 * @author bluvulture (PR #2089)
 */
function createPreview(properties) {
  const columnElement = document.createElement("div");
  columnElement.className = `col-5 ${properties.source.id.startsWith("screen:") ? "screen" : "window"}`;

  // Image container (using thumbnail instead of live video to prevent crashes)
  const imageContainerElement = document.createElement("div");
  imageContainerElement.className = "video-container";
  imageContainerElement.style.cssText = "position: relative; min-height: 108px; background: #2d2d2d; border-radius: 4px; display: flex; align-items: center; justify-content: center;";

  // Use thumbnail data URL from main process (already converted for IPC)
  if (properties.source.thumbnailDataUrl && properties.source.thumbnailDataUrl.length > 100) {
    // Use static thumbnail image
    const imgElement = document.createElement("img");
    imgElement.dataset.id = properties.source.id;
    imgElement.title = properties.source.name;
    imgElement.style.cssText = "width: 100%; height: auto; cursor: pointer; border-radius: 4px;";
    imgElement.src = properties.source.thumbnailDataUrl;
    imgElement.onclick = () => selectSource(properties);
    imageContainerElement.appendChild(imgElement);
  } else {
    // Fallback: show a styled placeholder with icon
    const placeholder = document.createElement("div");
    placeholder.style.cssText = "text-align: center; padding: 20px; cursor: pointer; width: 100%;";
    placeholder.innerHTML = properties.source.id.startsWith("screen:")
      ? `<div style="font-size: 32px;">🖥️</div><div style="font-size: 11px; color: #888; margin-top: 5px;">${properties.source.name || 'Screen'}</div>`
      : `<div style="font-size: 32px;">🪟</div><div style="font-size: 11px; color: #888; margin-top: 5px;">Window</div>`;
    placeholder.onclick = () => selectSource(properties);
    imageContainerElement.appendChild(placeholder);
  }

  // Label
  const labelElement = document.createElement("div");
  labelElement.className = "label-container";
  labelElement.appendChild(document.createTextNode(properties.title));

  columnElement.appendChild(imageContainerElement);
  columnElement.appendChild(labelElement);
  properties.rowElement.appendChild(columnElement);
}

function selectSource(properties) {
  console.debug(`[SCREEN_SHARE] User selected source: ${properties.source.id}`);
  globalThis.api.selectedSource({
    id: properties.source.id,
    screen: properties.screens[properties.sscontainer.value]
  });
}

function createEventHandlers(properties) {
  createQualitySelector(properties);
  document
    .querySelector("#btn-screens")
    .addEventListener("click", toggleSources);
  document
    .querySelector("#btn-windows")
    .addEventListener("click", toggleSources);
  document.querySelector("#btn-close").addEventListener("click", () => {
    globalThis.api.closeView();
  });
}

function toggleSources(e) {
  for (const b of document.querySelectorAll("button")) {
    b.classList.toggle("btn-primary");
    b.classList.toggle("btn-secondary");
  }
  document
    .querySelector(".container-fluid")
    .dataset.view = e.target.dataset.view;
}

function createQualitySelector(properties) {
  for (const [i, s] of properties.screens.entries()) {
    const opt = document.createElement("option");
    opt.appendChild(document.createTextNode(s.name));
    opt.value = i;
    properties.sscontainer.appendChild(opt);
  }
  let defaultSelection = properties.screens.findIndex((s) => {
    return s.default;
  });

  defaultSelection =
    defaultSelection > -1 ? defaultSelection : properties.screens.length - 1;
  properties.sscontainer.selectedIndex = defaultSelection;
}
