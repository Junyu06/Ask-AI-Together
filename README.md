<p align="center">
  <img src="./Side-by-Side%20AI/store-assets/icon-128.png" alt="Ask AI Together logo" width="96" height="96" />
</p>

<h1 align="center">Ask AI Together</h1>
<p align="center">Open-source Chrome extension for multi-AI split view, prompt broadcast, and local conversation history.</p>

<p align="center">
  <strong>English</strong> |
  <a href="./README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="https://github.com/Junyu06/Ask-AI-Together/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/Junyu06/Ask-AI-Together" /></a>
  <a href="https://github.com/Junyu06/Ask-AI-Together/issues"><img alt="Issues" src="https://img.shields.io/github/issues/Junyu06/Ask-AI-Together" /></a>
  <a href="https://github.com/Junyu06/Ask-AI-Together/pulls"><img alt="Pull requests" src="https://img.shields.io/github/issues-pr/Junyu06/Ask-AI-Together" /></a>
  <a href="https://github.com/Junyu06/Ask-AI-Together"><img alt="MV3" src="https://img.shields.io/badge/Chrome-MV3-blue" /></a>
</p>

## Overview

`Ask AI Together` (extension name: `Side-by-Side AI`) helps you send one prompt to multiple AI official sites in parallel and compare answers side by side.

This extension is a web UI integration tool, not a standalone AI service. It opens supported AI websites in a split workspace or Compatibility Mode, so you must sign in to each AI website before using it.

Chrome Web Store:

- <https://chromewebstore.google.com/detail/side-by-side-ai/>

## Features

- Multi-AI split view with iframe panes
- Compatibility Mode for sites that do not work reliably inside iframe panes
- Broadcast one prompt to selected sites
- `@` target specific site, `#` quick focus site
- Combine the latest visible replies into one follow-up prompt
- New chat sync trigger (`NEW_CHAT` broadcast)
- Image paste/drag preload support on supported Legacy panes
- Local history center with session URL recall
- Restore previous site session URLs after reload
- Add custom sites with runtime host permission requests
- Pane actions: maximize/restore, open current session in new tab
- Quote selected text back to input box
- Theme: `system/light/dark`
- Language: `auto/zh/en`
- Optional local Ollama title summary

### Supported Sites

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

## Screenshots

<p align="center">
  <img src="./Side-by-Side%20AI/store-assets/screenshot-1.png" alt="Screenshot 1" width="32%" />
  <img src="./Side-by-Side%20AI/store-assets/screenshot-2.png" alt="Screenshot 2" width="32%" />
  <img src="./Side-by-Side%20AI/store-assets/screenshot-3.png" alt="Screenshot 3" width="32%" />
</p>

## Install

Chrome Web Store:

1. Open <https://chromewebstore.google.com/detail/side-by-side-ai/>
2. Click **Add to Chrome**
3. Sign in to each supported AI website before using the extension

Load unpacked for local development:

1. Open Chrome extensions page: `chrome://extensions/`
2. Turn on **Developer mode**
3. Click **Load unpacked**
4. Select folder: `Side-by-Side AI`
5. Click extension icon to open the main page

## Project Structure

- `Side-by-Side AI/manifest.json`: MV3 config
- `Side-by-Side AI/legacy/`: default split-pane workspace
- `Side-by-Side AI/background/`: service worker modules for tab/window routing, tiling, history, and action dispatch
- `Side-by-Side AI/content/`: content-script runtime for input, send, response extraction, attachments, and quote UI
- `Side-by-Side AI/shared/`: provider catalog, runtime contract, text formatting, history service, optional trusted agent bridge, and shared helpers
- `Side-by-Side AI/embed/`: in-page Compatibility Mode dock bootstrap
- `Side-by-Side AI/ui/options/`: options / Compatibility Mode controller UI
- `scripts/package-extension.sh`: creates `dist/side-by-side-ai-v<manifest version>.zip`

## Add a New Site

Update the shared provider definition first, then make the permission surface match it:

1. `Side-by-Side AI/shared/provider-catalog.js` -> add provider metadata, selectors, default URL, and response selectors
2. `Side-by-Side AI/manifest.json` -> add host permissions and the AI-site embed match if it is a built-in site
3. Run the relevant `scripts/validate-*.js` checks and reload the unpacked extension in Chrome before live testing

## Package

After changing `Side-by-Side AI/manifest.json`, package the extension with:

```bash
scripts/package-extension.sh
```

The zip is written to `dist/` and is named from the manifest version.

## Contributing

Issues and pull requests are welcome.

- Report bugs: <https://github.com/Junyu06/Ask-AI-Together/issues>
- Submit PRs: <https://github.com/Junyu06/Ask-AI-Together/pulls>

## Buy Me a Coffee

If this project helps you, you can support it here:

- <https://buymeacoffee.com/junyu06>

## License

[MIT](./LICENSE)

---

<p align="center">
  <a href="https://github.com/Junyu06/Ask-AI-Together">GitHub</a>
  ·
  <a href="https://github.com/Junyu06/Ask-AI-Together/issues">Issues</a>
  ·
  <a href="https://github.com/Junyu06/Ask-AI-Together/pulls">Pull Requests</a>
</p>
