const { desktopCapturer, ipcRenderer } = require("electron");
window.addEventListener("DOMContentLoaded", () => {
  desktopCapturer.getSources({ types: ['window', 'screen'] }).then(async sources => {
    const rowElement = document.querySelector('.container-fluid .row');
    for (const source of sources) {
      let columnElement = document.createElement('div');
      columnElement.className = "col-6";
      // Video container
      let videoContainerElement = document.createElement('div');
      videoContainerElement.className = "video-container";
      // Video
      let videoElement = document.createElement('video');
      videoElement.setAttribute('data-id', source.id);
      videoContainerElement.appendChild(videoElement);
      // Label
      let labelElement = document.createElement('div');
      labelElement.className = "label-container";
      labelElement.appendChild(document.createTextNode(source.name));
      columnElement.appendChild(videoContainerElement);
      columnElement.appendChild(labelElement);
      rowElement.appendChild(columnElement);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: source.id,
            minWidth: 1280,
            maxWidth: 1280,
            minHeight: 720,
            maxHeight: 720
          }
        }
      });
      videoElement.srcObject = stream;
      videoElement.onclick = () => {
        videoElement.pause();
        stream.getVideoTracks()[0].stop();
        ipcRenderer.send("selected-source", source.id);
      };
      videoElement.onloadedmetadata = (e) => videoElement.play();
    }
  });
});