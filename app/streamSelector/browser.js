const { desktopCapturer, ipcRenderer } = require("electron");
window.addEventListener("DOMContentLoaded", () => {
  let windowsIndex = 0;
  const _tabClick = (e) => {
    document.querySelectorAll('button').forEach(b => {
      b.classList.toggle('btn-primary');
      b.classList.toggle('btn-secondary');
    });
    document.querySelector('.container-fluid').setAttribute('data-view', e.target.getAttribute('data-view'));
  };
  document.querySelector('#btn-screens').addEventListener("click", _tabClick);
  document.querySelector('#btn-windows').addEventListener("click", _tabClick);
  document.querySelector('#btn-close').addEventListener("click", () => {
    ipcRenderer.send("close-view");
  });
  desktopCapturer.getSources({ types: ['window', 'screen'] }).then(async sources => {
    const rowElement = document.querySelector('.container-fluid .row');
    for (const source of sources) {
      let columnElement = document.createElement('div');
      columnElement.className = `col-5 ${source.id.startsWith('screen:') ? 'screen' : 'window'}`;
      // Video container
      let videoContainerElement = document.createElement('div');
      videoContainerElement.className = "video-container";
      // Video
      let videoElement = document.createElement('video');
      videoElement.setAttribute('data-id', source.id);
      videoElement.title = source.name;
      videoContainerElement.appendChild(videoElement);
      // Label
      let labelElement = document.createElement('div');
      labelElement.className = "label-container";
      labelElement.appendChild(document.createTextNode(source.id.startsWith('screen:') ? source.name : `Window ${++windowsIndex}`));
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