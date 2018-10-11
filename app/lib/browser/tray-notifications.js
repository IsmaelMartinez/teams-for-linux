'use strict';

const { nativeImage } = require('electron');

/**
 * Build an app icon with a notifications count overlay.
 */
function buildIcon({ count, icon }) {
  return new Promise(resolve => {
    const canvas = document.createElement('canvas');
    canvas.height = 140;
    canvas.width = 140;
    const image = new Image();
    image.src = icon.toDataURL('image/png');

    // Create the red circle for notifications
    image.onload = () => {
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0, 140, 140);
      if (count > 0) {
        ctx.fillStyle = 'red';
        ctx.beginPath();
        ctx.ellipse(105, 35, 35, 35, 35, 0, 2 * Math.PI);
        ctx.fill();
        ctx.textAlign = 'center';
        ctx.fillStyle = 'white';

        ctx.font =
          'bold 70px "Segoe UI","Helvetica Neue",Helvetica,Arial,sans-serif';
        if (count > 9) {
          ctx.fillText('9+', 105, 60);
        } else {
          ctx.fillText(count.toString(), 105, 60);
        }
      }
      resolve(canvas.toDataURL());
    };
  });
}

exports = module.exports = ({ ipc, iconPath }) => {
  var lastCount = 0;
  ipc.on('notifications', () => {
    console.log('notifications');
  });
  ipc.on('page-title', () => {
    //console.log();
    if (typeof angular === 'undefined') {
      return;
    }
    var element = angular.element(document.documentElement).controller();
    // console.log("document.documentElement", document.documentElement);
    if (!element) {
      return;
    }
    const count = angular.element(document.documentElement).controller()
      .pageTitleNotificationCount;

    if (lastCount !== count) {
      lastCount = count;
      toast = $.find('#toast-container > div > div > div.toast-message > p.title.app-max-2-lines-base')[0];
      innerText = (toast) ? toast.innerText : ""

      buildIcon({ count, icon: nativeImage.createFromPath(iconPath) }).then(
        icon => {
          ipc.send('notifications', {
            count,
            icon,
            text: innerText
          });
        }
      );
    }
  });
};
