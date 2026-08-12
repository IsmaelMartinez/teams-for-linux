# App Registration Auth Module

Provides persistent authentication to Teams for Linux using a dedicated Azure App Registration with MSAL Node. This module supports device-code and interactive authentication flows, persists token caches securely via Electron `safeStorage`, and seeds browser session cookies so Teams loads signed in.

## Components

- **[index.js](index.js)**: Main orchestrator for initialization and pre-auth execution
- **[config.js](config.js)**: Configuration helper functions for reading `auth.appRegistration` settings
- **[authFlow.js](authFlow.js)**: MSAL device-code and interactive authentication flow handlers
- **[cache.js](cache.js)**: Encrypted token cache persistence using Electron `safeStorage`
