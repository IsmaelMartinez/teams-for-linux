
const { ipcRenderer } = require('electron')

exports = module.exports = () => {

    console.log('onlineOfflineListener');

    const updateOnlineStatus = () => {
        ipcRenderer.send('online-status-changed', navigator.onLine ? 'online' : 'offline')
    }

    window.addEventListener('online',  updateOnlineStatus)
    window.addEventListener('offline',  updateOnlineStatus)

    updateOnlineStatus()
};