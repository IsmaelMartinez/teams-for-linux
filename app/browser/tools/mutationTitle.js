class MutationObserverTitle {
    
	init(config) {
		if (config.useMutationTitleLogic) {
			console.log('MutationObserverTitle enabled');
			window.addEventListener('DOMContentLoaded', this._applyMutationToTitleLogic);
		}
	}

	_applyMutationToTitleLogic() {
		console.log('Appliying MutationObserverTitle logic');
		const observer = new window.MutationObserver(
			() => {
				console.log('title changed');
				console.log(window.document.title);
				const regex = /^\((\d+)\)/;
				const match = regex.exec(window.document.title);
				const number = match ? match[1] : 0;
				console.log(number);
				const event = new CustomEvent('unread-count', { detail: { number: number } });
				window.dispatchEvent(event);
			}
		);
		observer.observe(window.document.querySelector('title'),{ childList: true });
		console.log('MutationObserverTitle logic applied');
	}
}

exports = module.exports = new MutationObserverTitle();