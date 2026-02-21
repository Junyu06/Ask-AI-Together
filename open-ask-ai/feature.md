# Open Ask AI 功能总览（当前实现）

本文档对齐 `open-ask-ai` 当前代码（`manifest.json`、`background.js`、`index.html`、`styles.css`、`app.js`、`content.js`），用于说明实际功能与实现路径。

## 1. 产品定位

- 这是一个 MV3 Chrome 扩展主页面。
- 核心能力是把同一条输入并行发送到多个 AI 官方站点。
- 扩展负责分屏、发送编排、历史记录和 UI 控制，不接管站点内部模型策略。

## 2. 文件职责

- `manifest.json`
  - MV3 配置。
  - 权限：`storage`、`declarativeNetRequest`。
  - `content.js` 注入到 `<all_urls>`，`all_frames: true`。
- `background.js`
  - 点击扩展图标打开 `index.html`。
  - 安装时下发动态规则（id=9001），移除 `x-frame-options/frame-options/csp` 相关响应头，提升 iframe 可加载率。
- `index.html`
  - 分屏容器 `#panes`。
  - 底部输入气泡（设置/历史/新聊天/输入/发送）。
  - 右侧设置面板（站点、主题、语言、历史摘要）。
  - 历史面板。
- `styles.css`
  - 亮暗主题变量。
  - 分屏、拖拽分隔、放大模式、输入气泡、历史面板、mention/attachment 样式。
- `app.js`
  - 主页面编排：分屏渲染、消息广播、站点管理、历史管理、主题语言、拖拽逻辑。
- `content.js`
  - 站点执行器：识别站点、填充输入、触发发送、附图、新聊天、引用回传、URL 上报。

## 3. 当前支持站点

内置站点（`BUILTIN_SITES` + `content.js` `SITES`）：

- ChatGPT
- DeepSeek
- Kimi
- Qwen
- Doubao
- Yuanbao
- Grok
- Claude
- Gemini

默认选中：`chatgpt`、`deepseek`、`kimi`。

## 4. 关键功能

### 4.1 多站分屏 + 可调宽度

- 每个站点渲染一个 `pane + iframe`。
- 分隔条可拖拽调整宽度，最小宽度限制，比例保存在内存态 `paneRatios`。

### 4.2 Pane 顶部双按钮

- 放大按钮：进入/退出单站聚焦模式（Focus Mode）。
- 打开按钮：在新标签页打开该站点当前会话 URL（若无会话 URL 则回退站点首页）。

### 4.3 输入与发送

- `Enter` 发送，`Shift+Enter` 换行。
- `@` 选择目标站点（仅向提及站点发送）。
- `#` 选择并切换聚焦站点。
- 新聊天按钮会广播 `NEW_CHAT` 给各 iframe。

### 4.4 图片处理（预加载模式）

- 在主输入框支持粘贴/拖入图片。
- 每次图片操作会替换当前待发附件（不累积历史批次）。
- 粘贴后立即广播 `ATTACH_IMAGES` 给目标站点，做“预加载上传”。
- `CHAT_MESSAGE` 当前只发文本；发送阶段不再二次附图。
- 内容页附图顺序：`file input` -> `drop` -> `paste`。

### 4.5 焦点体验

- 发送后主输入框自动回焦。
- 粘贴/拖入图片后主输入框持续回焦（多次短延迟拉回），降低 iframe 抢焦点问题。

### 4.6 历史记录

- 本地存储 `oa_history`，最多 200 条。
- 历史包含：标题、时间、站点名、站点 URL 映射。
- 点击历史项可恢复站点选择并跳回对应会话 URL。
- 图片消息也会入历史（无文本时使用 `[图片]`/`[Image]`）。
- 内容页 URL 变化会回传，主页面会补丁更新历史中的 URL。

### 4.7 引用选中文本

- 在子页面选中非输入区域文本时，出现浮动引用按钮。
- 点击后回传主页面，按 markdown 引用格式插入输入框。

### 4.8 设置能力

- 站点启用/停用、排序、自定义站点增删。
- 主题：`system/light/dark`。
- 语言：`auto/zh/en`。
- 历史标题摘要（可选）：调用本地 Ollama `/api/generate`，失败回退本地截断摘要。

## 5. 页面间消息协议

主页面 -> 内容页：

- `CHAT_MESSAGE`
  - `message`: 文本
  - `payload`: 当前为空对象（不携带图片）
- `ATTACH_IMAGES`
  - `payload.images`: 图片数组（预加载）
- `NEW_CHAT`

内容页 -> 主页面：

- `UPDATE_HISTORY`
  - `payload.siteId`
  - `payload.url`
- `QUOTE_TEXT`
  - `payload.text`
  - `payload.siteId`
  - `payload.url`
- `PANE_EXIT_FOCUS`

## 6. 存储键

`chrome.storage.local`：

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

## 7. 已知约束

- 依赖目标站点 DOM 结构，站点改版可能导致选择器失效。
- iframe 可加载性受浏览器与目标站点策略影响，动态规则只能尽量提升成功率。
- 图片预加载是否成功取决于目标站点是否接受模拟事件。
- Gemini 站点对注入和附件链路限制更严格，表现可能不稳定。
