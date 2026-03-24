# Side-by-Side AI（Chrome 扩展）

多站点 AI 聊天页的**统一广播提示词**、**多窗口平铺**与**本地会话历史**。Manifest V3。

## 目录结构（按职责）

扩展根目录仅保留 `manifest.json`、说明文档与资源入口；源码按常见扩展习惯分层：

| 目录 | 说明 |
|------|------|
| `background/` | Service Worker：`background.js` + `importScripts` 加载的 `bg-*.js`（窗口/标签/平铺/消息路由）。 |
| `content/` | 注入 AI 网页的主 content scripts（顺序见下表，路径在 `manifest.json` 中写死）。 |
| `embed/` | 独立注入的 content script（`page-switcher-embed.js`，页面内嵌切换器）。 |
| `ui/` | 扩展页面：弹窗、全页控制器、常驻切换条、历史页；各子目录自包含 HTML/CSS/JS。 |
| `assets/` | 多页面共享的样式与脚本（`styles.css`、`quick-focus.js`、`switcher-pip.js`）。 |
| `store-assets/` | 商店/工具栏图标（见 `manifest.json`）。 |

**给后续 coding agent 的约定**

- 单文件尽量 **≤700 行**；逻辑按职责拆文件，不要随意把无关代码合并进同一文件。
- `manifest.json` 里 **content_scripts 顺序**与**background 的 `importScripts` 顺序**敏感；后加载依赖先加载的全局符号。
- 修改站点选择器时，同时检查 `content/content-sites.js` 的 `SITES` / `RESPONSE_SELECTORS` 与 `background/bg-constants.js` 的 `SITE_HOSTS` / `BUILTIN_SITE_URLS` 是否一致。
- 扩展内页面路径一律相对 **扩展根目录**（如 `ui/controller/controller.html`），`chrome.runtime.getURL(...)` 与 `manifest` 的 `web_accessible_resources` 需同步更新。

---

## 入口与配置

| 文件 | 作用 |
|------|------|
| `manifest.json` | MV3：权限、`background/background.js`、`content_scripts`、可网页访问资源。 |

---

## 后台（Service Worker）

`background/background.js` 仅负责 `importScripts` 注册子模块，以及安装钩子、窗口/标签清理、`chrome.runtime.onMessage` 路由。

| 文件 | 作用 |
|------|------|
| `background/bg-constants.js` | 扩展内页面路径、会话存储键、`targetsCache`、各站默认 URL / 展示名 / hostname 列表。 |
| `background/bg-session.js` | `loadTargets` / `saveTargets`、`getWindowPrefs`。 |
| `background/bg-tabs.js` | 按 hostname 查找已打开 AI 标签、`syncTargetsFromTabsForSites`、`ensureSeparateWindowsForTargets`。 |
| `background/bg-switcher.js` | 打开控制器页、打开常驻「切换」小窗、`alwaysOnTop` 补偿、聚焦 AI 窗口链与切换窗。 |
| `background/bg-tiling.js` | 工作区矩形计算、`ensureWindowForSite`、`openOrReuseWindows`、`applyTile`、`broadcastToExtensionPages`。 |
| `background/bg-actions.js` | `focusTarget`、`appendHistoryAfterSend`、`sendPromptToTargets`、`collectLastFromTargets`、`newChatOnTargets`、`restoreHistoryUrlsToTargets`、`getState`。 |

**消息类型（节选）**：自 content 经 background 转发 `OA_SEND_PROGRESS`、`OA_UPDATE_HISTORY`、`OA_QUOTE_TEXT`；自 UI 发往 background：`OA_BG_*`（详见 `background/background.js` 内分支）。

---

## 内容脚本（注入 AI 网页）

在 `manifest.json` 中按 **下列顺序** 注入，共享同一隔离世界的全局作用域（非 ES module）。

| 顺序 | 文件 | 作用 |
|------|------|------|
| 1 | `content/content-sites.js` | 各站 URL、输入/发送/新对话选择器、`RESPONSE_SELECTORS`、`currentSite()`、`GENERIC_SITE`。 |
| 2 | `content/content-dom.js` | Shadow DOM 穿透查询、`isVisible`、`sleep`、`clickFirstVisibleSelector`。 |
| 3 | `content/content-response.js` | 抽取助手回复、`collectReplyNodes`。 |
| 4 | `content/content-input.js` | 填充输入框、`clickSend` / `clickSendWithRetry`。 |
| 5 | `content/content-attachments.js` | 附件与 Gemini 主世界注入。 |
| 6 | `content/content-send-runtime.js` | 发送进度、快照、`sendPrompt`、`newChat`。 |
| 7 | `content/content-quote-ui.js` | 划词引用、`OA_RUNTIME_*`、URL 上报。 |

**仅顶层 AI 页**挂载划词引用与 URL 轮询；`OA_RUNTIME_*` 在 `window === window.top` 时处理。

---

## 嵌入与其它脚本

| 文件 | 作用 |
|------|------|
| `embed/page-switcher-embed.js` | 第二段 content script（`all_frames: false`）：吸边按钮，iframe 打开 `ui/switcher/switcher.html`。 |

---

## UI 页面（`ui/`）

| 路径 | 作用 |
|------|------|
| `ui/popup/popup.html` + `popup.js` | 工具栏弹窗：快速聚焦、打开切换器/控制器。 |
| `ui/controller/controller.html` + `controller.js` + `controller.css` | 全页多窗口控制器（`OA_BG_*`）。 |
| `ui/switcher/switcher.html` + `switcher.js` | 常驻输入条 / 切换器（引用 `assets/` 下脚本与样式）。 |
| `ui/history/history.html` + `history.js` | 本地历史列表（`oa_history`）。 |

---

## 共享资源（`assets/`）

| 文件 | 作用 |
|------|------|
| `assets/styles.css` | 多页面共用样式（需在 `manifest.json` 的 `web_accessible_resources` 中声明）。 |
| `assets/quick-focus.js` | 快速聚焦已绑定窗口等逻辑。 |
| `assets/switcher-pip.js` | 画中画 / 独立小窗打开切换器（内部 `getURL` 指向 `ui/switcher/switcher.html`）。 |

---

## 资源

- 图标：`store-assets/`（见 `manifest.json` 的 `icons` / `action`）。

---

## 开发提示

- 加载未打包扩展：Chrome → 扩展程序 → 开发者模式 →「加载已解压的扩展程序」→ 选择本目录（`Side-by-Side AI`）。
- 改 `manifest.json`、service worker 或 content script 列表后需 **重新加载扩展**。
- `feature.md` 为旧版说明，可能与当前路径不一致，以本 README 与代码为准。
