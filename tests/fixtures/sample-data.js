/**
 * Sample Data Fixtures for Testing
 */

export const sampleConfigs = {
  minimal: {
    appId: 'teams-for-linux',
    version: '3.0.0',
  },

  complete: {
    appId: 'teams-for-linux',
    version: '3.0.0',
    window: {
      width: 1024,
      height: 768,
      minWidth: 400,
      minHeight: 300,
    },
    plugins: [
      'notifications',
      'tray',
      'shortcuts',
    ],
    autoStart: false,
    minimizeToTray: true,
    startMinimized: false,
  },

  invalid: {
    // Missing required fields
    version: '3.0.0',
  },
};

export const samplePlugins = [
  {
    name: 'notifications-plugin',
    version: '1.0.0',
    enabled: true,
  },
  {
    name: 'tray-plugin',
    version: '1.2.0',
    enabled: true,
  },
  {
    name: 'shortcuts-plugin',
    version: '2.0.0',
    enabled: false,
  },
];

export const sampleServices = [
  {
    name: 'logger',
    type: 'utility',
  },
  {
    name: 'storage',
    type: 'persistence',
  },
  {
    name: 'network',
    type: 'communication',
  },
];

export const sampleEvents = {
  windowCreated: {
    type: 'window.created',
    data: {
      windowId: 'main-window',
      timestamp: Date.now(),
    },
  },

  pluginInitialized: {
    type: 'plugin.initialized',
    data: {
      pluginName: 'sample-plugin',
      version: '1.0.0',
      timestamp: Date.now(),
    },
  },

  serviceRegistered: {
    type: 'service.registered',
    data: {
      serviceName: 'sample-service',
      timestamp: Date.now(),
    },
  },
};

export const sampleUsers = [
  {
    id: '1',
    email: 'test1@example.com',
    name: 'Test User 1',
  },
  {
    id: '2',
    email: 'test2@example.com',
    name: 'Test User 2',
  },
];

export const sampleErrors = {
  pluginNotFound: new Error('Plugin not found'),
  serviceNotAvailable: new Error('Service not available'),
  invalidConfiguration: new Error('Invalid configuration'),
  initializationFailed: new Error('Initialization failed'),
};
