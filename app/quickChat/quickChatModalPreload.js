const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('quickChatApi', {
  // Search for people using Graph API
  searchPeople: (query) => {
    return ipcRenderer.invoke('graph-api-search-people', query, { top: 10 });
  },

  // Open chat with a user via deep link
  openChat: (email) => {
    ipcRenderer.send('quick-chat:open-chat', email);
  },

  // Send a chat message to a user via IC3 chat service
  sendMessage: (contactInfo, content) => {
    return ipcRenderer.invoke('graph-api-send-chat-message', contactInfo, content);
  },

  // Close the modal
  close: () => {
    ipcRenderer.send('quick-chat:hide');
  },

  // Listen for focus events (when modal is shown)
  onFocus: (callback) => {
    ipcRenderer.on('quick-chat-focus', () => {
      if (typeof callback === 'function') {
        callback();
      }
    });
  },
});
