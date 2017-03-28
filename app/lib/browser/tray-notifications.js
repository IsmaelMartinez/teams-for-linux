'use strict';


/**
 * Build an app icon with a notifications count overlay.
 */
function buildIcon({count, icon}) {
  const canvas = document.createElement('canvas');
  canvas.height = 140;
  canvas.width = 140;
  const image = new Image();
  image.src = icon.toDataURL();
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

exports = module.exports = ({ipc, icon}) => {
  let lastCount = 0;

  ipc.on('page-title', () => {
    if (typeof angular === 'undefined') {
      return;
    }

    const count = angular.element(document.documentElement)
      .controller()
      .pageTitleNotificationCount;
    if (lastCount !== count) {
      ipc.send('notifications', {
        count,
        icon: buildIcon({count, icon})
      });
      lastCount = count;
    }
  });
};
