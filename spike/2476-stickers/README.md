# spike/2476-stickers

Feasibility spike for [#2476 Custom stickers support](https://github.com/IsmaelMartinez/teams-for-linux/issues/2476).

See [`SPIKE.md`](./SPIKE.md) for the plan, findings from the research phase, and the decision tree.

## Quick start

1. Launch teams-for-linux as normal (`npm start` from repo root) and sign in.
2. Open a 1:1 chat. Focus the compose box once so the editor is rendered.
3. Open DevTools (`Cmd/Ctrl+Shift+I`).
4. Paste the entire contents of [`devtools-paste-test.js`](./devtools-paste-test.js) into the Console and hit Enter.
5. A small panel appears bottom-right. Click "Phase 0: inspect compose" first, then "Phase 1: synthetic paste".
6. Record the outcome in `SPIKE.md` under the Phase 0 / Phase 1 results sections.

## Why this is a spike and not an implementation

Per the [research phase](./SPIKE.md#findings-from-the-research-phase) the load-bearing assumption (synthetic ClipboardEvent producing a sendable image in Teams compose) has no public prior art and the relevant browser-spec behaviour points at "synthetic paste does not run default insertion". Implementing the full feature before validating that single assumption risks a lot of wasted UI / config work for a path that does not actually move pixels into compose.

If the spike confirms the path, the rest is mechanical: floating panel, folder list, config option, IPC for `get-sticker-list`, all following existing wrapper patterns (`customBackground`, `customCSS`).

If the spike fails on both Phase 1 and Phase 2, the right outcome is to report findings on #2476 and route to "Not Planned / Not Feasible" with a pointer to Microsoft's official compose-extension surface as the supported alternative.
