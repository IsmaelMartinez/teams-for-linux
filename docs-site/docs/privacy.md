---
title: "Privacy & Data Protection"
description: What personal data Teams for Linux does and does not handle, stated from verifiable facts about the source code.
---

<!-- Keep this statement in sync with the summary in the root PRIVACY.md. -->

Teams for Linux is an unofficial, community-maintained desktop wrapper around the Microsoft Teams web application. This page states, in plain language, what personal data the application itself does and does not handle. Every statement here can be verified against the [source code](https://github.com/IsmaelMartinez/teams-for-linux).

:::info
This is a factual, technical description of how the application behaves. It is **not legal advice** and does not constitute a data-processing agreement. Responsibility for legal compliance in any particular deployment rests with the organisation operating the Microsoft 365 environment — see [Responsibility for your Teams data](#responsibility-for-your-teams-data).
:::

_Last reviewed: July 2026._

## 1. Who is responsible

- **Project:** Teams for Linux
- **Maintainer:** Ismael Martinez
- **Contact:** ismaelmartinez@gmail.com
- **Repository:** https://github.com/IsmaelMartinez/teams-for-linux
- **Security / vulnerability reporting:** see [SECURITY.md](https://github.com/IsmaelMartinez/teams-for-linux/blob/main/SECURITY.md)

Teams for Linux is an independent open-source project and is **not affiliated with, endorsed by, or operated by Microsoft**.

## 2. What this software is

Teams for Linux is a desktop client that uses an Electron/WebView component to provide access to the **Microsoft Teams web application**. It acts solely as an access interface to Microsoft Teams — and to Microsoft's sign-in pages during authentication — and **is not an independent communications service**.

## 3. Privacy & data protection

- The application **does not collect, store, or transmit users' personal data on its own account**, and it has **no application-specific user accounts**.
- Beyond displaying the Teams web interface, the application reads limited data from the page **locally on your device** to provide desktop-integration features — for example, passing a notification's title and body to your operating system's native notifications, reading the unread-message count from the page title for the tray badge, and reflecting your presence/status in optional integrations you enable (see [Network communications](#5-network-communications)). This processing stays on your device, and **none of it is sent to the maintainer**.
- The maintainer **operates no servers and no backend infrastructure**. There is nowhere for the application to send your data to the maintainer, because no such service exists.

### Responsibility for your Teams data

Any processing of personal data arising from your use of Microsoft Teams is the responsibility of:

- **Microsoft Corporation**, as the provider of the Teams service; and
- **the organisation that owns the Microsoft 365 environment** you sign in to (your employer or institution, and its IT administration).

Responsibility for that data lies with those parties. Teams for Linux and its maintainer have **no access to, and no control over, that processing**.

## 4. Telemetry & tracking

The application contains **none** of the following:

- Usage telemetry
- Behavioural analytics
- User tracking or profiling
- Advertising
- Usage or crash statistics sent to the maintainer

No usage statistics are sent to the maintainer, because the maintainer operates no server to receive them. In addition, the application **actively blocks a set of Microsoft telemetry/beacon hosts** that are not required for Teams to function.

This reflects the application's behaviour as of the review date shown above.

## 5. Network communications

The application makes network connections only for the following purposes:

1. **Microsoft Teams** — accessing the Teams web application (its core function).
2. **Microsoft sign-in** — the Microsoft authentication endpoints required to log in.
3. **Application updates** — a version check against this project's [GitHub Releases](https://github.com/IsmaelMartinez/teams-for-linux/releases). This runs **only in the AppImage build**; it checks whether a newer version exists and **never downloads or installs anything without an explicit user action**. Installations made through a distribution's package manager (deb, rpm, snap) do **not** perform this check — they update through the system package manager. This check never contacts maintainer-operated infrastructure, because the maintainer operates none.

The following features are **optional and disabled by default**. When you enable them, they connect **only to endpoints that you configure yourself** — never to the maintainer:

- **[MQTT presence bridge](mqtt-integration.md)** — publishes your Teams presence/call status to an MQTT broker that **you** specify (for example, for home automation).
- **[Custom call backgrounds](custom-backgrounds.md)** — loads background images from a URL that **you** provide.

The application does **not** transmit information to any infrastructure managed by the maintainer.

## 6. Local data storage

The following are stored **locally on your own device** and are not transmitted to the maintainer:

- Application configuration (under `~/.config/teams-for-linux/`). See the [Configuration reference](configuration.md).
- The Teams web application's own cache, cookies, and session/local storage, managed by the embedded Chromium engine as any browser would.
- Authentication tokens, stored via the operating system's secure storage and **encrypted at rest where that storage is available** (Keychain, DPAPI, or kwallet/gnome-keyring). Where it is not available, the application falls back to unencrypted local storage, so this encryption is best-effort and platform-dependent.
- Application logs, written locally, with personally identifiable information sanitised.

## 7. Source code & auditing

The complete source code is publicly available at **https://github.com/IsmaelMartinez/teams-for-linux**.

Any organisation may review the source to independently verify:

- the data handling described here;
- the absence of maintainer telemetry;
- the network communications the application performs; and
- the security measures implemented (see the [Security Architecture](development/security-architecture.md)).

## 8. Licence

Teams for Linux is distributed under the **GNU General Public License v3.0 or later (GPL-3.0-or-later)**. The full terms are in [LICENSE.md](https://github.com/IsmaelMartinez/teams-for-linux/blob/main/LICENSE.md). As stated in that licence, the software is provided **"as is", without warranty of any kind**.

## 9. Disclaimer

The maintainer is not responsible for the availability, operation, or data processing carried out by Microsoft Teams or by any third-party service accessed through it. Teams for Linux provides access to Microsoft Teams; it does not alter, and does not assume responsibility for, how Microsoft or your organisation processes your data.
