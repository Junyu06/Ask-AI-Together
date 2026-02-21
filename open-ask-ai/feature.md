# Open Ask AI 功能总览（基于当前代码）

本文档对应目录 `open-ask-ai` 当前实现（`manifest.json`、`background.js`、`index.html`、`styles.css`、`app.js`、`content.js`），用于让后续 AI 快速理解：
- 现在有哪些功能
- 每个功能在哪里实现
- 功能应该按什么机制实现（消息流/存储流/UI 流）

## 1. 产品定位

`open-ask-ai` 是一个 MV3 Chrome 扩展主页面，核心是“同一个问题并行发到多个 AI 官方站点”，而不是接管这些站点内部能力。

原则（已落地）：
- 只做多站点分屏、消息分发、历史记录、界面控制。
- 不控制站点内模型选择、联网搜索、深度思考等开关。
- 与站点交互通过内容脚本 + 选择器匹配 + DOM 事件模拟。

## 2. 架构与文件职责

### 2.1 `manifest.json`
- MV3 扩展配置。
- 权限：`storage`、`declarativeNetRequest`。
- `host_permissions: <all_urls>`。
- 全域注入 `content.js`（`all_frames: true`，`match_about_blank: true`）。
- 后台服务：`background.js`。

### 2.2 `background.js`
- 点击扩展图标时打开扩展页 `index.html`（`openMainPage`）。
- 安装时下发一条动态规则（id=9001）移除响应头：
  - `x-frame-options`
  - `frame-options`
  - `content-security-policy`
  - `content-security-policy-report-only`
- 目标：尽可能让 AI 站点可被 iframe 分屏加载。

### 2.3 `index.html`
- 主容器：`#panes`（每个站点一个 pane + iframe）。
- 底部浮动输入气泡：发送、历史、设置、新聊天、输入框、@/# 选择器、图片附件 chips。
- 右侧设置面板：
  - 站点管理
  - 外观主题
  - 语言
  - 历史显示（Ollama 摘要）
- 历史面板：查看历史项、跳转历史 URL、清空历史。

### 2.4 `styles.css`
- 亮/暗主题变量。
- 分屏布局、可拖拽分隔条、pane 放大模式。
- 输入气泡与面板样式。
- mention dropdown、site chip、attachment chip。
- 响应式（<=900px）移动端布局。

### 2.5 `app.js`
主页面核心编排：
- 配置与状态管理
- 渲染分屏/设置/历史
- 发消息/新聊天广播
- 提及站点（@）与聚焦站点（#）
- 图片附件管理与广播
- 本地历史记录与 URL 回填
- 主题、语言、拖拽排序、分屏拉伸、气泡拖动

### 2.6 `content.js`
注入每个站点的执行器：
- 识别当前站点
- 找输入框并注入文本
- 发送按钮点击或 Enter 退化发送
- 图片附加（file input / drop / paste 三重策略）
- 新聊天触发（选择器/关键词/回首页）
- 选中文本“引用”按钮并回传父页面
- URL 变化上报（用于历史链接更新）

## 3. 已支持站点与扩展机制

## 3.1 内置站点（`BUILTIN_SITES` / `SITES`）
当前内置：
- ChatGPT
- DeepSeek
- Kimi
- Qwen
- Doubao
- Yuanbao
- Grok
- Gemini

默认选中：`chatgpt`、`deepseek`、`kimi`。

## 3.2 自定义站点
- 在设置页输入 `name + url` 可新增。
- 自动生成 `custom-...` id。
- 支持删除、排序、启用/停用。
- 数据持久化到 `chrome.storage.local`。

## 3.3 新增站点“应该怎么实现”
必须同步更新两处：
1. `app.js` 中站点元信息（名称、主页 URL）。
2. `content.js` 中站点匹配与选择器：
   - `matchHosts`
   - `inputSelectors`
   - `sendSelectors`
   - `newChatSelectors`

如果站点无专用配置，会走 `GENERIC_SITE` 的通用选择器兜底。

## 4. 核心功能清单（含实现路径）

## 4.1 多 AI 分屏打开
- 入口：`renderPanes()`。
- 每个站点生成 `.pane` + `iframe`（`createPane`）。
- iframe 初始地址来自站点 URL。
- 支持多站并行显示与动态重渲染。

## 4.2 分屏宽度拖拽
- 分隔条：`.pane-resizer`。
- 逻辑：`initPaneResizers()`。
- 限制最小宽度（220px），拖拽结束后存为 `paneRatios`。

## 4.3 单站放大（Focus Mode）
- 入口按钮：`.pane-focus-btn`。
- 状态：`focusedSiteId`。
- 逻辑：`enterPaneFocus()` / `exitPaneFocus()` / `applyFocusedPaneState()`。
- 快捷键退出：`Ctrl/Cmd + Shift + F`（主页面和内容页都支持联动退出）。
- 放大按钮可拖动，并按站点记住位置：`paneFocusButtonPosBySite`（内存态）。

## 4.4 一次输入，多站发送
- 发送入口：`onSend()`。
- 广播方式：`sendToFrames("CHAT_MESSAGE")`。
- 内容页执行：`sendPrompt()` -> `setInputValue()` -> `clickSend()`。
- 支持 textarea / input / contenteditable。

