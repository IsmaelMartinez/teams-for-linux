# Login Module

Handles NTLM authentication dialog when required.

## Components

- **[index.js](index.js)**: Creates login browser window
- **[login.html](login.html)**: Simple HTML form for credentials
- **[preload.js](preload.js)**: Secure form submission handling

## Security

- Credentials are never cached
- Login window is destroyed after submission
- Uses secure IPC communication for credential transmission
