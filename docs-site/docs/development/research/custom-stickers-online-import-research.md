# Custom Stickers — Online Import (Issue #2476 follow-up)

:::info Idea-stage
Tracking a follow-up enhancement to the custom-stickers MVP. The MVP (PR #2550) ships with a local-folder model; users have to manually drop image files into the folder. This document scopes how an "import from online" path could work, with Telegram sticker packs as the highest-value first target. Not on the immediate roadmap — recorded so the design is not lost.
:::

**Date**: 2026-05-20
**Issue**: [#2476 — Custom stickers support](https://github.com/IsmaelMartinez/teams-for-linux/issues/2476)
**Depends on**: Custom stickers MVP (PR #2550) merged
**Status**: Idea — not scheduled

---

## Background

The custom stickers MVP gives users a panel that lists every image file in `<userData>/stickers/`. Adding stickers is "drop files into that folder" — fine for power users, friction for everyone else. The original issue mentioned drag-and-drop add as an optional feature. A complementary path is importing from existing online sticker repositories.

The cheapest viable source for online stickers is Telegram. Telegram sticker packs are publicly addressable, served as ordinary HTTPS file downloads, have no auth requirement for read access, and the format is well-understood. The library is enormous: every Telegram user can author and publish packs, and the largest aggregator sites index hundreds of thousands of public packs.

## Why Telegram, not Slack / Discord / Signal

Telegram sticker packs are the only major sticker library that:

1. **Is reachable without auth from a desktop client.** Slack stickers are workspace-scoped and gated behind Slack auth. Discord stickers are server-scoped and gated behind Discord auth. Signal stickers require the Signal protocol. Telegram packs resolve via a simple bot API call or HTML scrape from `t.me/addstickers/<pack>`.
2. **Has a file-based representation.** Each pack is a list of `.webp` or `.tgs` files (`.tgs` is Lottie JSON; static `.webp` is the simpler case to start with). Downloading a pack means N HTTPS GET requests; no manifest parsing beyond a small JSON list.
3. **Has zero rate limiting for read access.** No API key, no quota.

Slack-style single-image URL paste is a smaller feature in the same family — drop a URL into the panel, download the image to the folder. ~30 lines, but lower per-action value than pack import.

## Architecture sketch

The MVP's folder-scan model is intentionally unaware of where stickers came from. That stays true under online import: the importer downloads files into the configured sticker folder, the existing scan picks them up on next panel open. No changes to the renderer's sticker rendering or the synthetic-paste path.

The import is main-process only because it does network I/O. A new IPC channel `import-sticker-pack` takes a pack identifier (`t.me/addstickers/<pack>` URL or `<pack>` slug) and returns `{ imported: <count>, skipped: <count>, errors: [...] }`.

```
[renderer panel] ── ipcRenderer.invoke("import-sticker-pack", url) ──┐
                                                                     ↓
                                            [main: customStickers/onlineImport.js]
                                                  ├─ resolves pack slug from URL
                                                  ├─ fetches pack metadata via
                                                  │    Telegram Bot API or HTML scrape
                                                  ├─ for each .webp file in pack:
                                                  │    ├─ HTTPS GET → buffer
                                                  │    ├─ writes to
                                                  │    │    <stickerFolder>/<pack>/<n>.webp
                                                  │    └─ skips if file exists
                                                  └─ returns count summary
```

Stickers from a pack go into a subdirectory named after the pack slug. That preserves provenance and enables the "categories via subfolders" follow-up if anyone ever wants categorisation — the MVP scanner currently only looks at the top level, but recursing one level is a trivial extension.

### Telegram resolution: Bot API vs. scrape

Two viable resolution paths. Both are feasible:

The **Bot API** approach (`https://api.telegram.org/bot<TOKEN>/getStickerSet?name=<pack>`) returns a clean JSON list of file IDs, then each file ID resolves to a download URL via `getFile`. Reliable, well-documented. The catch: requires a bot token. Any token works (it does not need to own the pack), but distributing the wrapper with a hardcoded bot token is a small operational concern (the token is rate-limited per-bot, so heavy usage shared across the wrapper population could trip Telegram's anti-abuse). Mitigations: cache aggressively, make the token user-configurable, or accept the risk and rotate if needed.

The **HTML scrape** approach (`https://t.me/addstickers/<pack>`) extracts the same pack metadata from the page's embedded JSON-LD or inline script tags. No token, no quota tied to the wrapper. The cost is fragility: Telegram can rearrange the page anytime, breaking the scrape. Acceptable for an opt-in feature with graceful failure.

Recommendation if this is ever built: ship the HTML scrape as the default (no setup, no abuse vector), make the Bot API path available as an opt-in via a config-supplied token for users who hit scrape failures.

## Format handling

Telegram packs ship as either static `.webp` or animated `.tgs` (Lottie). The MVP scanner already supports `.webp` if added to `customStickers.formats`. So static packs work out of the box once import lands. `.tgs` is a separate problem: it would need rendering to a static image (or to GIF) at import time, which requires a Lottie runtime in Node. `lottie-node` exists but is non-trivial.

Recommendation: start with static-only (filter out `.tgs` at import time, optionally warn the user). Animated support is a follow-up of the follow-up.

## UX

Minimal first-cut UX: a button in the sticker panel header reading "Import pack...". Clicking opens an inline input for a Telegram pack URL or slug. On submit, the importer runs and the panel refreshes. Status messages display in the panel header: "Importing... N done" → "Imported N stickers from `<pack>`".

No new top-level menu surfaces. No background polling for pack updates. Re-import re-fetches the pack and skips files that already exist.

## Configuration surface

One additional config key:

```jsonc
{
  "customStickers": {
    "enabled": true,
    "folder": "",
    "formats": ["png", "jpg", "jpeg", "gif", "webp"],
    "telegramBotToken": ""
  }
}
```

`telegramBotToken` is empty by default (HTML scrape is the path). If set, the importer prefers the Bot API path. Add `webp` to the default `formats` list if this lands, since most Telegram packs are `.webp`.

## Out of scope, ranked by request likelihood

- **Animated sticker support** (`.tgs`, Lottie). High user-value but heavy implementation.
- **Pack discovery / search**. Telegram does not provide a public search API for packs. Aggregator sites exist but their APIs are unofficial. Skip.
- **Slack workspace sticker import**. Auth complexity, workspace scoping, low overlap with target users.
- **Discord server sticker import**. Same.
- **Signal sticker pack import**. Format is Signal-protocol specific, complex.
- **Auto-update of imported packs**. Telegram pack authors can update packs; the importer could re-fetch periodically. Out of scope for any reasonable v1.
- **Pack management UI** (delete pack, list packs). Once subdirectories exist, the user manages them via the file system. A UI is a polish item, not a blocker.

## Risk register

1. **Telegram changes the page or rate-limits anonymous fetches.** Mitigation: fall back to the Bot API path; document the workaround.
2. **Imported packs contain inappropriate content.** The wrapper has no content moderation, and Telegram packs span all sensibilities. Acceptable: this is a user-initiated action with a known source; the user types the pack URL. Same liability model as the local-folder MVP — the user is responsible for what they import.
3. **Disk usage**. A typical Telegram pack is 20-50 stickers averaging 30-80 KB each. Even hundreds of packs is well under 100 MB. Not a real concern, but worth surfacing in the README.

## Sequencing

If anyone picks this up, the natural order is:

1. Add `.webp` to the default `customStickers.formats` list. Trivial; benefits anyone who already has `.webp` files in their folder.
2. Extend the scanner to recurse one level into subdirectories. Required so imported packs in subfolders are visible. Tiny change.
3. Build the Telegram HTML-scrape importer. Static-only. Single new IPC channel, single new main-process module.
4. Build the import-pack UI (panel header button + inline input). Renderer change only.
5. Add Bot API path as an opt-in fallback when scrape fails. Adds the config key.
6. (Stretch) Animated `.tgs` rendering to static image at import time.

Each step is independently shippable. Steps 1 and 2 could land as small follow-up PRs to the MVP even before the import work begins, on the grounds that they are pure infrastructure for any folder-based sticker workflow.

## Related references

- Custom stickers MVP: PR [#2550](https://github.com/IsmaelMartinez/teams-for-linux/pull/2550)
- Feasibility spike: [`spike/2476-stickers/`](https://github.com/IsmaelMartinez/teams-for-linux/tree/main/spike/2476-stickers)
- Telegram Bot API getStickerSet: https://core.telegram.org/bots/api#getstickerset
- Lottie / `.tgs` format notes: https://core.telegram.org/animated_stickers
