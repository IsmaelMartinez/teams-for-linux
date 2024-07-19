let _WakeLock_lock = new WeakMap();
class WakeLock {
	constructor() {
		_WakeLock_lock.set(this, null);
	}

	async enable() {
		try {
			let lock = await navigator.wakeLock.request('screen');
			lock.addEventListener('release', () => {
				console.debug('Wake Lock was released');
			});
			console.debug('Wake Lock is active');
			_WakeLock_lock.set(this, lock);

		} catch (err) {
			console.error(`wakelog enable error ${err.name}, ${err.message}`);
		}
	}

	async disable() {
		let lock = _WakeLock_lock.get(this);
		if (!lock) {
			return;
		}
		try {
			await lock.release();
			lock = null;
			_WakeLock_lock.set(this, lock);
		} catch (err) {
			console.error(`wakelog disable error ${err.name}, ${err.message}`);
		}
	}
}

const wakeLock = new WakeLock();
module.exports = wakeLock;