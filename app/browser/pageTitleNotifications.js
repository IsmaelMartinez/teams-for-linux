/* global angular */

exports = module.exports = (ipc) => {
	let lastCount = 0;

	ipc.on('page-title', () => {
		if (typeof angular === 'undefined') {
			return;
		}
		const element = angular.element(document.documentElement).controller();
		if (!element) {
			return;
		}
		const count = angular.element(document.documentElement).controller()
			.pageTitleNotificationCount;

		if (lastCount !== count) {
			lastCount = count;
			const toast = document.getElementById('toast-container');
			const innerText = (toast) ? toast.innerText.replace(/(\r\n|\n|\r)/gm, ' ') : '';

			ipc.send('notifications', {
				count,
				text: innerText,
			});
		}
	});
};