# Open Ask AI (MV3)

`open-ask-ai` 是一个独立的开源 Chrome 扩展，核心目标是把「同一个问题」快速分发到多个 AI 站点进行并行对比。

它主要在做这些事：

- 多 AI 分屏：同页并排打开多个 AI 官方网站
- 一次输入多处发送：输入一次，广播到所有已选站点
- 新聊天同步触发：可一键让各站点新建对话
- 历史记录中心：本地保存提问，支持按历史中的站点 URL 一键回到当时页面
- 统一控制台：在扩展页管理站点启用、排序、自定义站点
- 外观与主题：支持黑/白/跟随系统，极简黑白 UI
- 可拖动输入栏：输入区支持更大范围拖动，方便在分屏场景中避让

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
- `styles.css`: 界面样式（极简黑白主题、面板、输入栏）
- `app.js`: 分屏、发送、历史记录、设置、主题、拖拽
- `content.js`: 注入脚本（填充输入框/发送/新建对话）

## 扩展点

新增站点只需改 `app.js` 和 `content.js` 里的 `SITES` 配置：

- `url`
- `matchHosts`
- `inputSelectors`
- `sendSelectors`
- `newChatSelectors`
