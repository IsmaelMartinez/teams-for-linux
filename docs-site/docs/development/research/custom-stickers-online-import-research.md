# Custom Stickers — External Sources (Issue #2476 follow-up)

:::info Idea-stage
Tracking follow-up enhancements to the custom-stickers MVP. The MVP (PR #2550) ships with a local-folder model where users manually drop image files into a configured folder. This document scopes the realistic paths for layering external sources on top of that, ranked from simplest first step to most ambitious. Nothing here is scheduled. The mentality is "simple to start, expand if useful".
:::

**Date**: 2026-05-21
**Issue**: [#2476 — Custom stickers support](https://github.com/IsmaelMartinez/teams-for-linux/issues/2476)
**Depends on**: Custom stickers MVP (PR #2550) merged
**Status**: Under consideration — sequencing pending

---

## Background

The custom stickers MVP gives users a panel that lists every image file in `<userData>/stickers/`. Adding stickers is "drop files into that folder", which is fine for power users and friction for everyone else. The original issue mentioned drag-and-drop add as an optional follow-up. The broader space below that is what "external" can mean for sticker sources, and there are two distinct interpretations worth being explicit about.

The first interpretation is pulling existing stickers from the internet into the local folder. URL paste, Telegram pack import, and similar. The wrapper acts as a fetcher; the catalog already exists somewhere public.

The second interpretation is generating new stickers via external compute. The user types a prompt, the wrapper calls an image-generation service, the result lands in the folder. The wrapper acts as a relay; the image does not exist until the user asks for it.

Both interpretations land at the same folder model. The panel does not need to know where a sticker came from. The renderer's synthetic-paste path is unchanged. All new code is main-process plus a small opt-in UI affordance on the panel.

## Realistic paths, ranked by simplicity

Three paths are realistic to scope today. They are listed in increasing order of effort and increasing order of value-per-user, which is a useful axis because the user can stop at any tier and still have shipped something worthwhile.

The first is **URL paste**, where the user drops a URL onto the panel and the wrapper fetches the image into the folder. Smallest possible foothold for "external". One new IPC channel, a content-type allowlist, and a drop target on the panel.

The second is **Telegram sticker pack import**. Higher catalog yield, but more code to write. Telegram is the only major sticker library reachable from a desktop client without auth and without rate limiting on read access.

The third is **AI generation via a user-configured backend**. Highest ceiling, but introduces a write-from-prompt code path the wrapper does not currently have. The wrapper does not bundle any model; the user points it at whichever backend they trust (and whichever they want to pay for).

The first two reuse the folder model directly: download bytes, write to disk, scan picks them up. The third is the same shape on the storage end, but the source of the bytes is a prompt instead of a URL.

## URL paste

The simplest external surface. Behaviour: the user drops or pastes an HTTPS URL onto the sticker panel, the wrapper downloads the image to the configured sticker folder, the folder scan picks it up on the next panel open.

Main-process implementation is a single new IPC handler (`import-sticker-url`) that fetches the URL with a content-type allowlist (`image/png`, `image/jpeg`, `image/gif`, `image/webp`) and a sane size cap (a few MB), writes the bytes to `<stickerFolder>/<slug>-<sha8>.<ext>`, and returns success or a structured error. HTTPS only. Redirects followed once at most.

Renderer change is a drop-target on the panel itself plus a small "paste URL" affordance for users who prefer the keyboard. No new modules, no new top-level menu items. The panel uses the existing scan-on-open path to surface the new sticker.

Cost to build is small. Useful immediately. Compounds with both Telegram pack import (which also fetches HTTPS images) and the AI angle (which writes to the same folder).

## Telegram pack import

Telegram is the only major sticker library reachable from a desktop client without auth. Slack stickers are workspace-scoped and gated behind Slack auth. Discord stickers are server-scoped and gated behind Discord auth. Signal stickers require the Signal protocol. Telegram packs resolve via a public Bot API call or via an HTML scrape of `t.me/addstickers/<pack>`, both unauthenticated for read access.

Each pack is a list of `.webp` or `.tgs` files (`.tgs` is Lottie JSON; static `.webp` is the simpler case and the only one in scope for v1). Downloading a pack means N HTTPS GET requests; no manifest parsing beyond a small JSON list. Telegram does not rate-limit anonymous fetches of pack contents.

Architecture is a new IPC channel `import-sticker-pack` taking a pack identifier (URL or slug) and returning `{ imported, skipped, errors }`. Stickers from a pack go into a subdirectory named after the pack slug, which preserves provenance and unlocks the "categories via subfolders" follow-up if anyone ever wants tab-style pack navigation. The MVP scanner currently only looks at the top level; recursing one level is a trivial extension and should land before the import work to keep the changes orthogonal.

### Telegram resolution: Bot API vs. scrape

Two viable resolution paths. The **Bot API** (`https://api.telegram.org/bot<TOKEN>/getStickerSet?name=<pack>`) returns clean JSON, reliable and well-documented. The catch is a bot token requirement. Any token works, but shipping the wrapper with an embedded token concentrates abuse risk on one identity. Mitigation is keeping the token user-configurable: zero default, user pastes their own.

The **HTML scrape** (`https://t.me/addstickers/<pack>`) extracts pack metadata from the page's embedded JSON-LD or script tags. No token, no quota tied to the wrapper, fragile to page changes.

The recommendation is to ship the scrape as the default (no setup, no abuse vector) and surface the Bot API path as an opt-in via `customStickers.telegram.botToken`. Users who hit scrape failures can paste a personal token and keep working without waiting for a wrapper patch.

## AI generation via user-configured backend

The implementation path mirrors the existing customBackground module shape. The user provides a backend URL via the `customStickers.ai.endpoint` configuration key. The wrapper makes an HTTP POST request with the user's prompt and receives image bytes in response. The wrapper has no opinion about which backend sits at the other end. The customBackground module serves as the established precedent for this pattern and the same trust model carries over.

The feature remains off by default. It activates only when `customStickers.ai.endpoint` is set to a non-empty string. There is no curated backend list and no fallback mechanism. The user chooses both the service provider and the associated cost model.

Realistic backends include OpenAI's image-generation API, Replicate, a self-hosted ComfyUI or AUTOMATIC1111 endpoint, Ollama for local models if the user runs an image-generation model locally, or any internal company endpoint that accepts a prompt and returns image bytes. The request body consists of small JSON containing the prompt. The response is either raw image bytes or a JSON envelope with a base64 field. The `customStickers.ai.responseFormat` configuration key determines how the wrapper parses the response.

Generated stickers land in the same sticker folder as other assets. They reside under an `ai/` subdirectory and are named using the format `<prompt-slug>-<timestamp>.png`. The folder scan picks them up automatically. The sticker panel does not distinguish AI-generated stickers from local files at render time. Provenance is determined by folder structure only.

The UX cost involves one extra button in the panel header labelled "Generate with AI...". This button opens an inline prompt input. Submitting the prompt triggers an IPC call. The panel shows a progress state during processing. The new sticker appears in the grid upon completion.

This shape is appropriate for "simple to start" because the wrapper does not bundle any ML model. It does not assume the presence of a GPU. It does not ship with API keys. It does not take on cost responsibility for the user. Every assumption the wrapper would otherwise have to defend, such as license of bundled weights, hardware requirements, or abuse vectors of an embedded API key, is pushed outside the wrapper.

Bundled local image-generation models are out of scope for v1 due to download size, license tangle, and GPU dependency. In-process Stable Diffusion faces the same constraints. Automatic background removal of pasted or dropped images is a separate ML pipeline and can be a later follow-up. Context-aware sticker suggestion that reads the current chat is excluded due to privacy and DOM-coupling concerns; Teams DOM can change without notice. Animated AI-generated stickers are out of scope because there is no realistic format target until static generation is established.

## Format handling

Telegram packs ship as either static `.webp` or animated `.tgs` (Lottie). The MVP scanner already supports `.webp` if added to `customStickers.formats`, so static packs work out of the box once import lands. `.tgs` is a separate problem: it needs rendering to a static image (or to GIF) at import time, which requires a Lottie runtime in Node. Static-only is the right v1 cut; animated is a follow-up of the follow-up.

AI generation backends return whatever format the user's backend produces, typically PNG or JPEG. The wrapper writes the bytes verbatim and trusts the content-type header for the extension; if missing, defaults to `.png`.

## Configuration surface

```jsonc
{
  "customStickers": {
    "enabled": true,
    "folder": "",
    "formats": ["png", "jpg", "jpeg", "gif", "webp"],
    "urlImport": {
      "enabled": true,
      "allowedContentTypes": ["image/png", "image/jpeg", "image/gif", "image/webp"],
      "maxBytes": 5242880
    },
    "telegram": {
      "enabled": false,
      "botToken": ""
    },
    "ai": {
      "endpoint": "",
      "promptField": "prompt",
      "responseFormat": "binary"
    }
  }
}
```

`urlImport.enabled` defaults true once the feature lands; it is cheap and broadly useful. `telegram.enabled` and `ai.endpoint` are both opt-in, since they introduce dependencies on third-party services (anonymous fetch tolerance for Telegram, user-paid compute for AI). Adding `webp` to the default `formats` list is a prerequisite for either Telegram or any modern image source.

## Sequencing

The natural order, simple to amazing:

1. Add `.webp` to the default `customStickers.formats` list and extend the scanner to recurse one level into subdirectories. Pure infrastructure. Required for both Telegram and AI paths to surface stickers automatically.
2. Build the URL paste importer. Smallest external surface. One IPC channel, content-type allowlist, drop target on the panel.
3. Build the Telegram HTML scrape importer (static-only). Pack metadata fetch, sticker download loop, subdirectory placement. Add panel header button.
4. Add the AI generation path. New main-process module that POSTs to the user-configured endpoint, writes bytes to the `ai/` subdirectory. Add panel header button with inline prompt input.
5. Add the Bot API fallback for Telegram when the scrape breaks. Wire through `customStickers.telegram.botToken`.
6. Pack-tab UI navigation once subdirectories exist. Renderer-only polish.
7. Stretch: animated `.tgs` rendering, drag-drop add for non-URL files, recently-used row, search filter, hover-preview for GIFs.

Each step is independently shippable. The user decides where to stop based on actual usage.

## Out of scope, and why

Slack workspace sticker import. Auth complexity, workspace scoping, low overlap with target users.

Discord server sticker import. Same.

Signal sticker pack import. Format is Signal-protocol specific, complex.

Pack discovery and global search. Telegram does not provide a public search API for packs. Aggregator sites exist but their APIs are unofficial.

Auto-update of imported packs. Telegram pack authors can update packs; periodic re-fetch is out of scope for any v1.

Pack management UI (delete pack, list packs). The user manages subdirectories via the file system. A UI is polish, not a blocker.

Bundled local image-generation models in the wrapper. Download size, license, GPU dependency, all push this outside the wrapper's scope.

In-process Stable Diffusion. Same.

Vision-based auto-tag for search. Separate ML pipeline, adds heavy dependencies, low return for current panel sizes.

Context-aware sticker suggestion that reads the current Teams chat. Privacy and DOM-coupling concerns. Teams DOM can change without notice.

Automatic background removal of pasted or dropped images. A possible follow-up to the AI angle, but not v1. The cleanest implementation is a separate "Make sticker" action that runs `rembg`-style processing on a chosen image, which is its own feature.

Animated AI-generated stickers. No realistic format target until static is established.

## Risk register

Telegram changes the page or rate-limits anonymous fetches. Mitigation: fall back to the Bot API path; document the user-token workaround.

URL paste accepts a URL that hosts non-image or malicious content. Mitigation: content-type allowlist plus size cap. Same liability model as the local-folder MVP; the user is responsible for what they import.

AI generation cost runs higher than the user expects. Mitigation: the user owns the backend and the cost model. The wrapper does not abstract billing.

AI generation quality is variable or off-brand. Outside the wrapper's responsibility; the user picks the backend.

Disk usage. A typical Telegram pack is 20-50 stickers averaging 30-80 KB each. Even hundreds of packs is well under 100 MB. AI-generated stickers are typically 100-500 KB each at common sizes. Not a real concern, worth noting in the README.

## Related references

- Custom stickers MVP: PR [#2550](https://github.com/IsmaelMartinez/teams-for-linux/pull/2550)
- Feasibility spike: [`spike/2476-stickers/`](https://github.com/IsmaelMartinez/teams-for-linux/tree/main/spike/2476-stickers)
- Custom background module (precedent for user-configured backend pattern): [`app/customBackground/`](https://github.com/IsmaelMartinez/teams-for-linux/tree/main/app/customBackground)
- Telegram Bot API `getStickerSet`: https://core.telegram.org/bots/api#getstickerset
- Lottie / `.tgs` format notes: https://core.telegram.org/animated_stickers
