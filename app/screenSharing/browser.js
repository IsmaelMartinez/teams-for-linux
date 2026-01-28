// Global config for preview settings - allows disabling live previews for problematic hardware
let livePreviewDisabled = false;

globalThis.addEventListener("DOMContentLoaded", async () => {
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

  // Load config to check if live previews should be disabled
  // This is a workaround for hardware issues (USB-C docking stations, DisplayLink adapters)
  // See issues #2058, #2041
  try {
    const config = await globalThis.api.getScreenSharingConfig();
    if (config) {
      // Support new nested config path: screenSharing.picker.livePreviewDisabled
      livePreviewDisabled = config?.screenSharing?.picker?.livePreviewDisabled ?? false;
      if (livePreviewDisabled) {
        console.debug("[SCREEN_SHARE] Live video previews disabled via configuration (screenSharing.picker.livePreviewDisabled: true)");
      }
    }
  } catch (error) {
    console.warn("[SCREEN_SHARE] Failed to load screen sharing config, using defaults:", error);
  }

  globalThis.api
    .desktopCapturerGetSources({ types: ["window", "screen"] })
    .then(async (sources) => {
      const rowElement = document.querySelector(".container-fluid .row");

      // Handle case where no sources are available (GPU/driver issues - see #2058, #2041)
      if (!sources || sources.length === 0) {
        console.error("[SCREEN_SHARE] No screen sources available - this may be due to GPU/driver compatibility issues");
        showErrorMessage(rowElement, "Unable to access screen sources. This may be due to graphics driver compatibility issues. Try disabling GPU acceleration with --disable-gpu flag or set screenSharing.picker.livePreviewDisabled: true in your config.");
        return;
      }

      for (const source of sources) {
        await createPreview({
          source,
          title: source.id.startsWith("screen:")
            ? source.name
            : `Window ${++windowsIndex}`,
          rowElement,
          screens,
          sscontainer,
          disablePreview: livePreviewDisabled,
        });
      }
    })
    .catch((error) => {
      console.error("[SCREEN_SHARE] Failed to get desktop sources:", error);
      const rowElement = document.querySelector(".container-fluid .row");
      showErrorMessage(rowElement, "Failed to access screen sharing. Please try restarting the application, disabling GPU acceleration, or setting screenSharing.picker.livePreviewDisabled: true in your config.");
    });
});

function showErrorMessage(container, message) {
  const errorElement = document.createElement("div");
  errorElement.className = "col-12 text-center p-4";
  errorElement.innerHTML = `
    <div class="alert alert-warning" role="alert">
      <strong>Screen sharing unavailable</strong><br>
      ${message}
    </div>
  `;
  container.appendChild(errorElement);
}

async function createPreview(properties) {
  let columnElement = document.createElement("div");
  columnElement.className = `col-5 ${properties.source.id.startsWith("screen:") ? "screen" : "window"}`;
  // Video container
  let videoContainerElement = document.createElement("div");
  videoContainerElement.className = "video-container";
  // Video
  let videoElement = document.createElement("video");
  videoElement.dataset.id = properties.source.id;
  videoElement.title = properties.source.name;
  videoContainerElement.appendChild(videoElement);
  // Label
  let labelElement = document.createElement("div");
  labelElement.className = "label-container";
  labelElement.appendChild(document.createTextNode(properties.title));
  columnElement.appendChild(videoContainerElement);
  columnElement.appendChild(labelElement);
  properties.rowElement.appendChild(columnElement);
  await createPreviewStream(properties, videoElement);
}

async function createPreviewStream(properties, videoElement) {
  // Check if live previews are disabled (workaround for hardware compatibility issues)
  // See issues #2058, #2041 - USB-C docking stations, DisplayLink adapters can crash
  if (properties.disablePreview) {
    console.debug(`[SCREEN_SHARE] Live preview disabled for source: ${properties.source.id} (screenSharing.picker.livePreviewDisabled: true)`);
    showStaticPreview(videoElement, properties);
    return;
  }

  // Disable audio in preview streams to prevent echo during screen sharing
  console.debug(`[SCREEN_SHARE_DIAG] Creating preview stream for source: ${properties.source.id}`);
  console.debug(`[SCREEN_SHARE_DIAG] Preview stream - audio: DISABLED, dimensions: 192x108 (echo prevention)`);

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false, // CRITICAL: No audio to prevent duplicate capture sessions causing echo
      video: {
        mandatory: {
          chromeMediaSource: "desktop",
          chromeMediaSourceId: properties.source.id,
          minWidth: 192,
          maxWidth: 192,
          minHeight: 108,
          maxHeight: 108,
        },
      },
    });

    console.debug(`[SCREEN_SHARE_DIAG] Preview stream created successfully - ID: ${stream.id}`);
    console.debug(`[SCREEN_SHARE_DIAG] Preview stream tracks - Audio: ${stream.getAudioTracks().length}, Video: ${stream.getVideoTracks().length}`);

    videoElement.srcObject = stream;
    playPreview({
      videoElement,
      source: properties.source,
      screens: properties.screens,
      sscontainer: properties.sscontainer,
    });
  } catch (error) {
    // Handle getUserMedia failures gracefully - can crash on certain hardware
    // configurations (USB-C docking stations, DisplayLink drivers, etc.)
    // See issues #2058, #2041
    console.error(`[SCREEN_SHARE] Failed to create preview stream for ${properties.source.id}:`, {
      error: error.message,
      name: error.name,
      sourceId: properties.source.id
    });

    // Show placeholder instead of video preview
    showPreviewError(videoElement, properties);
  }
}

