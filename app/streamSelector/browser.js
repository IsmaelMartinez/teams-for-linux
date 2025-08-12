window.addEventListener("DOMContentLoaded", () => {
  console.log('StreamSelector: DOMContentLoaded');
  console.log('StreamSelector: window.api available:', !!window.api);
  
  if (!window.api) {
    console.error('StreamSelector: window.api is not available!');
    return;
  }
  
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
  
  console.log('StreamSelector: Creating event handlers');
  createEventHandlers({ screens, sscontainer });
  
  console.log('StreamSelector: Getting desktop capturer sources');
  console.log('StreamSelector: window.api available:', !!window.api);
  console.log('StreamSelector: window.api.desktopCapturerGetSources available:', !!window.api?.desktopCapturerGetSources);
  
  window.api
    .desktopCapturerGetSources({ types: ["window", "screen"] })
    .then(async (sources) => {
      console.log('StreamSelector: Got sources:', sources.length);
      console.log('Desktop capturer sources:', sources.map(s => ({ id: s.id, name: s.name })));
      
      if (sources.length === 0) {
        console.warn('StreamSelector: No sources found - this may cause UI to appear empty');
      }
      
      const rowElement = document.querySelector(".container-fluid .row");
      console.log('StreamSelector: Row element found:', !!rowElement);
      
      for (const source of sources) {
        console.log('Creating preview for source:', source.id);
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
      console.log('StreamSelector: All previews created');
    })
    .catch(error => {
      console.error('StreamSelector: Failed to get desktop capturer sources:', error);
      console.error('StreamSelector: Error details:', error.stack);
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
  const isScreen = properties.source.id.startsWith("screen:");
  console.log('Creating preview for:', properties.source.id, properties.source.name);
  
  if (properties.source.thumbnail) {
    try {
      // Use the desktop capturer thumbnail
      const thumbnailDataURL = properties.source.thumbnail.toDataURL();
      
      const img = document.createElement('img');
      img.src = thumbnailDataURL;
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'cover';
      img.title = properties.source.name;
      
      // Replace video with image
      videoElement.parentElement.replaceChild(img, videoElement);
      
      playPreview({
        videoElement: img,
        source: properties.source,
        screens: properties.screens,
        sscontainer: properties.sscontainer,
      });
    } catch (error) {
      console.error('Failed to create thumbnail preview:', error);
      createFallbackPreview(videoElement, properties, isScreen);
    }
  } else {
    createFallbackPreview(videoElement, properties, isScreen);
  }
}

function createFallbackPreview(videoElement, properties, isScreen) {
  // Fallback: Create a placeholder
  videoElement.style.backgroundColor = isScreen ? '#2c3e50' : '#34495e';
  videoElement.style.display = 'flex';
  videoElement.style.alignItems = 'center';
  videoElement.style.justifyContent = 'center';
  videoElement.style.color = 'white';
  videoElement.style.fontSize = '12px';
  videoElement.style.textAlign = 'center';
  videoElement.innerHTML = `${isScreen ? '🖥️' : '🪟'}<br/>${properties.source.name || (isScreen ? 'Screen' : 'Window')}`;
  
  playPreview({
    videoElement,
    source: properties.source,
    screens: properties.screens,
    sscontainer: properties.sscontainer,
  });
}

function playPreview(properties) {
  properties.videoElement.onclick = () => {
    console.log('Source selected:', properties.source.id, properties.source.name);
    closePreviews();
    // Pass the DesktopCapturerSource object directly for modern approach
    window.api.selectedSource(properties.source);
  };
  if (properties.videoElement.onloadedmetadata !== undefined) {
    properties.videoElement.onloadedmetadata = () =>
      properties.videoElement.play();
  }
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
  // Clean up any video streams if they exist
  const vidElements = document.getElementsByTagName("video");
  for (const vidElement of vidElements) {
    if (vidElement.srcObject) {
      vidElement.pause();
      const tracks = vidElement.srcObject.getVideoTracks();
      tracks.forEach(track => track.stop());
    }
  }
  
  // Clean up any image blob URLs
  const imgElements = document.getElementsByTagName("img");
  for (const imgElement of imgElements) {
    if (imgElement.src && imgElement.src.startsWith('blob:')) {
      URL.revokeObjectURL(imgElement.src);
    }
  }
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
