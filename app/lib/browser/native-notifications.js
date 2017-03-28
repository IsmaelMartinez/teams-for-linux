'use strict';

exports = module.exports = ({ ipc, icon }) => {
  return () => {
    if (typeof Notify !== 'undefined') {
      Notify.prototype.show = function () {
        const notification = new Notification(this.title, {
          body: this.options.body,
          icon: icon.toDataURL()
        });
        notification.onclick = () => {
          ipc.send('nativeNotificationClick');
        };
      }
    }
  }
};
