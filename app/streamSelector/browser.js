const { desktopCapturer, ipcRenderer } = require("electron");
window.addEventListener("DOMContentLoaded", () => {
  ipcRenderer.once('get-screensizes-response', (event, screens) => {
    let windowsIndex = 0;
    const sscontainer = document.getElementById('screen-size');
    screens.forEach((s, i) => {
      const opt = document.createElement('option');
      opt.appendChild(document.createTextNode(s.name));
      opt.value = i;
      sscontainer.appendChild(opt);
    });
    let defaultSelection = screens.findIndex(s => {
      return s.default;
    });

    defaultSelection = defaultSelection > -1 ? defaultSelection : screens.length - 1;
    sscontainer.selectedIndex = defaultSelection;

    const _tabClick = (e) => {
      document.querySelectorAll('button').forEach(b => {
        b.classList.toggle('btn-primary');
        b.classList.toggle('btn-secondary');
      });
      document.querySelector('.container-fluid').setAttribute('data-view', e.target.getAttribute('data-view'));
    };

    const _closePreviews = () => {
      const vidElements = document.getElementsByTagName('video');
      for (const vidElement of vidElements) {
        vidElement.pause();
        vidElement.srcObject.getVideoTracks()[0].stop();
      };
    };

    document.querySelector('#btn-screens').addEventListener("click", _tabClick);
    document.querySelector('#btn-windows').addEventListener("click", _tabClick);
    document.querySelector('#btn-close').addEventListener("click", () => {
      _closePreviews();
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
              minWidth: 192,
              maxWidth: 192,
              minHeight: 108,
              maxHeight: 108
            }
          }
        });
        videoElement.srcObject = stream;
        videoElement.onclick = () => {
          _closePreviews();
          ipcRenderer.send("selected-source", {
            id: source.id,
            screen: screens[sscontainer.value]
          });
        };
        videoElement.onloadedmetadata = (e) => videoElement.play();
      }
    });
  });
  ipcRenderer.send('get-screensizes-request');
});