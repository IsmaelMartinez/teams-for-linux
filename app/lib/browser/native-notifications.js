'use strict';

const { nativeImage } = require('electron');

exports = module.exports = ({ ipc, iconPath }) => {
  return () => {
    const icon = nativeImage.createFromPath(iconPath);
    if (typeof Notify !== 'undefined') {
      Notify.prototype.show = function show() {
        const notification = new Notification(this.title, {
          body: this.options.body,
          icon: icon.toDataURL()
        });
        notification.onclick = () => {
          ipc.send('nativeNotificationClick');
        };
      };
    }
  };
};
