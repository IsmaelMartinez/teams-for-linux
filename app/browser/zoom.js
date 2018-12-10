const {webFrame} = require('electron');

exports = module.exports = () => {
	document.addEventListener('keydown', (event) => {
		const keyName = event.key;

		if (keyName === 'Control') {
			// do not alert when only the Control key is being pressed.
			return;
		}

		if (event.ctrlKey) {
			if (keyName === '+') {
				webFrame.setZoomLevel(webFrame.getZoomLevel() + 1);
			} else if (keyName === '-') {
				webFrame.setZoomLevel(webFrame.getZoomLevel() - 1);
			}
		}
	}, false);
};