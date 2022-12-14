const { nativeImage } = require('electron');
class TrayIconRenderer {

	constructor(baseIconPath) {
		this.baseIconPath = baseIconPath;
		this.baseIcon = nativeImage.createFromPath(this.baseIconPath);
		this.iconSize = this.baseIcon.getSize();
	}

	render(newActivityCount) {
		return new Promise(resolve => {
			const canvas = document.createElement('canvas');
			canvas.height = 140;
			canvas.width = 140;
			const image = new Image();
			image.src = this.baseIcon.toDataURL('image/png');
			image.onload = () => this._addRedCircleNotification(canvas, image, newActivityCount, resolve);
		});
	}

	_addRedCircleNotification(canvas, image, newActivityCount, resolve) {
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
		const resizedCanvas = this._getResizeCanvasWithOriginalIconSize(canvas);
		resolve(resizedCanvas.toDataURL());
	}

	_getResizeCanvasWithOriginalIconSize (canvas) {
		const resizedCanvas = document.createElement('canvas'),
			rctx = resizedCanvas.getContext('2d');

		resizedCanvas.width = this.iconSize.width;
		resizedCanvas.height = this.iconSize.height;

		const scaleFactorX = this.iconSize.width / canvas.width,
			scaleFactorY = this.iconSize.height / canvas.height;
		rctx.scale(scaleFactorX, scaleFactorY);
		rctx.drawImage(canvas, 0, 0);

		return resizedCanvas;
	}
}

module.exports = exports = TrayIconRenderer;