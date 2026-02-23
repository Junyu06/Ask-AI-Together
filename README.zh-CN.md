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

## 功能

- 多 AI iframe 分屏
- 单次输入并行发送到多个站点
- `@` 指定站点，`#` 快速聚焦站点
- 新会话同步触发（`NEW_CHAT` 广播）
- 图片粘贴/拖拽预加载
- 本地历史中心，可回到当时会话 URL
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
- `Side-by-Side AI/background.js`：打开主页面 + 动态响应头规则
- `Side-by-Side AI/index.html`：主界面结构
- `Side-by-Side AI/styles.css`：样式
- `Side-by-Side AI/app.js`：分屏/发送/历史/设置逻辑
- `Side-by-Side AI/content.js`：站点执行器（输入/发送/附图/新会话）

## 扩展新站点

需要同时更新两个文件：

1. `Side-by-Side AI/app.js` -> `BUILTIN_SITES`（名称 + URL）
2. `Side-by-Side AI/content.js` -> `SITES`（`matchHosts/inputSelectors/sendSelectors/newChatSelectors`）

## 贡献

欢迎提 Issue 和 PR。

- 反馈问题：<https://github.com/Junyu06/Ask-AI-Together/issues>
- 提交 PR：<https://github.com/Junyu06/Ask-AI-Together/pulls>

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
