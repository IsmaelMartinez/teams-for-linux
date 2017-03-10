(function () {
  const electron = require('electron');
  const notifier = require('node-notifier');
  const path = require('path');
  const ipc = electron.ipcRenderer;
  const NativeImage = electron.nativeImage;

  const app_icon = path.join(__dirname, 'assets/icons/icon-96x96.png');
  const raw_icon = NativeImage.createFromPath(app_icon);

  function setOverlay(count) {
    const canvas = document.createElement('canvas');
    canvas.height = 140;
    canvas.width = 140;
    const image = new Image();
    image.src = raw_icon.toDataURL();
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

    return canvas.toDataURL();
  }

  let lastCount = 0;
  ipc.on('page-title', function() {
    if (typeof angular === 'undefined') {
      return;
    }

    let count = angular.element(document.documentElement).controller().pageTitleNotificationCount;
    if (count !== lastCount) {
      ipc.send('notifications', {
        count: count,
        icon: setOverlay(count)
      });
      lastCount = count;
    }
  });

  /**
   * Browser Notification API compatible wrapper for node-notifier
   */
  let _Notification = Notification;
  Notification = function(title, options) {
    // Support the Notifications API
    if (!(this instanceof Notification)) {
        return new Notification(title, options);
    }

    this.title = title;
    options = options || {};
    Object.assign(this, options);

    // Pass to native lib
    notifier.notify({
      title: title,
      message: options.body || ' ',
      icon: app_icon,
      hint: 'int:transient:1'
    });
  };
  Notification.permission = 'granted';

  Notification.requestPermission = function() {
    return Promise.resolve('granted');
  };
})();
