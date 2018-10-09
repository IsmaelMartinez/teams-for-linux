'use strict';

const { nativeImage } = require('electron');

exports = module.exports = ({ ipc, iconPath }) => {
  return () => {
    console.log('calling native-notifications');
    const icon = nativeImage.createFromPath(iconPath);
    if (typeof Notify !== 'undefined') {      
    console.log('Notify is not undefined');
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
