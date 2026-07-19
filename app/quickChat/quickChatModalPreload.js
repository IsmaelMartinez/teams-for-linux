const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('quickChatApi', {
  searchPeople: (query) => {
    return ipcRenderer.invoke('graph-api-search-people', query, { top: 10 });
  },

  sendMessage: (contactInfo, content) => {
    return ipcRenderer.invoke('graph-api-send-chat-message', contactInfo, content);
  },

  close: () => {
    ipcRenderer.send('quick-chat:hide');
  },

  onFocus: (callback) => {
    ipcRenderer.on('quick-chat-focus', () => {
      if (typeof callback === 'function') {
        callback();
      }
    });
  },
});
