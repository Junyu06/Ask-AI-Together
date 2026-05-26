# Side-by-Side AI（Chrome 扩展）

多站点 AI 聊天页的**统一广播提示词**、**多窗口平铺**与**本地会话历史**。Manifest V3。

**已无**独立 `switcher.html` 与画中画；广播与站点配置在 **扩展选项页**。在支持的 AI 网页上，**右侧吸边竖条「AI」**可打开 **iframe 侧栏**（同选项页 `?embed=1`）；也可在完整选项页里关闭吸边按钮。

## 目录结构（按职责）

扩展根目录仅保留 `manifest.json`、说明文档与资源入口；源码按常见扩展习惯分层：

| 目录 | 说明 |
|------|------|
| `background/` | Service Worker：`background.js` + `importScripts` 加载的 `bg-*.js`（窗口/标签/平铺/消息路由）。 |
| `content/` | 注入 AI 网页的主 content scripts（顺序见下表，路径在 `manifest.json` 中写死）。 |
| `shared/` | Provider catalog、runtime contract、text formatting、history service、quote helper 等共享模块。 |
| `legacy/` | 默认 iframe split-pane 工作区：`legacy/index.html`、`legacy/app.js`、`legacy/content.js`、`legacy/styles.css`。 |
| `embed/` | `page-embed-options.js`：仅在主框架、白名单 AI 域名上注入吸边按钮与侧栏 iframe（需 `web_accessible_resources`）。 |
| `ui/` | 扩展选项页 `ui/options/`（广播、历史、站点与平铺设置）。 |
| `assets/` | 多页面共享的样式与脚本（`styles.css`、`quick-focus.js`、`options-settings.js` 等）。 |
| `store-assets/` | 商店/工具栏图标（见 `manifest.json`）。 |

**给后续 coding agent 的约定**

- 单文件尽量 **≤700 行**；逻辑按职责拆文件，不要随意把无关代码合并进同一文件。
- `manifest.json` 里 **content_scripts 顺序**与**background 的 `importScripts` 顺序**敏感；后加载依赖先加载的全局符号。
- 修改站点选择器时，优先改 `shared/provider-catalog.js`；`content/content-sites.js` 与 `background/bg-constants.js` 都从 catalog 派生或兼容它，不要重新复制一份 provider truth。
- 扩展内页面路径一律相对 **扩展根目录**（如 `ui/options/options.html`）。iframe 侧栏需将选项页与依赖的 `assets/`、`ui/controller/controller.css` 列入 `web_accessible_resources`。
- Compatibility Mode 明确不支持附件；Legacy attachment path 是 mode-owned 行为。Gemini 上传优先走 main-world attachment hook，再回退 isolated-world file input / drop / paste。

---

## 入口与配置

| 文件 | 作用 |
|------|------|
| `manifest.json` | MV3：权限、`background/background.js`、两段 `content_scripts`（全站注入 + AI 站注入 embed）、`options_ui`、`web_accessible_resources`（供网页内 iframe 加载选项页）。`action` **不设 `default_popup`**：在 AI 页点击工具栏图标**优先**打开侧栏（`OA_PAGE_EMBED_OPEN_SWITCHER`），否则按勾选**平铺**。 |

---

## 后台（Service Worker）

`background/background.js` 仅负责 `importScripts` 注册子模块，以及安装钩子、窗口/标签清理、`chrome.runtime.onMessage` 路由。

| 文件 | 作用 |
|------|------|
| `background/bg-constants.js` | 会话存储键、`targetsCache`、各站默认 URL / 展示名 / hostname 列表。 |
| `background/bg-session.js` | `loadTargets` / `saveTargets`、`getWindowPrefs`。 |
| `background/bg-tabs.js` | 按 hostname 查找已打开 AI 标签、`syncTargetsFromTabsForSites`、`ensureSeparateWindowsForTargets`。 |
| `background/bg-switcher.js` | `chrome.action.onClicked`、`openSwitcherFromToolbarAction`（先尝试页内嵌侧栏消息，再 `openSelectedAisTiled`）、`loadOrderedSelectedSitesFromStorage`、`focusOpenedTargetsThenSwitcher`。 |
| `background/bg-tiling.js` | 工作区矩形计算、`ensureWindowForSite`、`openOrReuseWindows`、`applyTile`、`broadcastToExtensionPages`。 |
| `background/bg-actions.js` | `focusTarget`、`appendHistoryAfterSend`、`sendPromptToTargets`、`collectLastFromTargets`、`newChatOnTargets`、`restoreHistoryUrlsToTargets`、`getState`。 |

