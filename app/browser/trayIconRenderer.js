const { nativeImage } = require('electron');

class TrayIconRenderer {

	constructor(baseIconPath) {
		this.baseIconPath = baseIconPath;
	}

	render(newActivityCount) {
		const baseIcon = nativeImage.createFromPath(this.baseIconPath);

		return new Promise(resolve => {
			const canvas = document.createElement('canvas');
			canvas.height = 140;
			canvas.width = 140;
			const image = new Image();
			image.src = baseIcon.toDataURL('image/png');

			// Create the red circle for notifications
			image.onload = () => {
				const ctx = canvas.getContext('2d');
				ctx.drawImage(image, 0, 0, 140, 140);
				if (newActivityCount > 0) {
					ctx.fillStyle = 'red';
					ctx.beginPath();
					ctx.ellipse(105, 35, 35, 35, 35, 0, 2 * Math.PI);
					ctx.fill();
					ctx.textAlign = 'center';
					ctx.fillStyle = 'white';

					ctx.font = 'bold 70px "Segoe UI","Helvetica Neue",Helvetica,Arial,sans-serif';
					if (newActivityCount > 9) {
						ctx.fillText('9+', 105, 60);
					} else {
						ctx.fillText(newActivityCount.toString(), 105, 60);
					}
				}

				const iconUrl = canvas.toDataURL();

				resolve(iconUrl);
			};
		});
	}
}

module.exports = exports = TrayIconRenderer;