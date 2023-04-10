var _WakeLock_lock = new WeakMap();
class WakeLock {
    constructor() {
        _WakeLock_lock.set(this, null);
    }

    async enable() {
        try {
            var lock = await navigator.wakeLock.request('screen');
            lock.addEventListener('release', () => {
                console.log('Wake Lock was released');
            });
            console.log('Wake Lock is active');
            _WakeLock_lock.set(this, lock);

        } catch (err) {
            console.error(`${err.name}, ${err.message}`);
        }
    }

    async disable() {
        var lock = _WakeLock_lock.get(this);
        if (!lock) {
            return;
        }
        try {
            await lock.release();
            lock = null;
            _WakeLock_lock.set(this, lock);
        } catch (err) {
            console.error(`${err.name}, ${err.message}`);
        }
    }
}

const wakeLock = new WakeLock();
module.exports = wakeLock;