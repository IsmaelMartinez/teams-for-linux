import { nativeImage } from "electron";
import TrayIconChooser from "./trayIconChooser.js";

class TrayIconRenderer {
	init(config, ipcRenderer) {
		this.ipcRenderer = ipcRenderer;
		this.config = config;
		const iconChooser = new TrayIconChooser(config);
		this.baseIcon = nativeImage.createFromPath(iconChooser.getFile());
		this.iconSize = this.baseIcon.getSize();
		globalThis.addEventListener(
			"unread-count",
			this.updateActivityCount.bind(this),
		);
	}

	updateActivityCount(event) {
		const count = event.detail.number;
		const startTime = Date.now();
		
		console.debug("[TRAY_DIAG] Activity count update initiated", {
			newCount: count,
			previousCount: this.lastActivityCount || 0,
			timestamp: new Date().toISOString(),
			willFlash: count > 0 && !this.config.disableNotificationWindowFlash,
			suggestion: "Monitor renderTimeMs and totalTimeMs for performance issues"
		});
		
		this.render(count).then((icon) => {
			const renderTime = Date.now() - startTime;
			console.debug("[TRAY_DIAG] Icon render completed, sending tray update", {
				count: count,
				renderTimeMs: renderTime,
				iconDataLength: icon?.length || 0,
				willFlash: count > 0 && !this.config.disableNotificationWindowFlash,
				performanceNote: renderTime > 100 ? "Slow icon rendering detected" : "Normal rendering speed"
			});
			
			const ipcStartTime = Date.now();
			this.ipcRenderer.send("tray-update", {
				icon: icon,
				flash: count > 0 && !this.config.disableNotificationWindowFlash,
			});
			
			console.debug("[TRAY_DIAG] Tray update IPC sent", {
				count: count,
				totalTimeMs: Date.now() - startTime,
				ipcCallTimeMs: Date.now() - ipcStartTime,
				performanceNote: (Date.now() - startTime) > 200 ? "Slow tray update detected" : "Normal tray update speed"
			});
		}).catch((error) => {
			console.error("[TRAY_DIAG] Icon render failed", {
				error: error.message,
				count: count,
				elapsedMs: Date.now() - startTime,
				suggestion: "Check canvas creation and image loading in render method"
			});
		});
		
		if (!this.config.disableBadgeCount) {
			this.ipcRenderer.invoke("set-badge-count", count);
		}
		this.lastActivityCount = count;
	}

	render(newActivityCount) {
		return new Promise((resolve) => {
			const canvas = document.createElement("canvas");
			canvas.height = 140;
			canvas.width = 140;
			const image = new Image();
			
			// Add error handling for image loading
			image.onerror = () => {
				console.error("Failed to load base icon for tray rendering");
				resolve(this.baseIcon.toDataURL("image/png")); // Fallback to base icon
			};
			
			image.onload = () =>
				this._addRedCircleNotification(
					canvas,
					image,
					newActivityCount,
					resolve,
				);
			
			const dataURL = this.baseIcon.toDataURL("image/png");
			if (!dataURL || dataURL === "data:,") {
				console.error("Base icon toDataURL returned invalid data");
				resolve(this.baseIcon.toDataURL("image/png")); // Fallback
				return;
			}
			
			image.src = dataURL;
		});
	}

	_addRedCircleNotification(canvas, image, newActivityCount, resolve) {
		const ctx = canvas.getContext("2d");

		ctx.drawImage(image, 0, 0, 140, 140);
		if (newActivityCount > 0 && !this.config.disableBadgeCount) {
			ctx.fillStyle = "red";
			ctx.beginPath();
			ctx.ellipse(100, 90, 40, 40, 40, 0, 2 * Math.PI);
			ctx.fill();
			ctx.textAlign = "center";
			ctx.fillStyle = "white";

			ctx.font =
				'bold 70px "Segoe UI","Helvetica Neue",Helvetica,Arial,sans-serif';
			if (newActivityCount > 9) {
				ctx.fillText("+", 100, 110);
			} else {
				ctx.fillText(newActivityCount.toString(), 100, 110);
			}
		}
		const resizedCanvas = this._getResizeCanvasWithOriginalIconSize(canvas);
		resolve(resizedCanvas.toDataURL());
	}

	_getResizeCanvasWithOriginalIconSize(canvas) {
		const resizedCanvas = document.createElement("canvas"),
			rctx = resizedCanvas.getContext("2d");

		resizedCanvas.width = this.iconSize.width;
		resizedCanvas.height = this.iconSize.height;

		const scaleFactorX = this.iconSize.width / canvas.width,
			scaleFactorY = this.iconSize.height / canvas.height;
		rctx.scale(scaleFactorX, scaleFactorY);
		rctx.drawImage(canvas, 0, 0);

		return resizedCanvas;
	}
}

export default new TrayIconRenderer();
