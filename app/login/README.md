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
- `isExpectedChallenge` decides which challenges are answered at all: a proxy always, any other server only over HTTPS and, when `auth.basic.hosts` is set, only those hosts. A refused challenge is cancelled, is not counted as a login try and is logged without its host