## 4.5 指定站点发送（@ 提及）
- 输入 `@` 触发站点候选：`refreshMentionDropdown()`。
- 候选源是当前“已启用”站点：`getMentionCandidates()`。
- 选择后形成 chips（`mentionSiteIds`）。
- 发送时若有 mention，只向目标 iframe 发送：`sendToTargetFrames()`。

## 4.6 站点聚焦选择（#）
- 输入 `#` 复用同一候选下拉，但模式为 `focus`。
- 选中后进入/退出该站点放大模式。

## 4.7 新聊天同步触发
- 点击“新聊天”按钮后广播 `NEW_CHAT`。
- 内容页 `newChat()` 执行顺序：
  1. 先按站点 `newChatSelectors` 找可见按钮点击。
  2. 失败则按文本关键词查找（中英文新聊天词）。
  3. 再失败则跳转站点首页（在首页则刷新）。

## 4.8 图片附件（输入框端 + 站点端）
- 主页面支持粘贴/拖入图片：`appendImagesFromFiles()`。
- 展示附件 chips，可单个移除：`renderAttachmentChips()`。
- 自动预广播到目标站点：`broadcastPendingImagesToTargets()` -> `ATTACH_IMAGES`。
- 发送时把图片随消息一起传给内容页。
- 内容页附图策略：
  1. `attachByFileInput`（最优，优先 accept 包含 image）
  2. `attachByDrop`
  3. `attachByPaste`
- 图片通过 data URL 在主页面与内容页间传输。

## 4.9 选中文本引用回填
- 内容页监听选区，非输入区域且有文本时显示“引用/Quote”浮动按钮。
- 点击后向父页面发送 `QUOTE_TEXT`。
- 主页面 `applyQuoteTextToPrompt()` 把文本转成 markdown 引用块（`> ...`）并插回输入框光标位置。

## 4.10 历史记录中心
- 存储键：`oa_history`，最多保留 200 条。
- 写入：`appendHistory()`。
- 展示：`renderHistory()`。
- 历史项包含：
  - `prompt`（展示标题）
  - `ts`
  - `sites`（站点名数组）
  - `urls`（siteId -> 当时 URL）
- 点击历史项可恢复：
  - 选中站点集合
  - 各 iframe 跳转到历史 URL（`applyHistoryItem`）

## 4.11 历史 URL 自动追踪与补丁
- 内容页每 600ms 侦测地址变化并上报 `UPDATE_HISTORY`。
- 主页面更新 `siteUrlState` 并尝试补丁写回最近历史项：`patchHistoryUrl()`。
- 结果：同一条问题能逐步记录各站点真实对话 URL。

## 4.12 新会话自动入历史
- 收到 `UPDATE_HISTORY` 且找不到匹配历史快照时，会新增 `"[新会话]"` 历史项（仅该站点）。
- 便于记录“用户在站点内手动新开会话”的导航轨迹。

## 4.13 历史标题摘要（本地 Ollama，可选）
- 开关：`historySummaryEnabled`。
- 配置：`historySummaryUrl`、`historySummaryModel`。
- 调用：`summarizeHistoryPrompt()` -> `${url}/api/generate`。
- 超时 2.5s，失败自动回退到本地截断预览（`buildHistoryPreview`）。

## 4.14 站点管理（设置面板）
- 站点启用/停用。
- 站点排序（拖拽）。
- 打开站点链接。
- 删除自定义站点。
- 保存后触发分屏重渲染。

## 4.15 外观主题
- 主题模式：`system / light / dark`。
- 存储键：`oa_theme_mode`。
- `system` 模式跟随 `prefers-color-scheme`。

## 4.16 语言国际化
- 语言模式：`auto / zh / en`。
- 文案字典：`I18N`。
- 通过 `data-i18n*` 批量替换文本、placeholder、aria-label、title。

## 4.17 输入气泡可拖动
- `initDraggableBubble("input-bubble")`。
- 仅在气泡边缘区域可拖动，避免误触输入区控件。
- 拖动时做窗口边界限制。

## 5. 页面间消息协议（当前事实）

主页面 -> 内容页：
- `CHAT_MESSAGE`
  - `message` 文本
  - `payload.images` 可选图片数组
- `ATTACH_IMAGES`
  - `payload.images` 预附图
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
  - 触发主页面退出放大模式

## 6. 本地存储模型（`chrome.storage.local`）

键定义见 `STORAGE_KEYS`：
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

## 7. 功能实现约束与现状说明

- 扩展强依赖各站点 DOM 结构；站点改版可能导致某些 selector 失效。
- 通过删除 CSP/XFO 头提升 iframe 可加载率，但不保证所有站点都长期可嵌入。
- 图片上传能力取决于目标站点是否接受模拟 file/drop/paste 事件。
- 历史摘要依赖用户本机 Ollama 服务可用性。

## 8. 后续 AI 修改时建议遵循

1. 新增站点时，`app.js` 与 `content.js` 的站点定义必须同步修改。
2. 任何消息类型新增时，需同时更新主页面发送端、内容页接收端（或反向）。
3. 新增可持久化设置时，先扩展 `STORAGE_KEYS`，再补全 load/save/render/init 流程。
4. 涉及 UI 文案的变更应同步 `I18N.zh` 与 `I18N.en`。
5. 历史结构变更要考虑老数据兼容（对象字段判空已大量使用）。