**消息类型（节选）**：自 content 经 background 转发 `OA_SEND_PROGRESS`、`OA_UPDATE_HISTORY`、`OA_QUOTE_TEXT`；自 UI（选项页）发往 background：`OA_BG_*`（详见 `background/background.js` 内分支）。

---

## 内容脚本（注入 AI 网页）

在 `manifest.json` 中按 **下列顺序** 注入，共享同一隔离世界的全局作用域（非 ES module）。

| 顺序 | 文件 | 作用 |
|------|------|------|
| 1 | `shared/runtime-contract.js` | Runtime message envelope、typed outcomes、capabilities。 |
| 2 | `shared/provider-catalog.js` | 内置 provider、URL、selectors、capability metadata。 |
| 3 | `shared/quote-helper.js` | Legacy / Compatibility 共用 quote button helper。 |
| 4 | `content/content-sites.js` | 从 catalog 暴露 legacy-compatible `SITES` / `RESPONSE_SELECTORS` / `currentSite()`。 |
| 5 | `content/content-dom.js` | Shadow DOM 穿透查询、`isVisible`、`sleep`、`clickFirstVisibleSelector`。 |
| 6 | `content/content-response.js` | 抽取助手回复、`collectReplyNodes`。 |
| 7 | `content/content-input.js` | 填充输入框、`clickSend` / `clickSendWithRetry`。 |
| 8 | `content/content-attachments.js` | Legacy-only 附件路径；Gemini 优先 main-world hook。 |
| 9 | `content/content-send-runtime.js` | 发送进度、快照、`sendPrompt`、`newChat`。 |
| 10 | `content/content-shared-runtime.js` | `OA_RUNTIME_*` shared transport wrapper。 |
| 11 | `legacy/content.js` | Legacy iframe `postMessage` adapter。 |
| 12 | `content/content-quote-ui.js` | 划词引用、URL 上报。 |

**仅顶层 AI 页**挂载划词引用与 URL 轮询；Legacy iframe messaging 由 `legacy/content.js` 适配，Compatibility/top-level runtime messaging 由 shared runtime 处理。

---

## 网页内吸边侧栏（`embed/`）

| 文件 | 作用 |
|------|------|
| `embed/page-embed-options.js` | 主框架、`all_frames: false`：在匹配域名的 AI 页右侧显示「AI」竖条；点击展开 iframe，加载 `ui/options/options.html?embed=1`；处理 `OA_PAGE_EMBED_OPEN_SWITCHER`（工具栏联动）。 |

---

## UI（扩展选项页）

| 路径 | 作用 |
|------|------|
| `ui/options/options.html` + `options.js` + `options.css` | 广播提示词、发送历史、快速聚焦、站点勾选与平铺操作（Chrome 扩展详情 →「扩展程序选项」或右键图标 →「选项」）。 |
| `ui/controller/controller.css` | 选项页内站点列表与工具条的共用样式。 |

---

## 共享资源（`assets/`）

| 文件 | 作用 |
|------|------|
| `assets/styles.css` | 选项页输入条等共用样式。 |
| `assets/quick-focus.js` | `loadOrderedSelectedSitesPayload`、选项页「快速聚焦」按钮渲染。 |
| `assets/options-settings.js` | 选项页「窗口与站点」面板（勾选、布局、`OA_BG_OPEN_WINDOWS` / `OA_BG_TILE` 等）。 |

---

## 资源

- 图标：`store-assets/`（见 `manifest.json` 的 `icons` / `action`）。

---

## 开发提示

- 加载未打包扩展：Chrome → 扩展程序 → 开发者模式 →「加载已解压的扩展程序」→ 选择本目录（`Side-by-Side AI`）。
- 改 `manifest.json`、service worker 或 content script 列表后需 **重新加载扩展**。
- 打包：在仓库根目录运行 `scripts/package-extension.sh`，输出 `dist/side-by-side-ai-v<manifest version>.zip`。
- 关键回归检查：运行相关 `scripts/validate-*.js` 后，reload unpacked extension，并在 Chrome 中做同一用户路径 live smoke。
