(function () {
  const electron = require('electron');
  const remote = electron.remote;
  const NativeImage = electron.nativeImage;

  function setOverlay(count) {
    const canvas = document.createElement('canvas');
    canvas.height = 140;
    canvas.width = 140;
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = function () {
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0, 140, 140);
      if (count > 0) {
        ctx.fillStyle = 'red';
        ctx.beginPath();
        ctx.ellipse(105, 35, 35, 35, 35, 0, 2 * Math.PI);
        ctx.fill();
        ctx.textAlign = 'center';
        ctx.fillStyle = 'white';

        ctx.font = 'bold 70px "Segoe UI","Helvetica Neue",Helvetica,Arial,sans-serif';
        if (count > 9) {
          ctx.fillText('9+', 105, 60);
        } else {
          ctx.fillText(count.toString(), 105, 60);
        }
      }

      const badgeDataURL = canvas.toDataURL();
      const img = NativeImage.createFromDataURL(badgeDataURL);
      electron.ipcRenderer.send('notifications', {
        count: count,
        icon: badgeDataURL
      });
    };
    image.src = document.querySelector("link[rel*='icon']").href;
  }


  function poll(lastCount) {
    if (typeof angular !== 'undefined') {
      try {
        let notifications = angular.element(document.documentElement).controller().pageTitleNotificationCount;
        if (notifications !== lastCount) {
          setOverlay(notifications);
        }
        setTimeout(poll, 1000, notifications);
      } catch (err) {
        setTimeout(poll, 1000, lastCount);
      }
    } else {
      setTimeout(poll, 1000, 0);
    }
  }


  document.addEventListener('DOMContentLoaded', function () {
    poll(0);
  });

})();
