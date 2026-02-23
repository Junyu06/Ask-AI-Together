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
  <sub>GitHub README cannot auto-switch language by viewer locale. Use the language links above.</sub>
</p>

<p align="center">
  <a href="https://github.com/Junyu06/Ask-AI-Together/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/Junyu06/Ask-AI-Together" /></a>
  <a href="https://github.com/Junyu06/Ask-AI-Together/issues"><img alt="Issues" src="https://img.shields.io/github/issues/Junyu06/Ask-AI-Together" /></a>
  <a href="https://github.com/Junyu06/Ask-AI-Together/pulls"><img alt="Pull requests" src="https://img.shields.io/github/issues-pr/Junyu06/Ask-AI-Together" /></a>
  <a href="https://github.com/Junyu06/Ask-AI-Together"><img alt="MV3" src="https://img.shields.io/badge/Chrome-MV3-blue" /></a>
</p>

## Overview

`Ask AI Together` (extension name: `Side-by-Side AI`) helps you send one prompt to multiple AI official sites in parallel and compare answers side by side.

## Features

- Multi-AI split view with iframe panes
- Broadcast one prompt to selected sites
- `@` target specific site, `#` quick focus site
- New chat sync trigger (`NEW_CHAT` broadcast)
- Image paste/drag preload support
- Local history center with session URL recall
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

## Screenshots

<p align="center">
  <img src="./Side-by-Side%20AI/store-assets/screenshot-1.png" alt="Screenshot 1" width="32%" />
  <img src="./Side-by-Side%20AI/store-assets/screenshot-2.png" alt="Screenshot 2" width="32%" />
  <img src="./Side-by-Side%20AI/store-assets/screenshot-3.png" alt="Screenshot 3" width="32%" />
</p>

## Quick Start

1. Open Chrome extensions page: `chrome://extensions/`
2. Turn on **Developer mode**
3. Click **Load unpacked**
4. Select folder: `Side-by-Side AI`
5. Click extension icon to open the main page

## Project Structure

- `Side-by-Side AI/manifest.json`: MV3 config
- `Side-by-Side AI/background.js`: open main page + dynamic response header rules
- `Side-by-Side AI/index.html`: main layout
- `Side-by-Side AI/styles.css`: styles
- `Side-by-Side AI/app.js`: split panes / broadcast / history / settings logic
- `Side-by-Side AI/content.js`: site executor (input/send/image/new chat)

## Add a New Site

Update both files:

1. `Side-by-Side AI/app.js` -> `BUILTIN_SITES` (name + URL)
2. `Side-by-Side AI/content.js` -> `SITES` (`matchHosts/inputSelectors/sendSelectors/newChatSelectors`)

## Contributing

Issues and pull requests are welcome.

- Report bugs: <https://github.com/Junyu06/Ask-AI-Together/issues>
- Submit PRs: <https://github.com/Junyu06/Ask-AI-Together/pulls>

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
