/**
 * MutationTitle tool
 * 
 * Uses MutationObserver to monitor title changes and extract unread counts.
 */
class MutationTitle {
	init(config) {
		this.config = config;
		this.observer = null;
		this.lastCount = 0;
		this.startObserving();
	}

	/**
	 * Start observing title changes
	 */
	startObserving() {
		// Observe the document title
		const titleElement = document.querySelector("title");
		if (!titleElement) {
			// Wait for title element
			setTimeout(() => this.startObserving(), 500);
			return;
		}

		this.observer = new MutationObserver(() => {
			this.onTitleChange();
		});

		this.observer.observe(titleElement, {
			childList: true,
			characterData: true,
			subtree: true,
		});

		// Also observe head for title changes
		const head = document.querySelector("head");
		if (head) {
			const headObserver = new MutationObserver((mutations) => {
				for (const mutation of mutations) {
					if (mutation.addedNodes) {
						for (const node of mutation.addedNodes) {
							if (node.nodeName === "TITLE") {
								this.onTitleChange();
							}
						}
					}
				}
			});
			headObserver.observe(head, { childList: true });
		}

		// Initial check
		this.onTitleChange();
		console.debug("[MutationTitle] Started observing title changes");
	}

	/**
	 * Handle title change
	 */
	onTitleChange() {
		const title = document.title;
		const count = this.extractUnreadCount(title);

		if (count !== this.lastCount) {
			this.lastCount = count;
			this.emitUnreadCount(count);
		}
	}

	/**
	 * Extract unread count from title
	 * @param {string} title - The document title
	 * @returns {number} The unread count
	 */
	extractUnreadCount(title) {
		// Match patterns like "(5) Microsoft Teams" or "Microsoft Teams (5)"
		const match = title.match(/\((\d+)\)/);
		if (match) {
			return parseInt(match[1], 10);
		}
		return 0;
	}

	/**
	 * Emit unread count event
	 * @param {number} count - The unread count
	 */
	emitUnreadCount(count) {
		const event = new CustomEvent("unread-count", {
			detail: { number: count }
		});
		globalThis.dispatchEvent(event);
		console.debug(`[MutationTitle] Unread count: ${count}`);
	}
}

export default new MutationTitle();
