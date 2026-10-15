# Helpers

This directory contains various utility functions and helper modules used across different parts of the application. These functions are designed to perform common tasks, encapsulate reusable logic, and simplify code in other modules.
`index.js` exposes `HTTPHelper` (URL joining and `net`-based GET).

`teamsHosts.js` exports `isTeamsHost(hostname)` and the `TEAMS_HOSTS` list: whether a hostname is one of the hosts the Teams SPA is served from, an immediate subdomain of one, or its `.mcas.ms` (Defender for Cloud Apps) proxy. It has no Electron dependency, so both the main process (`mainAppWindow/deepLinkRouter.js`) and the preload script use it.

`composeBox.js` exports `COMPOSE_SELECTORS` and `findCompose(doc, selectors)`: the selector cascade that locates the chat compose box, shared by the custom stickers tool (renderer) and `deepLinkRouter.focusCompose`, which serialises `findCompose` into the page. It is self-contained for that reason.
