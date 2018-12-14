const {ipcMain} = require('electron');
const NativeNotification = require('electron-native-notification');

exports.addDesktopNotificationHack = function addDesktopNotificationHack(iconPath) {
	ipcMain.on('notifications', async (e, msg) => {
		if (msg.count > 0) {
			const body = ((msg.text) ? `(${msg.count}): ${msg.text}` : `You got ${msg.count} notification(s)`);
			const notification = new NativeNotification(
				'Microsoft Teams',
				{
					body,
					icon: iconPath,
				},
			);
			notification.onclick = () => {
				window.show();
				window.focus();
			};
			if (notification.show !== undefined) {
				notification.show();
			}
		}
	});
};