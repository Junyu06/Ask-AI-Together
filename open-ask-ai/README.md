# Open Ask AI (MV3)

一个独立的开源 Chrome 扩展（不依赖 `cb/plw` 代码），只做两件事：

- 多 AI 分屏输入与发送
- 本地历史记录

设计原则：

- 不控制站点上的 `thinking/deep search/web search` 开关
- 这些开关由用户在各 AI 官方网页自行点击
- 扩展仅做消息分发与历史记录

## 快速开始

1. 打开 Chrome: `chrome://extensions/`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择目录：`open-ask-ai`
5. 点击扩展图标打开分屏页

## 当前支持站点（可扩展）

- ChatGPT
- DeepSeek
- Kimi
- Qwen
- Doubao
- Yuanbao
- Grok
- Gemini

## 文件结构

- `manifest.json`: MV3 配置
- `background.js`: 打开主页面 + iframe 兼容规则
- `index.html`: 主界面
- `styles.css`: 界面样式
- `app.js`: 分屏、发送、历史记录、设置
- `content.js`: 注入脚本（填充输入框/发送/新建对话）

## 扩展点

新增站点只需改 `app.js` 和 `content.js` 里的 `SITES` 配置：

- `url`
- `matchHosts`
- `inputSelectors`
- `sendSelectors`
- `newChatSelectors`
