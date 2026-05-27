<p align="center">
  <img src="./Side-by-Side%20AI/store-assets/icon-128.png" alt="Ask AI Together logo" width="96" height="96" />
</p>

<h1 align="center">Ask AI Together</h1>
<p align="center">开源 Chrome 扩展：多 AI 分屏、提示词并行发送、本地会话历史。</p>

<p align="center">
  <a href="./README.md">English</a> |
  <strong>简体中文</strong>
</p>

<p align="center">
  <a href="https://github.com/Junyu06/Ask-AI-Together/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/Junyu06/Ask-AI-Together" /></a>
  <a href="https://github.com/Junyu06/Ask-AI-Together/issues"><img alt="Issues" src="https://img.shields.io/github/issues/Junyu06/Ask-AI-Together" /></a>
  <a href="https://github.com/Junyu06/Ask-AI-Together/pulls"><img alt="Pull requests" src="https://img.shields.io/github/issues-pr/Junyu06/Ask-AI-Together" /></a>
  <a href="https://github.com/Junyu06/Ask-AI-Together"><img alt="MV3" src="https://img.shields.io/badge/Chrome-MV3-blue" /></a>
</p>

## 概览

`Ask AI Together`（扩展名：`Side-by-Side AI`）可以将同一条提示词并行发送到多个 AI 官方站点，便于横向对比回答。

这是一个网页 UI 集成扩展，不是独立 AI 服务。它会在分屏工作区或 Compatibility Mode 中打开各 AI 官方网站，因此使用前需要先分别登录对应 AI 网站。

## 功能

- 多 AI iframe 分屏
- Compatibility Mode，用于 iframe 内不稳定的站点
- 单次输入并行发送到多个站点
- `@` 指定站点，`#` 快速聚焦站点
- 将当前可见的最新回复合并成后续追问 prompt
- 新会话同步触发（`NEW_CHAT` 广播）
- Legacy 分屏中对支持站点进行图片粘贴/拖拽预加载
- 本地历史中心，可回到当时会话 URL
- reload 后恢复历史中的站点会话 URL
- 支持自定义站点，并在运行时请求对应站点权限
- Pane 操作：放大/还原、在新标签页打开当前会话
- 引用选中文本回填输入框
- 主题：`system/light/dark`
- 语言：`auto/zh/en`
- 可选本地 Ollama 历史标题摘要

### 已支持站点

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

## 截图

<p align="center">
  <img src="./Side-by-Side%20AI/store-assets/screenshot-1.png" alt="Screenshot 1" width="32%" />
  <img src="./Side-by-Side%20AI/store-assets/screenshot-2.png" alt="Screenshot 2" width="32%" />
  <img src="./Side-by-Side%20AI/store-assets/screenshot-3.png" alt="Screenshot 3" width="32%" />
</p>

## 快速开始

1. 打开 Chrome 扩展页面：`chrome://extensions/`
2. 打开**开发者模式**
3. 点击**加载已解压的扩展程序**
4. 选择目录：`Side-by-Side AI`
5. 点击扩展图标打开主页面

## 项目结构

- `Side-by-Side AI/manifest.json`：MV3 配置
- `Side-by-Side AI/legacy/`：默认分屏工作区
- `Side-by-Side AI/background/`：service worker 模块，负责 tab/window 路由、平铺、历史和动作分发
- `Side-by-Side AI/content/`：content-script runtime，负责输入、发送、回复提取、附件和引用 UI
- `Side-by-Side AI/shared/`：provider catalog、runtime contract、文本格式化、history service、可选 trusted agent bridge 和共享 helper
- `Side-by-Side AI/embed/`：网页内 Compatibility Mode dock 启动脚本
- `Side-by-Side AI/ui/options/`：选项页 / Compatibility Mode 控制界面
- `scripts/package-extension.sh`：生成 `dist/side-by-side-ai-v<manifest version>.zip`

## 扩展新站点

先更新共享 provider 定义，再同步权限范围：

1. `Side-by-Side AI/shared/provider-catalog.js` -> 增加 provider metadata、selectors、默认 URL 和 response selectors
2. `Side-by-Side AI/manifest.json` -> 内置站点需要同步 host permissions 和 AI-site embed match
3. 运行相关 `scripts/validate-*.js` 检查，并在 Chrome 中 reload unpacked extension 后再做 live test

## 打包

修改 `Side-by-Side AI/manifest.json` 后，用下面命令打包：

```bash
scripts/package-extension.sh
```

zip 会输出到 `dist/`，文件名来自 manifest version。

## 贡献

欢迎提 Issue 和 PR。

- 反馈问题：<https://github.com/Junyu06/Ask-AI-Together/issues>
- 提交 PR：<https://github.com/Junyu06/Ask-AI-Together/pulls>

## Buy Me a Coffee

如果这个项目对你有帮助，欢迎在这里支持：

- <https://buymeacoffee.com/junyu06>

## 许可证

[MIT](./LICENSE)

---

<p align="center">
  <a href="https://github.com/Junyu06/Ask-AI-Together">GitHub</a>
  ·
  <a href="https://github.com/Junyu06/Ask-AI-Together/issues">Issues</a>
  ·
  <a href="https://github.com/Junyu06/Ask-AI-Together/pulls">Pull Requests</a>
</p>
