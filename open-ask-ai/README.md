# Open Ask AI (MV3)

`open-ask-ai` 是一个开源 Chrome 扩展：把同一条输入并行发送到多个 AI 官方站点，便于横向对比。

## 当前能力

- 多 AI 分屏（iframe 并排）
- 一次输入并行发送
- `@` 指定发送目标站点，`#` 快速聚焦站点
- 新聊天同步触发（`NEW_CHAT` 广播）
- 图片粘贴/拖拽预加载（发送时不二次附图）
- 本地历史中心（可回到当时会话 URL）
- Pane 顶部按钮：
  - 放大/退出放大
  - 新标签打开当前会话
- 引用选中文本回填输入框
- 主题（system/light/dark）与语言（auto/zh/en）
- 可选本地 Ollama 历史标题摘要

## 当前支持站点

- ChatGPT
- DeepSeek
- Kimi
- Qwen
- Doubao
- Yuanbao
- Grok
- Claude
- Gemini

## 快速开始

1. 打开 Chrome：`chrome://extensions/`
2. 开启开发者模式
3. 选择“加载已解压的扩展程序”
4. 选择目录：`open-ask-ai`
5. 点击扩展图标打开主页面

## 文件结构

- `manifest.json`：MV3 配置
- `background.js`：打开主页面 + 动态响应头规则
- `index.html`：主界面结构
- `styles.css`：样式
- `app.js`：主页面编排逻辑（分屏/发送/历史/设置）
- `content.js`：站点注入执行器（输入/发送/附图/新聊天）

## 扩展站点

新增站点需同步两处：

1. `app.js` 的 `BUILTIN_SITES`（名称与 URL）
2. `content.js` 的 `SITES`（`matchHosts/inputSelectors/sendSelectors/newChatSelectors`）
