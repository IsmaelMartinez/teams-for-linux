window.addEventListener("DOMContentLoaded", () => {
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
  window.api
    .desktopCapturerGetSources({ types: ["window", "screen"] })
    .then(async (sources) => {
      const rowElement = document.querySelector(".container-fluid .row");
      for (const source of sources) {
        await createPreview({
          source,
          title: source.id.startsWith("screen:")
            ? source.name
            : `Window ${++windowsIndex}`,
          rowElement,
          screens,
          sscontainer,
        });
      }
    });
});

async function createPreview(properties) {
  let columnElement = document.createElement("div");
  columnElement.className = `col-5 ${properties.source.id.startsWith("screen:") ? "screen" : "window"}`;
  // Video container
  let videoContainerElement = document.createElement("div");
  videoContainerElement.className = "video-container";
  // Video
  let videoElement = document.createElement("video");
  videoElement.setAttribute("data-id", properties.source.id);
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
  // v2.5.5: Use main stream for preview to prevent audio duplication/echo
  console.debug(`[SCREEN_SHARE_DIAG] Creating preview for source: ${properties.source.id}`);
  
  try {
    // First try to get the main screen sharing stream
    const mainStream = await window.electronAPI.getMainScreenShareStream();
    
    if (mainStream && mainStream.getVideoTracks().length > 0) {
      console.debug(`[SCREEN_SHARE_DIAG] Reusing MAIN stream for preview - ID: ${mainStream.id}`, {
        sourceId: properties.source.id,
        mainStreamId: mainStream.id,
        hasAudio: mainStream.getAudioTracks().length > 0,
        hasVideo: mainStream.getVideoTracks().length > 0,
        approach: "stream_reuse"
      });
      
      // Clone the main stream to avoid interference
      const previewStream = mainStream.clone();
      
      console.debug(`[SCREEN_SHARE_DIAG] Preview stream cloned from main - ID: ${previewStream.id}`);
      console.debug(`[SCREEN_SHARE_DIAG] Preview stream tracks - Audio: ${previewStream.getAudioTracks().length}, Video: ${previewStream.getVideoTracks().length}`);
      
      videoElement.srcObject = previewStream;
      
    } else {
      // Fallback to original method if main stream not available
      console.warn(`[SCREEN_SHARE_DIAG] Main stream not available, falling back to getUserMedia`, {
        hasMainStream: !!mainStream,
        mainStreamTracks: mainStream?.getVideoTracks().length || 0
      });
      
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
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
      
      console.debug(`[SCREEN_SHARE_DIAG] FALLBACK preview stream created - ID: ${stream.id}`);
      videoElement.srcObject = stream;
    }
    
    playPreview({
      videoElement,
      source: properties.source,
      screens: properties.screens,
      sscontainer: properties.sscontainer,
    });
    
  } catch (error) {
    console.error(`[SCREEN_SHARE_DIAG] Error creating preview stream:`, {
      error: error.message,
      sourceId: properties.source.id,
      stack: error.stack
    });
    
    // Last resort fallback
    try {
      const fallbackStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
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
      videoElement.srcObject = fallbackStream;
      console.debug(`[SCREEN_SHARE_DIAG] ERROR RECOVERY preview stream created - ID: ${fallbackStream.id}`);
      
      playPreview({
        videoElement,
        source: properties.source,
        screens: properties.screens,
        sscontainer: properties.sscontainer,
      });
    } catch (fallbackError) {
      console.error(`[SCREEN_SHARE_DIAG] Complete failure creating preview stream:`, fallbackError);
    }
  }
}

function playPreview(properties) {
  properties.videoElement.onclick = () => {
    closePreviews();
    window.api.selectedSource({
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
    window.api.closeView();
  });
}

function closePreviews() {
  // v2.5.5: Enhanced logging for preview cleanup with stream reuse tracking
  const vidElements = document.getElementsByTagName("video");
  console.debug(`[SCREEN_SHARE_DIAG] Closing ${vidElements.length} preview displays`);
  
  for (const vidElement of vidElements) {
    if (vidElement.srcObject) {
      const stream = vidElement.srcObject;
      console.debug(`[SCREEN_SHARE_DIAG] Closing preview display with stream: ${stream.id}`, {
        audioTracks: stream.getAudioTracks().length,
        videoTracks: stream.getVideoTracks().length,
        isClonedStream: stream.id !== stream.getVideoTracks()[0]?.id // Cloned streams have different IDs
      });
      
      vidElement.pause();
      
      // Stop all tracks (including cloned ones)
      stream.getTracks().forEach(track => {
        console.debug(`[SCREEN_SHARE_DIAG] Stopping track: ${track.kind} - ${track.id}`);
        track.stop();
      });
      
      // Clear the srcObject reference
      vidElement.srcObject = null;
      
      console.debug(`[SCREEN_SHARE_DIAG] Preview display ${stream.id} cleaned up (tracks stopped, srcObject cleared)`);
    } else {
      console.debug(`[SCREEN_SHARE_DIAG] Video element has no srcObject to clean up`);
    }
  }
  
  console.debug(`[SCREEN_SHARE_DIAG] All preview displays closed - no duplicate audio capture sessions remaining`);
}

function toggleSources(e) {
  document.querySelectorAll("button").forEach((b) => {
    b.classList.toggle("btn-primary");
    b.classList.toggle("btn-secondary");
  });
  document
    .querySelector(".container-fluid")
    .setAttribute("data-view", e.target.getAttribute("data-view"));
}

function createQualitySelector(properties) {
  properties.screens.forEach((s, i) => {
    const opt = document.createElement("option");
    opt.appendChild(document.createTextNode(s.name));
    opt.value = i;
    properties.sscontainer.appendChild(opt);
  });
  let defaultSelection = properties.screens.findIndex((s) => {
    return s.default;
  });

  defaultSelection =
    defaultSelection > -1 ? defaultSelection : properties.screens.length - 1;
  properties.sscontainer.selectedIndex = defaultSelection;
}
