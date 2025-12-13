/**
 * TimestampCopyOverride tool
 * 
 * Removes timestamps from copied messages when configured.
 */
class TimestampCopyOverride {
	init(config) {
		this.config = config;

		if (config.disableTimestampOnCopy) {
			this.setupCopyHandler();
		}
	}

	/**
	 * Set up copy event handler
	 */
	setupCopyHandler() {
		document.addEventListener("copy", (event) => {
			const selection = window.getSelection();
			if (!selection || selection.rangeCount === 0) return;

			const selectedText = selection.toString();
			if (!selectedText) return;

			// Remove timestamp patterns like [12:34] or [12:34:56]
			const cleanedText = selectedText.replace(/\[\d{1,2}:\d{2}(:\d{2})?\]\s*/g, "");

			if (cleanedText !== selectedText) {
				event.preventDefault();
				event.clipboardData.setData("text/plain", cleanedText);
				console.debug("[TimestampCopyOverride] Timestamps removed from copied text");
			}
		});

		console.debug("[TimestampCopyOverride] Copy handler set up");
	}
}

export default new TimestampCopyOverride();
