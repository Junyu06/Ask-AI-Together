# Side-by-Side AI Feature Overview

This document reflects the current MV3 extension structure as of version `0.3.1`.

## Product Shape

Side-by-Side AI is a web UI integration extension. It does not provide its own AI model or account system. Users sign in to each supported AI website, then use the extension to open those sites in a shared workspace, broadcast prompts, collect replies, and restore local session history.

The extension has two user-facing modes:

- Legacy split-pane mode: the default iframe workspace at `legacy/index.html`.
- Compatibility Mode: top-level tab/window orchestration controlled through `ui/options/options.html` and the in-page dock from `embed/page-embed-options.js`.

## Built-In Providers

Built-in providers are defined in `shared/provider-catalog.js` and mirrored by `manifest.json` host permissions:

- ChatGPT
- DeepSeek
- Kimi
- Qwen
- Doubao
- Yuanbao
- Grok
- Claude
- Gemini
- Perplexity

Default selected providers are ChatGPT, Claude, and Gemini.

## Core Features

### Prompt Broadcast

- Send one prompt to selected providers.
- Use `@` targeting to send to specific sites.
- Use `#` focus shortcuts to expand one site quickly.
- Preserve prompt text on transport/runtime failures where possible.

### Combine Latest

- Collect the latest visible assistant reply from active panes.
- Format collected replies into one follow-up prompt using `shared/text-format.js`.
- If the user has typed text, typed text wins.
- Otherwise a saved follow-up preset may be used.
- If neither exists, the follow-up prompt remains blank.

### New Chat

- Broadcast a new-chat action to currently opened sites.
- Provider-specific new-chat selectors live in `shared/provider-catalog.js`.

### Local History

- Local history uses Chrome storage and is mediated by `shared/history-service.js`.
- History mutations are routed through the background-owned queue to reduce cross-context lost updates.
- Targeted URL patching keeps conversation URLs up to date for restored sessions.

### Attachments

- Attachment support is Legacy-only.
- Compatibility Mode exposes attachment as unsupported preflight and should not start a send or write failed-send history for unsupported file payloads.
- Legacy paste/drag attachment preload broadcasts `ATTACH_FILES` to target iframes before text send.
- Gemini uses a provider-specific main-world attachment hook before falling back to isolated-world file input, drop, and paste.
- As of the 2026-05-26 v0.3.1 smoke, Gemini, Claude, and ChatGPT were verified with the same test image. Grok was not verified because the page returned `No response` / unable to finish replying.

### Quote UI

- Selecting text in provider pages can expose a quote button.
- Quote button rendering is shared through `shared/quote-helper.js`.
- Legacy and Compatibility keep separate transport paths.

## Runtime Layers

| Layer | Files | Responsibility |
|---|---|---|
| Manifest | `manifest.json` | MV3 permissions, content script load order, web accessible resources |
| Background | `background/` | service worker routing, target registry, tiling, history mutation queue |
| Shared | `shared/` | provider catalog, runtime contract, text formatting, history, quote helper |
| Content runtime | `content/` | DOM querying, input injection, response extraction, attachments, send/new-chat runtime |
| Legacy shell | `legacy/` | default iframe split-pane UI and iframe `postMessage` adapter |
| Compatibility shell | `ui/options/`, `embed/` | options/controller UI, in-page dock, top-level tab/window control |
| Assets | `assets/`, `store-assets/` | shared CSS/JS helpers and extension/store images |

## Important Storage Keys

- `oa_selected_sites`
- `oa_history`
- `oa_custom_sites`
- `oa_site_order`
- `oa_theme_mode`
- `oa_site_url_state`
- `oa_locale_mode`
- `oa_history_summary_enabled`
- `oa_history_summary_url`
- `oa_history_summary_model`
- `oa_window_targets_v1`

## Validation

Use targeted validators under `scripts/validate-*.js`. Important regression checks include:

- `validate-runtime-contract.js`
- `validate-provider-catalog-text-format.js`
- `validate-legacy-shared-runtime-routing.js`
- `validate-slice5-quote-cleanup.js`
- `validate-gemini-attachment-main-world.js`

For user-visible Chrome extension bugs, local validators are not enough. Reload the unpacked extension in Chrome, reopen the relevant extension/provider pages, then run the same user-path live smoke.

## Packaging

The package script reads the manifest version and writes the zip to `dist/`:

```bash
scripts/package-extension.sh
```

For version `0.3.1`, the expected package name is `dist/side-by-side-ai-v0.3.1.zip`.

## Known Constraints

- Provider automation depends on third-party website DOM and can break when sites redesign their UI.
- Some providers do not behave reliably inside iframes; use Compatibility Mode for those cases.
- Image upload support varies by provider and mode.
- Compatibility Mode intentionally does not support attachments.
- Grok remains a separate verification target for image upload because the 2026-05-26 test did not complete.