function showStaticPreview(videoElement, properties) {
  // Show a static placeholder when live previews are disabled (hardware workaround)
  const container = videoElement.parentElement;
  if (container) {
    videoElement.style.display = "none";

    const isScreen = properties.source.id.startsWith("screen:");
    const iconClass = isScreen ? "bi-display" : "bi-window";
    const typeLabel = isScreen ? "Screen" : "Window";

    const placeholder = document.createElement("div");
    placeholder.className = "static-preview";

    const icon = document.createElement("i");
    icon.className = `bi ${iconClass}`;
    placeholder.appendChild(icon);

    const label = document.createElement("span");
    label.textContent = `${typeLabel}\nClick to select`;
    placeholder.appendChild(label);

    placeholder.onclick = () => {
      console.debug(`[SCREEN_SHARE_DIAG] User selected source (static preview): ${properties.source.id}`);
      closePreviews();
      globalThis.api.selectedSource({
        id: properties.source.id,
        screen: properties.screens[properties.sscontainer.value]
      });
    };
    container.appendChild(placeholder);
  }
}

function showPreviewError(videoElement, properties) {
  // Replace video element with a clickable placeholder
  const container = videoElement.parentElement;
  if (container) {
    videoElement.style.display = "none";

    const placeholder = document.createElement("div");
    placeholder.className = "preview-error";

    const label = document.createElement("span");
    label.textContent = "Preview unavailable\nClick to select";
    placeholder.appendChild(label);

    placeholder.onclick = () => {
      console.debug(`[SCREEN_SHARE_DIAG] User selected source (no preview): ${properties.source.id}`);
      closePreviews();
      globalThis.api.selectedSource({
        id: properties.source.id,
        screen: properties.screens[properties.sscontainer.value]
      });
    };
    container.appendChild(placeholder);
  }
}

function playPreview(properties) {
  properties.videoElement.onclick = () => {
    console.debug(`[SCREEN_SHARE_DIAG] User selected source: ${properties.source.id}, cleaning up all previews immediately`);
    closePreviews(); // Clean up all preview streams immediately to prevent ongoing capture
    globalThis.api.selectedSource({
      id: properties.source.id,
      screen: properties.screens[properties.sscontainer.value]
    });
  };
  properties.videoElement.onloadedmetadata = () =>
    properties.videoElement.play();
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
    closePreviews();
    globalThis.api.closeView();
  });
}

function closePreviews() {
  // Enhanced logging for preview cleanup - prevents audio echo
  const vidElements = document.getElementsByTagName("video");
  console.debug(`[SCREEN_SHARE_DIAG] Closing ${vidElements.length} preview streams to prevent echo`);
  
  for (const vidElement of vidElements) {
    if (vidElement.srcObject) {
      const stream = vidElement.srcObject;
      console.debug(`[SCREEN_SHARE_DIAG] Closing preview stream: ${stream.id}`, {
        audioTracks: stream.getAudioTracks().length,
        videoTracks: stream.getVideoTracks().length,
        hasAudio: stream.getAudioTracks().length > 0
      });
      
      vidElement.pause();
      
      // Stop all tracks to immediately release desktop capture
      for (const track of stream.getTracks()) {
        console.debug(`[SCREEN_SHARE_DIAG] Stopping track: ${track.kind} - ${track.id}`);
        track.stop();
      }
      
      // Clear the srcObject reference
      vidElement.srcObject = null;
      
      console.debug(`[SCREEN_SHARE_DIAG] Preview stream ${stream.id} cleaned up - desktop capture released`);
    } else {
      console.debug(`[SCREEN_SHARE_DIAG] Video element has no srcObject to clean up`);
    }
  }
  
  console.debug(`[SCREEN_SHARE_DIAG] All preview streams closed - echo prevention complete`);
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
