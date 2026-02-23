const STORAGE_KEYS = {
  selectedSites: "oa_selected_sites",
  history: "oa_history",
  customSites: "oa_custom_sites",
  siteOrder: "oa_site_order",
  themeMode: "oa_theme_mode",
  siteUrlState: "oa_site_url_state",
  localeMode: "oa_locale_mode",
  historySummaryEnabled: "oa_history_summary_enabled",
  historySummaryUrl: "oa_history_summary_url",
  historySummaryModel: "oa_history_summary_model",
  panesPerRow: "oa_panes_per_row"
};

const BUILTIN_SITES = [
  { id: "chatgpt", name: "ChatGPT", url: "https://chatgpt.com/" },
  { id: "deepseek", name: "DeepSeek", url: "https://chat.deepseek.com/" },
  { id: "kimi", name: "Kimi", url: "https://www.kimi.com/" },
  { id: "qwen", name: "Qwen", url: "https://chat.qwen.ai/" },
  { id: "doubao", name: "Doubao", url: "https://www.doubao.com/" },
  { id: "yuanbao", name: "Yuanbao", url: "https://yuanbao.tencent.com/" },
  { id: "grok", name: "Grok", url: "https://grok.com/" },
  { id: "claude", name: "Claude", url: "https://claude.ai/" },
  { id: "gemini", name: "Gemini", url: "https://gemini.google.com/" }
];

const defaultSiteIds = ["chatgpt", "deepseek", "kimi"];

let selectedSiteIds = [];
let siteUrlState = {};
let customSites = [];
let siteOrder = [];
let paneRatios = [];
let rowRatios = [];
let themeMode = "system";
let pendingHistoryBySite = {};
let isComposing = false;
let mentionState = null;
let mentionSiteIds = [];
let localeMode = "auto";
let pendingAttachments = [];
let focusedSiteId = null;
let paneFocusButtonPosBySite = {};
let historySummaryEnabled = false;
let historySummaryUrl = "http://127.0.0.1:11434";
let historySummaryModel = "qwen2.5:7b-instruct";
let panesPerRow = 0;
const HISTORY_URL_PATCH_WINDOW_MS = 25000;
const paneCacheBySite = new Map();

const panesEl = document.getElementById("panes");
const promptEl = document.getElementById("prompt");
const historyListEl = document.getElementById("history-list");
const siteCheckboxesEl = document.getElementById("site-checkboxes");
const panelBackdropEl = document.getElementById("panel-backdrop");
const paneFocusBackdropEl = document.getElementById("pane-focus-backdrop");
const rightPanelEl = document.getElementById("right-panel");
const historyPanelEl = document.getElementById("history-panel");
const panelTitleEl = document.getElementById("panel-title");
const settingsSidebarEl = document.querySelector(".settings-sidebar");
const mentionDropdownEl = document.getElementById("mention-dropdown");
const mentionChipsEl = document.getElementById("mention-chips");
const attachmentChipsEl = document.getElementById("attachment-chips");
const historySummaryEnabledEl = document.getElementById("history-summary-enabled");
const historySummaryUrlEl = document.getElementById("history-summary-url");
const historySummaryModelEl = document.getElementById("history-summary-model");
const historySummaryConfigEl = document.getElementById("history-summary-config");
const testHistorySummaryBtnEl = document.getElementById("test-history-summary");
const historySummaryTestResultEl = document.getElementById("history-summary-test-result");
const usageShortcutExitKeyEl = document.getElementById("usage-shortcut-exit-key");

const mediaDark = window.matchMedia("(prefers-color-scheme: dark)");
const I18N = {
  zh: {
    input_bubble_aria: "输入与操作",
    toolbar_aria: "工具栏",
    settings_title: "设置",
    history_title: "历史",
    new_chat: "新聊天",
    selected_sites: "已选择站点",
    prompt_label: "输入问题",
    prompt_placeholder_default: "输入问题，@ 单独 AI，# 放大 AI；回车发送（Shift+Enter 换行）",
    prompt_placeholder_focus: "输入问题，{shortcut} 退出放大（Shift+Enter 换行）",
    send: "发送",
    close: "关闭",
    settings_categories: "设置类别",
    sites_tab: "站点",
    layout_tab: "布局",
    appearance_tab: "外观",
    usage_tab: "使用说明",
    sites_subtitle: "站点选择与排序",
    usage_subtitle: "快捷键与输入规则",
    usage_login_first: "先去各 AI 站点登录账号，再使用本 extension。",
    usage_shortcut_at: "@ 选择单独 AI 作为发送目标",
    usage_shortcut_hash: "# 选择并放大单个 AI",
    usage_shortcut_exit: "退出放大",
    usage_shortcut_send: "Enter 发送消息",
    usage_shortcut_newline: "Shift + Enter 换行",
    usage_shortcut_mention_nav: "↑ / ↓ 切换 @/# 候选项，Enter 选中",
    usage_shortcut_mention_pick: "数字 1-9 快速选中 @/# 候选项",
    usage_issues: "问题反馈",
    save: "保存",
    add_site: "添加站点",
    site_name: "站点名称",
    site_url: "站点地址",
    site_name_placeholder: "站点名称，例如 Perplexity…",
    site_url_placeholder: "站点地址，例如 https://www.perplexity.ai/…",
    cancel: "取消",
    add: "添加",
    theme_mode: "主题模式",
    language_mode: "语言",
    history_settings_tab: "历史显示",
    history_settings_subtitle: "历史标题显示策略",
    history_summary_enable: "使用本地 Ollama 生成历史摘要",
    ollama_url: "Ollama URL",
    ollama_model: "Ollama 模型",
    test_connection: "测试连接",
    testing: "测试中…",
    test_connection_ok: "连接成功：{reply}",
    test_connection_failed: "连接失败：{reason}",
    test_connection_need_input: "请先填写 Ollama URL 和模型",
    test_connection_http: "HTTP {status}",
    test_connection_empty: "接口已连通，但没有返回内容",
    ollama_url_placeholder: "例如 http://127.0.0.1:11434…",
    ollama_model_placeholder: "例如 qwen2.5:7b-instruct…",
    ai_tag: "AI",
    language_auto: "跟随浏览器",
    language_zh: "中文",
    language_en: "English",
    theme_system: "跟随系统",
    theme_light: "白色",
    theme_dark: "黑色",
    clear: "清空",
    history_subtitle: "点击历史中的站点链接可回到对应页面",
    delete: "删除",
    drag_sort: "拖拽排序",
    open_site: "打开站点",
    remove: "移除",
    image_paste_only: "支持文件粘贴/拖入",
    image_attachment: "附件",
    image_placeholder_history: "[附件]",
    new_chat_history: "[新会话]",
    open_chat_tab: "新标签打开",
    focus_pane: "放大此站点",
    unfocus_pane: "退出放大",
    panes_per_row: "每排站点数",
    panes_per_row_all: "全部并排",
    panes_per_row_1: "1 个",
    panes_per_row_2: "2 个",
    panes_per_row_3: "3 个",
    panes_per_row_4: "4 个",
    skip_to_input: "跳到输入框",
    custom_site_permission_required: "需要授权该站点后，才能自动输入和发送。请在弹窗中允许站点权限。",
    custom_site_permission_denied: "以下站点未授权，已取消启用：{sites}"
  },
  en: {
    input_bubble_aria: "Input and actions",
    toolbar_aria: "Toolbar",
    settings_title: "Settings",
    history_title: "History",
    new_chat: "New Chat",
    selected_sites: "Selected Sites",
    prompt_label: "Prompt",
    prompt_placeholder_default: "Message… @ targets one AI, # expands one AI. Enter sends (Shift+Enter newline).",
    prompt_placeholder_focus: "Message… Press {shortcut} to exit expanded view (Shift+Enter newline).",
    send: "Send",
    close: "Close",
    settings_categories: "Settings categories",
    sites_tab: "Sites",
    layout_tab: "Layout",
    appearance_tab: "Appearance",
    usage_tab: "Guide",
    sites_subtitle: "Site selection and sorting",
    usage_subtitle: "Shortcuts and input rules",
    usage_login_first: "Sign in on each AI site first, then use this extension.",
    usage_shortcut_at: "@ targets one AI for sending",
    usage_shortcut_hash: "# picks and expands one AI pane",
    usage_shortcut_exit: "Exit expanded view",
    usage_shortcut_send: "Enter sends message",
    usage_shortcut_newline: "Shift + Enter inserts new line",
    usage_shortcut_mention_nav: "Up/Down switch @/# candidates, Enter confirms",
    usage_shortcut_mention_pick: "Number 1-9 quickly picks @/# candidates",
    usage_issues: "Issues",
    save: "Save",
    add_site: "Add Site",
    site_name: "Site Name",
    site_url: "Site URL",
    site_name_placeholder: "Site name, e.g. Perplexity…",
    site_url_placeholder: "Site URL, e.g. https://www.perplexity.ai/…",
    cancel: "Cancel",
    add: "Add",
    theme_mode: "Theme Mode",
    language_mode: "Language",
    history_settings_tab: "History Display",
    history_settings_subtitle: "History title strategy",
    history_summary_enable: "Use local Ollama to summarize history title",
    ollama_url: "Ollama URL",
    ollama_model: "Ollama model",
    test_connection: "Test connection",
    testing: "Testing…",
    test_connection_ok: "Connection OK: {reply}",
    test_connection_failed: "Connection failed: {reason}",
    test_connection_need_input: "Please enter Ollama URL and model first",
    test_connection_http: "HTTP {status}",
    test_connection_empty: "Connected but response is empty",
    ollama_url_placeholder: "e.g. http://127.0.0.1:11434…",
    ollama_model_placeholder: "e.g. qwen2.5:7b-instruct…",
    ai_tag: "AI",
    language_auto: "Follow Browser",
    language_zh: "Chinese",
    language_en: "English",
    theme_system: "System",
    theme_light: "Light",
    theme_dark: "Dark",
    clear: "Clear",
    history_subtitle: "Click site links in history to return to the corresponding page",
    delete: "Delete",
    drag_sort: "Drag to sort",
    open_site: "Open site",
    remove: "Remove",
    image_paste_only: "Files can be pasted/dropped",
    image_attachment: "Attachment",
    image_placeholder_history: "[Attachment]",
    new_chat_history: "[New chat]",
    open_chat_tab: "Open in new tab",
    focus_pane: "Expand this site",
    unfocus_pane: "Exit expanded view",
    panes_per_row: "Panes per row",
    panes_per_row_all: "All in one row",
    panes_per_row_1: "1",
    panes_per_row_2: "2",
    panes_per_row_3: "3",
    panes_per_row_4: "4",
    skip_to_input: "Skip to input",
    custom_site_permission_required: "Please allow this site permission to enable auto input/send on custom sites.",
    custom_site_permission_denied: "Permission was not granted for: {sites}. They were not enabled."
  }
};
let locale = "en";

function t(key) {
  return I18N[locale]?.[key] || I18N.en[key] || key;
}

function formatText(template, vars = {}) {
  return String(template).replace(/\{(\w+)\}/g, (all, key) => (key in vars ? String(vars[key]) : all));
}

function isApplePlatform() {
  const platform = String(navigator.userAgentData?.platform || navigator.platform || "");
  if (/mac|iphone|ipad|ipod/i.test(platform)) return true;
  const ua = String(navigator.userAgent || "");
  return /macintosh|iphone|ipad|ipod/i.test(ua);
}

function getFocusExitShortcutLabel() {
  return isApplePlatform() ? "Shift + Cmd + F" : "Shift + Ctrl + F";
}

function getFocusExitShortcutHtml() {
  if (isApplePlatform()) return "<kbd>Shift</kbd> + <kbd>Cmd</kbd> + <kbd>F</kbd>";
  return "<kbd>Shift</kbd> + <kbd>Ctrl</kbd> + <kbd>F</kbd>";
}

function updatePromptPlaceholder() {
  const key = focusedSiteId ? "prompt_placeholder_focus" : "prompt_placeholder_default";
  promptEl.setAttribute("placeholder", formatText(t(key), { shortcut: getFocusExitShortcutLabel() }));
}

function renderUsageGuide() {
  if (usageShortcutExitKeyEl) {
    usageShortcutExitKeyEl.innerHTML = getFocusExitShortcutHtml();
  }
}

function setHistorySummaryTestResult(message = "", state = "") {
  if (!historySummaryTestResultEl) return;
  historySummaryTestResultEl.textContent = message;
  historySummaryTestResultEl.classList.toggle("hidden", !message);
  historySummaryTestResultEl.classList.remove("is-success", "is-error", "is-loading");
  if (state) historySummaryTestResultEl.classList.add(`is-${state}`);
}

function detectLocale() {
  if (localeMode === "zh" || localeMode === "en") return localeMode;
  const lang = String(navigator.language || "").toLowerCase();
  return lang.startsWith("zh") ? "zh" : "en";
}

function applyI18n() {
  locale = detectLocale();
  document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (!key) return;
    el.textContent = t(key);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (!key) return;
    el.setAttribute("placeholder", t(key));
  });
  document.querySelectorAll("[data-i18n-aria-label]").forEach((el) => {
    const key = el.getAttribute("data-i18n-aria-label");
    if (!key) return;
    el.setAttribute("aria-label", t(key));
  });
  document.querySelectorAll("[data-i18n-title]").forEach((el) => {
    const key = el.getAttribute("data-i18n-title");
    if (!key) return;
    el.setAttribute("title", t(key));
  });
  updatePromptPlaceholder();
  renderUsageGuide();

  const localeRadio = document.querySelector(`input[name="locale-mode"][value="${localeMode}"]`);
  if (localeRadio) localeRadio.checked = true;
}

async function loadLocaleMode() {
  const data = await chrome.storage.local.get([STORAGE_KEYS.localeMode]);
  const saved = data[STORAGE_KEYS.localeMode];
  localeMode = ["auto", "zh", "en"].includes(saved) ? saved : "auto";
}

async function setLocaleMode(mode) {
  localeMode = mode;
  await chrome.storage.local.set({ [STORAGE_KEYS.localeMode]: mode });
  applyI18n();
  renderSiteSettings();
  renderMentionChips();
  renderAttachmentChips();
  renderHistorySummarySettings();
  applyFocusedPaneState();
  await renderHistory();
  panelTitleEl.textContent = !rightPanelEl.classList.contains("hidden") ? t("settings_title") : t("history_title");
}

async function loadHistorySummaryConfig() {
  const data = await chrome.storage.local.get([
    STORAGE_KEYS.historySummaryEnabled,
    STORAGE_KEYS.historySummaryUrl,
    STORAGE_KEYS.historySummaryModel
  ]);
  historySummaryEnabled = !!data[STORAGE_KEYS.historySummaryEnabled];
  const rawUrl = String(data[STORAGE_KEYS.historySummaryUrl] || "").trim();
  const rawModel = String(data[STORAGE_KEYS.historySummaryModel] || "").trim();
  if (rawUrl) historySummaryUrl = rawUrl;
  if (rawModel) historySummaryModel = rawModel;
}

async function loadPanesPerRow() {
  const data = await chrome.storage.local.get([STORAGE_KEYS.panesPerRow]);
  const v = Number(data[STORAGE_KEYS.panesPerRow]);
  panesPerRow = [0, 1, 2, 3, 4].includes(v) ? v : 0;
}

async function setPanesPerRow(n) {
  panesPerRow = n;
  await chrome.storage.local.set({ [STORAGE_KEYS.panesPerRow]: n });
  renderPanes();
}

function renderHistorySummarySettings() {
  if (historySummaryEnabledEl) historySummaryEnabledEl.checked = historySummaryEnabled;
  if (historySummaryUrlEl) historySummaryUrlEl.value = historySummaryUrl;
  if (historySummaryModelEl) historySummaryModelEl.value = historySummaryModel;
  if (historySummaryConfigEl) historySummaryConfigEl.classList.toggle("hidden", !historySummaryEnabled);
  if (!historySummaryEnabled) setHistorySummaryTestResult("");
}

async function saveHistorySummaryConfig() {
  historySummaryEnabled = !!historySummaryEnabledEl?.checked;
  historySummaryUrl = String(historySummaryUrlEl?.value || "").trim() || "http://127.0.0.1:11434";
  historySummaryModel = String(historySummaryModelEl?.value || "").trim() || "qwen2.5:7b-instruct";
  await chrome.storage.local.set({
    [STORAGE_KEYS.historySummaryEnabled]: historySummaryEnabled,
    [STORAGE_KEYS.historySummaryUrl]: historySummaryUrl,
    [STORAGE_KEYS.historySummaryModel]: historySummaryModel
  });
  renderHistorySummarySettings();
}

async function testHistorySummaryConfig() {
  const rawUrl = String(historySummaryUrlEl?.value || "").trim();
  const rawModel = String(historySummaryModelEl?.value || "").trim();
  if (!rawUrl || !rawModel) {
    setHistorySummaryTestResult(t("test_connection_need_input"), "error");
    return;
  }

  const endpoint = `${rawUrl.replace(/\/+$/, "")}/api/generate`;
  const testPrompt = "Reply with one short word only.";

  setHistorySummaryTestResult(t("testing"), "loading");
  if (testHistorySummaryBtnEl) testHistorySummaryBtnEl.disabled = true;

  try {
    const timeout = new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error("timeout")), 10000);
    });
    const request = fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: rawModel,
        prompt: testPrompt,
        stream: false,
        options: { temperature: 0, num_predict: 24 }
      })
    });
    const response = await Promise.race([request, timeout]);
    if (!response.ok) {
      setHistorySummaryTestResult(formatText(t("test_connection_failed"), { reason: formatText(t("test_connection_http"), { status: response.status }) }), "error");
      return;
    }
    const data = await response.json();
    const reply = String(data?.response || "").trim();
    if (!reply) {
      setHistorySummaryTestResult(t("test_connection_empty"), "error");
      return;
    }
    const preview = reply.replaceAll(/\s+/g, " ").slice(0, 80);
    setHistorySummaryTestResult(formatText(t("test_connection_ok"), { reply: preview }), "success");
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown error";
    setHistorySummaryTestResult(formatText(t("test_connection_failed"), { reason }), "error");
  } finally {
    if (testHistorySummaryBtnEl) testHistorySummaryBtnEl.disabled = false;
  }
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function getSiteById(id) {
  return allSites().find((site) => site.id === id);
}

function allSites() {
  return [...BUILTIN_SITES, ...customSites];
}

function orderedSites() {
  const map = new Map(allSites().map((site) => [site.id, site]));
  const ordered = [];
  siteOrder.forEach((id) => {
    const site = map.get(id);
    if (site) ordered.push(site);
    map.delete(id);
  });
  map.forEach((site) => ordered.push(site));
  return ordered;
}

function getFavicon(url) {
  try {
    const host = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
  } catch (_error) {
    return "";
  }
}

function renderPanes() {
  const selectedSet = new Set(selectedSiteIds);
  const sites = orderedSites().filter((site) => selectedSet.has(site.id));

  panesEl.classList.remove("panes-per-row-0", "panes-per-row-1", "panes-per-row-2", "panes-per-row-3", "panes-per-row-4");
  panesEl.classList.add(`panes-per-row-${panesPerRow}`);

  if (!sites.length) {
    exitPaneFocus();
    panesEl.innerHTML = "";
    return;
  }

  const N = panesPerRow <= 0 ? 0 : Math.min(panesPerRow, 4);
  if (N === 0 && paneRatios.length !== sites.length) {
    paneRatios = Array.from({ length: sites.length }, () => 1 / sites.length);
  }
  if (N > 0) {
    const rows = Math.ceil(sites.length / N);
    if (rowRatios.length !== rows) {
      rowRatios = Array.from({ length: rows }, () => 1 / rows);
    }
  } else {
    rowRatios = [];
  }

  const existingPanes = Array.from(panesEl.querySelectorAll(".pane"));
  existingPanes.forEach((pane) => {
    const siteId = pane.dataset.siteId;
    if (siteId) paneCacheBySite.set(siteId, pane);
  });

  // Keep panes attached to the live DOM tree to avoid iframe refreshes.
  Array.from(panesEl.querySelectorAll(".pane-resizer, .pane-row-resizer")).forEach((el) => el.remove());
  const rootRows = Array.from(panesEl.children).filter((el) => el.classList?.contains("pane-row"));
  rootRows.forEach((row) => {
    const rowPanes = Array.from(row.children).filter((el) => el.classList?.contains("pane"));
    rowPanes.forEach((pane) => panesEl.appendChild(pane));
    row.remove();
  });
  const targetSiteIds = new Set(sites.map((site) => site.id));
  Array.from(panesEl.querySelectorAll(":scope > .pane")).forEach((pane) => {
    if (!targetSiteIds.has(pane.dataset.siteId || "")) pane.remove();
  });

  if (N === 0) {
    sites.forEach((site, index) => {
      let pane = paneCacheBySite.get(site.id);
      if (!pane) {
        pane = createPane(site);
        paneCacheBySite.set(site.id, pane);
      }
      pane.dataset.index = String(index);
      pane.style.flex = "0 0 auto";
      pane.style.width = `${paneRatios[index] * 100}%`;
      panesEl.appendChild(pane);
      if (index < sites.length - 1) {
        const resizer = document.createElement("div");
        resizer.className = "pane-resizer";
        resizer.dataset.index = String(index);
        panesEl.appendChild(resizer);
      }
    });
  } else {
    const rows = Math.ceil(sites.length / N);
    for (let r = 0; r < sites.length; r += N) {
      const rowSites = sites.slice(r, r + N);
      const rowEl = document.createElement("div");
      rowEl.className = "pane-row";
      const rowIndex = Math.floor(r / N);
      const rowRatio = Number(rowRatios[rowIndex]) || 0;
      rowEl.style.flex = "0 0 auto";
      rowEl.style.height = `${((rowRatio > 0 ? rowRatio : 1 / rows) * 100).toFixed(6)}%`;
      panesEl.appendChild(rowEl);
      rowSites.forEach((site, i) => {
        const index = r + i;
        let pane = paneCacheBySite.get(site.id);
        if (!pane) {
          pane = createPane(site);
          paneCacheBySite.set(site.id, pane);
        }
        pane.dataset.index = String(index);
        pane.style.flex = "0 0 auto";
        pane.style.width = `${(100 / rowSites.length).toFixed(6)}%`;
        rowEl.appendChild(pane);
        if (i < rowSites.length - 1) {
          const resizer = document.createElement("div");
          resizer.className = "pane-resizer";
          resizer.dataset.index = String(index);
          rowEl.appendChild(resizer);
        }
      });
      if (r + N < sites.length) {
        const rowResizer = document.createElement("div");
        rowResizer.className = "pane-row-resizer";
        rowResizer.dataset.rowIndex = String(rowIndex);
        panesEl.appendChild(rowResizer);
      }
    }
  }

  if (focusedSiteId && !sites.some((site) => site.id === focusedSiteId)) {
    focusedSiteId = null;
  }
  applyFocusedPaneState();
  initPaneResizers();
}

function createPane(site) {
  const pane = document.createElement("div");
  pane.className = "pane is-loading";
  pane.dataset.siteId = site.id;
  pane.innerHTML = `
    <div class="pane-toolbar">
      <button type="button" class="pane-open-btn" data-site-id="${escapeHtml(site.id)}" aria-label="${escapeHtml(t("open_chat_tab"))}" title="${escapeHtml(t("open_chat_tab"))}">
        <svg class="icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.1" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M14 4h6v6"/><path d="M10 14 20 4"/><path d="M20 13v7H4V4h7"/>
        </svg>
      </button>
      <button type="button" class="pane-focus-btn" data-site-id="${escapeHtml(site.id)}" aria-label="${escapeHtml(t("focus_pane"))}" title="${escapeHtml(t("focus_pane"))}">
        <svg class="icon pane-focus-expand" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.1" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5"/>
        </svg>
        <svg class="icon pane-focus-collapse hidden" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.1" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M9 9H4V4M15 9h5V4M9 15H4v5M15 15h5v5"/>
        </svg>
      </button>
    </div>
    <iframe name="${site.name}" data-site-id="${site.id}" src="${site.url}" allow="clipboard-read; clipboard-write"></iframe>
  `;
  const frame = pane.querySelector("iframe");
  if (frame) {
    frame.addEventListener("load", () => {
      pane.classList.remove("is-loading");
    });
    // Avoid a stuck loading mask when a site blocks or delays load events.
    window.setTimeout(() => {
      pane.classList.remove("is-loading");
    }, 12000);
  }
  const toolbar = pane.querySelector(".pane-toolbar");
  const savedPos = paneFocusButtonPosBySite[site.id];
  if (toolbar && savedPos && Number.isFinite(savedPos.left) && Number.isFinite(savedPos.top)) {
    toolbar.style.right = "auto";
    toolbar.style.left = `${savedPos.left}px`;
    toolbar.style.top = `${savedPos.top}px`;
  }
  return pane;
}

function applyFocusedPaneState() {
  const panes = Array.from(panesEl.querySelectorAll(".pane"));
  const hasFocus = !!focusedSiteId;

  panesEl.classList.toggle("focus-mode", hasFocus);
  document.body.classList.toggle("pane-focus-mode", hasFocus);
  paneFocusBackdropEl.classList.toggle("hidden", !hasFocus);

  panes.forEach((pane) => {
    const isFocused = hasFocus && pane.dataset.siteId === focusedSiteId;
    pane.classList.toggle("focused", isFocused);
    const btn = pane.querySelector(".pane-focus-btn");
    if (!btn) return;
    const expandIcon = btn.querySelector(".pane-focus-expand");
    const collapseIcon = btn.querySelector(".pane-focus-collapse");
    if (expandIcon) expandIcon.classList.toggle("hidden", isFocused);
    if (collapseIcon) collapseIcon.classList.toggle("hidden", !isFocused);
    btn.setAttribute("title", isFocused ? t("unfocus_pane") : t("focus_pane"));
    btn.setAttribute("aria-label", isFocused ? t("unfocus_pane") : t("focus_pane"));
    const openBtn = pane.querySelector(".pane-open-btn");
    if (openBtn) {
      openBtn.setAttribute("title", t("open_chat_tab"));
      openBtn.setAttribute("aria-label", t("open_chat_tab"));
    }
  });
  updatePromptPlaceholder();
}

function enterPaneFocus(siteId) {
  if (!siteId || !selectedSiteIds.includes(siteId)) return;
  focusedSiteId = siteId;
  mentionSiteIds = [siteId];
  renderMentionChips();
  applyFocusedPaneState();
}

function exitPaneFocus() {
  if (!focusedSiteId) return;
  focusedSiteId = null;
  mentionSiteIds = [];
  renderMentionChips();
  applyFocusedPaneState();
}

function renderSiteSettings() {
  siteCheckboxesEl.innerHTML = "";
  orderedSites().forEach((site) => {
    const row = document.createElement("li");
    row.className = "site-card";
    row.dataset.siteId = site.id;
    const canDelete = site.id.startsWith("custom-");
    const safeName = escapeHtml(site.name);
    const safeUrl = escapeHtml(site.url);
    const safeId = escapeHtml(site.id);
    row.innerHTML = `
      <div class="site-checkbox-content">
        <div class="left-section">
          <label class="toggle-switch">
            <input type="checkbox" value="${safeId}" ${selectedSiteIds.includes(site.id) ? "checked" : ""} />
            <span class="slider"></span>
          </label>
          <img src="${getFavicon(site.url)}" alt="${safeName}" class="site-icon" />
          <div class="site-name-block">
            <div class="site-main-name">${safeName}</div>
            <div class="site-sub-name">${safeUrl}</div>
          </div>
        </div>
        <div class="right-section">
          ${canDelete ? `<button type="button" class="site-action site-delete" data-site-id="${safeId}" aria-label="${escapeHtml(t("delete"))}" title="${escapeHtml(t("delete"))}"><svg class="icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button>` : ""}
          <span class="site-action site-drag-handle" data-site-id="${safeId}" title="${escapeHtml(t("drag_sort"))}" aria-label="${escapeHtml(t("drag_sort"))}"><svg class="icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 7h3M8 12h3M8 17h3M13 7h3M13 12h3M13 17h3"/></svg></span>
          <a class="site-action open-link" href="${safeUrl}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(t("open_site"))}" title="${escapeHtml(t("open_site"))}"><svg class="icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2.1" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6"/><path d="M10 14 20 4"/><path d="M20 13v7H4V4h7"/></svg></a>
        </div>
      </div>
    `;
    siteCheckboxesEl.appendChild(row);
  });

  siteCheckboxesEl.querySelectorAll(".site-delete").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const siteId = e.currentTarget.getAttribute("data-site-id");
      customSites = customSites.filter((site) => site.id !== siteId);
      selectedSiteIds = selectedSiteIds.filter((id) => id !== siteId);
      siteOrder = siteOrder.filter((id) => id !== siteId);
      await saveCustomSites();
      await saveSiteOrder();
      saveSelectedSites();
      renderSiteSettings();
      renderPanes();
    });
  });

  initSiteDragSort();
}

function saveSelectedSites() {
  chrome.storage.local.set({ [STORAGE_KEYS.selectedSites]: selectedSiteIds });
}

async function loadSelectedSites() {
  const data = await chrome.storage.local.get([STORAGE_KEYS.selectedSites]);
  const raw = data[STORAGE_KEYS.selectedSites];
  if (Array.isArray(raw) && raw.length > 0) {
    selectedSiteIds = raw.filter((id) => getSiteById(id));
  } else {
    selectedSiteIds = [...defaultSiteIds];
  }
}

async function loadCustomSites() {
  const data = await chrome.storage.local.get([STORAGE_KEYS.customSites]);
  customSites = Array.isArray(data[STORAGE_KEYS.customSites]) ? data[STORAGE_KEYS.customSites] : [];
}

async function saveCustomSites() {
  await chrome.storage.local.set({ [STORAGE_KEYS.customSites]: customSites });
}

async function loadSiteOrder() {
  const data = await chrome.storage.local.get([STORAGE_KEYS.siteOrder]);
  siteOrder = Array.isArray(data[STORAGE_KEYS.siteOrder]) ? data[STORAGE_KEYS.siteOrder] : [];
}

async function saveSiteOrder() {
  await chrome.storage.local.set({ [STORAGE_KEYS.siteOrder]: siteOrder });
}

function normalizeOrderAndSelection() {
  const ids = allSites().map((site) => site.id);
  const idSet = new Set(ids);

  siteOrder = siteOrder.filter((id) => idSet.has(id));
  ids.forEach((id) => {
    if (!siteOrder.includes(id)) siteOrder.push(id);
  });

  selectedSiteIds = selectedSiteIds.filter((id) => idSet.has(id));
}

async function loadHistory() {
  const data = await chrome.storage.local.get([STORAGE_KEYS.history]);
  return Array.isArray(data[STORAGE_KEYS.history]) ? data[STORAGE_KEYS.history] : [];
}

async function loadSiteUrlState() {
  const data = await chrome.storage.local.get([STORAGE_KEYS.siteUrlState]);
  const raw = data[STORAGE_KEYS.siteUrlState];
  siteUrlState = raw && typeof raw === "object" ? raw : {};
}

async function saveSiteUrlState() {
  await chrome.storage.local.set({ [STORAGE_KEYS.siteUrlState]: siteUrlState });
}

function formatTime(ts) {
  const date = new Date(ts);
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

function buildHistoryPreview(text) {
  const oneLine = String(text || "").replaceAll(/\s+/g, " ").trim();
  if (!oneLine) return "";
  if (oneLine.length <= 50) return oneLine;
  return `${oneLine.slice(0, 50)}...`;
}

async function summarizeHistoryPrompt(text) {
  const fallback = buildHistoryPreview(text);
  if (!historySummaryEnabled || !historySummaryUrl || !historySummaryModel) return { text: fallback, ai: false };
  const endpoint = `${historySummaryUrl.replace(/\/+$/, "")}/api/generate`;
  const prompt = `Summarize this user prompt into ONE short title within 50 chars. Return title only.\n\n${String(text || "").slice(0, 1600)}`;
  try {
    const timeout = new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error("timeout")), 12000);
    });
    const request = fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: historySummaryModel,
        prompt,
        stream: false,
        options: { temperature: 0.1, num_predict: 40 }
      })
    });
    const response = await Promise.race([request, timeout]);
    if (!response.ok) return { text: fallback, ai: false };
    const data = await response.json();
    const raw = String(data?.response || "").trim();
    return { text: buildHistoryPreview(raw) || fallback, ai: true };
  } catch (_error) {
    return { text: fallback, ai: false };
  }
}

function buildHistoryLinks(item) {
  const urls = item.urls && typeof item.urls === "object" ? item.urls : {};
  const links = Object.entries(urls)
    .filter(([, url]) => typeof url === "string" && /^https?:\/\//i.test(url))
    .map(([siteId, url]) => {
      const site = getSiteById(siteId);
      const label = escapeHtml(site ? site.name : siteId);
      return `<a class="history-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    })
    .join("");
  return links ? `<div class="history-links">${links}</div>` : "";
}

function isHttpUrl(url) {
  return typeof url === "string" && /^https?:\/\//i.test(url);
}

function originPatternFromUrl(url) {
  try {
    const parsed = new URL(String(url || ""));
    if (!/^https?:$/i.test(parsed.protocol)) return "";
    return `${parsed.origin}/*`;
  } catch (_error) {
    return "";
  }
}

async function ensureSitePermission(url) {
  const originPattern = originPatternFromUrl(url);
  if (!originPattern) return false;
  try {
    const has = await chrome.permissions.contains({ origins: [originPattern] });
    if (has) return true;
    const granted = await chrome.permissions.request({ origins: [originPattern] });
    return Boolean(granted);
  } catch (_error) {
    return false;
  }
}

function normalizeUrlForCompare(url) {
  try {
    const parsed = new URL(String(url || ""));
    parsed.hash = "";
    return parsed.toString().replace(/\/+$/, "");
  } catch (_error) {
    return String(url || "").trim().replace(/\/+$/, "");
  }
}

function isDefaultSiteUrl(siteId, url) {
  const defaultUrl = getSiteById(siteId)?.url || "";
  if (!isHttpUrl(defaultUrl) || !isHttpUrl(url)) return false;
  return normalizeUrlForCompare(defaultUrl) === normalizeUrlForCompare(url);
}

function hasNonDefaultTargetUrl(siteIds, urls) {
  return siteIds.some((siteId) => {
    const url = String(urls?.[siteId] || "");
    return isHttpUrl(url) && !isDefaultSiteUrl(siteId, url);
  });
}

function urlsForSelectedSites(siteIds = selectedSiteIds) {
  const result = {};
  siteIds.forEach((siteId) => {
    const fallback = getSiteById(siteId)?.url || "";
    const raw = siteUrlState[siteId] || fallback;
    if (isHttpUrl(raw)) {
      result[siteId] = raw;
    }
  });
  return result;
}

function sameUrlSnapshot(a, b, siteIds) {
  return siteIds.every((siteId) => {
    const av = String(a?.[siteId] || "");
    const bv = String(b?.[siteId] || "");
    return av === bv;
  });
}

async function findLatestMatchingHistory(siteIds, urls) {
  const history = await loadHistory();
  for (const item of history) {
    if (!item || !item.urls || typeof item.urls !== "object") continue;
    if (sameUrlSnapshot(item.urls, urls, siteIds)) return item;
  }
  return null;
}

async function applyHistoryItem(item) {
  const urls = item && item.urls && typeof item.urls === "object" ? item.urls : {};
  const candidateIds = Object.keys(urls).filter((siteId) => getSiteById(siteId) && isHttpUrl(urls[siteId]));
  if (candidateIds.length) {
    candidateIds.forEach((siteId) => {
      delete pendingHistoryBySite[siteId];
    });
    const targetSet = new Set(candidateIds);
    selectedSiteIds = siteOrder.filter((id) => targetSet.has(id));
    if (!selectedSiteIds.length) {
      selectedSiteIds = [...defaultSiteIds];
    }
    saveSelectedSites();
    renderPanes();

    await new Promise((resolve) => window.setTimeout(resolve, 0));
    const frames = Array.from(document.querySelectorAll("iframe"));
    frames.forEach((frame) => {
      const siteId = frame.dataset.siteId;
      const url = urls[siteId];
      if (!isHttpUrl(url)) return;
      if (frame.src !== url) {
        frame.closest(".pane")?.classList.add("is-loading");
        frame.src = url;
      }
      siteUrlState[siteId] = url;
    });
    await saveSiteUrlState();
  }
}

async function renderHistory() {
  const history = await loadHistory();
  historyListEl.innerHTML = "";

  history.forEach((item) => {
    const box = document.createElement("li");
    box.className = "history-item";
    const prompt = escapeHtml(item.prompt || "");
    const aiTag = item.aiSummary ? `<span class="history-ai-tag">(${escapeHtml(t("ai_tag"))})</span>` : "";
    const meta = `${formatTime(item.ts)} | ${escapeHtml((item.sites || []).join(", "))}`;
    box.innerHTML = `
      <div class="history-item-head">
        <div class="prompt">${prompt}${aiTag}</div>
        <button type="button" class="site-action site-delete history-delete" data-history-id="${escapeHtml(String(item.id || ""))}" aria-label="${escapeHtml(t("delete"))}" title="${escapeHtml(t("delete"))}">
          <svg class="icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="meta">${meta}</div>
      ${buildHistoryLinks(item)}
    `;
    box.querySelector(".history-delete")?.addEventListener("click", (event) => {
      event.stopPropagation();
      void deleteHistoryById(item.id);
    });
    box.addEventListener("click", (event) => {
      if (event.target.closest("a, button")) return;
      void applyHistoryItem(item);
      promptEl.value = "";
      promptEl.focus();
      autoResizePrompt();
      closePanels();
    });
    historyListEl.appendChild(box);
  });
}

async function deleteHistoryById(entryId) {
  const id = String(entryId || "");
  if (!id) return;
  const history = await loadHistory();
  const next = history.filter((item) => String(item?.id || "") !== id);
  if (next.length === history.length) return;
  await chrome.storage.local.set({ [STORAGE_KEYS.history]: next.slice(0, 200) });
  await renderHistory();
}

async function appendHistory(prompt, siteIds = selectedSiteIds) {
  const history = await loadHistory();
  const validSiteIds = Array.isArray(siteIds) ? siteIds.filter((id) => getSiteById(id)) : [];
  const summary = await summarizeHistoryPrompt(prompt);
  const displayPrompt = summary.text;
  const entry = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    prompt: displayPrompt,
    aiSummary: !!summary.ai,
    ts: Date.now(),
    sites: validSiteIds
      .map(getSiteById)
      .filter(Boolean)
      .map((site) => site.name),
    urls: urlsForSelectedSites(validSiteIds)
  };
  history.unshift(entry);
  const keep = history.slice(0, 200);
  await chrome.storage.local.set({ [STORAGE_KEYS.history]: keep });
  await renderHistory();
  return entry;
}

function isNewChatHistoryPrompt(prompt) {
  const value = String(prompt || "").trim();
  return value === I18N.zh.new_chat_history || value === I18N.en.new_chat_history;
}

async function upgradeNewChatHistoryEntry(entryId, prompt, siteIds = selectedSiteIds) {
  const id = String(entryId || "");
  const rawPrompt = String(prompt || "").trim();
  if (!id || !rawPrompt) return;
  const history = await loadHistory();
  const idx = history.findIndex((item) => item && item.id === id);
  if (idx < 0) return;
  const item = history[idx];
  if (!isNewChatHistoryPrompt(item.prompt)) return;
  const summary = await summarizeHistoryPrompt(rawPrompt);
  const validSiteIds = Array.isArray(siteIds) ? siteIds.filter((siteId) => getSiteById(siteId)) : [];
  item.prompt = summary.text || buildHistoryPreview(rawPrompt);
  item.aiSummary = !!summary.ai;
  if (validSiteIds.length) {
    item.sites = validSiteIds
      .map(getSiteById)
      .filter(Boolean)
      .map((site) => site.name);
  }
  history[idx] = item;
  await chrome.storage.local.set({ [STORAGE_KEYS.history]: history.slice(0, 200) });
  if (!historyPanelEl.classList.contains("hidden")) {
    await renderHistory();
  }
}

async function patchHistoryUrl(entryId, siteId, url) {
  if (!entryId || !siteId || !/^https?:\/\//i.test(url)) return;
  const history = await loadHistory();
  const idx = history.findIndex((item) => item && item.id === entryId);
  if (idx < 0) return;
  const item = history[idx];
  const urls = item.urls && typeof item.urls === "object" ? { ...item.urls } : {};
  if (urls[siteId] === url) return;
  urls[siteId] = url;
  item.urls = urls;
  history[idx] = item;
  await chrome.storage.local.set({ [STORAGE_KEYS.history]: history.slice(0, 200) });
  if (!historyPanelEl.classList.contains("hidden")) {
    await renderHistory();
  }
}

function sendToFrames(type, message, payload = {}) {
  const frames = Array.from(document.querySelectorAll("iframe"));
  frames.forEach((frame) => {
    frame.contentWindow.postMessage({ type, message, payload, config: { siteId: frame.dataset.siteId } }, "*");
  });
}

function sendToTargetFrames(type, message, targetSiteIds, payload = {}) {
  const targetSet = new Set(targetSiteIds);
  const frames = Array.from(document.querySelectorAll("iframe"));
  frames.forEach((frame) => {
    if (!targetSet.has(frame.dataset.siteId)) return;
    frame.contentWindow.postMessage({ type, message, payload, config: { siteId: frame.dataset.siteId } }, "*");
  });
}

function normalizeQuotedText(text) {
  const clean = String(text || "").replaceAll(/\s+\n/g, "\n").replaceAll(/\n{3,}/g, "\n\n").trim();
  if (!clean) return "";
  return clean
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

function insertTextAtCursor(text) {
  const value = promptEl.value || "";
  const start = promptEl.selectionStart ?? value.length;
  const end = promptEl.selectionEnd ?? start;
  promptEl.value = `${value.slice(0, start)}${text}${value.slice(end)}`;
  const cursor = start + text.length;
  promptEl.setSelectionRange(cursor, cursor);
}

function applyQuoteTextToPrompt(rawText) {
  const quoted = normalizeQuotedText(rawText);
  if (!quoted) return;
  const needsBreak = promptEl.value.trim() ? "\n\n" : "";
  insertTextAtCursor(`${needsBreak}${quoted}\n`);
  autoResizePrompt();
  promptEl.focus();
  refreshMentionDropdown();
}

function keepPromptFocus() {
  promptEl.focus();
  window.setTimeout(() => promptEl.focus(), 80);
  window.setTimeout(() => promptEl.focus(), 220);
  window.setTimeout(() => promptEl.focus(), 420);
}

function bytesLabel(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function renderAttachmentChips() {
  attachmentChipsEl.innerHTML = "";
  attachmentChipsEl.classList.add("hidden");
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

async function appendAttachmentsFromFiles(files) {
  const allFiles = Array.from(files || []).filter((file) => file instanceof File);
  if (!allFiles.length) return false;

  const newAttachments = [];
  for (const file of allFiles.slice(0, 6)) {
    const dataUrl = await readFileAsDataUrl(file);
    newAttachments.push({
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      name: file.name || t("image_attachment"),
      type: file.type || "application/octet-stream",
      size: Number(file.size) || 0,
      dataUrl
    });
  }

  pendingAttachments = newAttachments;
  renderAttachmentChips();
  broadcastPendingAttachmentsToTargets();
  keepPromptFocus();
  return true;
}

function currentTargetSiteIds() {
  return mentionSiteIds.length ? [...mentionSiteIds] : [...selectedSiteIds];
}

function broadcastPendingAttachmentsToTargets() {
  if (!pendingAttachments.length) return;
  const targetSiteIds = currentTargetSiteIds();
  if (!targetSiteIds.length) return;
  const files = pendingAttachments.map((item) => ({
    name: item.name,
    type: item.type,
    size: item.size,
    dataUrl: item.dataUrl
  }));
  sendToTargetFrames("ATTACH_FILES", "", targetSiteIds, { files });
}

function normalizeMentionKey(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replaceAll(/^[\s.,;:!?()[\]{}"'`~]+|[\s.,;:!?()[\]{}"'`~]+$/g, "");
}

function hideMentionDropdown() {
  mentionDropdownEl.classList.add("hidden");
  mentionDropdownEl.innerHTML = "";
  mentionState = null;
}

function getMentionCandidates(query) {
  const q = normalizeMentionKey(query);
  const selectedSet = new Set(selectedSiteIds);
  const sites = orderedSites().filter((site) => selectedSet.has(site.id));
  if (!q) return sites.slice(0, 9);
  return sites
    .filter((site) => {
      const name = normalizeMentionKey(site.name);
      const id = normalizeMentionKey(site.id);
      return name.includes(q) || id.includes(q);
    })
    .slice(0, 9);
}

function getPickerContext() {
  const value = promptEl.value;
  const caret = promptEl.selectionStart ?? value.length;
  const scanTo = Math.max(0, caret - 1);
  const atPos = value.lastIndexOf("@", scanTo);
  const hashPos = value.lastIndexOf("#", scanTo);
  const pos = Math.max(atPos, hashPos);
  if (pos < 0) return null;
  const trigger = value[pos];
  const before = pos > 0 ? value[pos - 1] : "";
  if (before && !/\s/.test(before)) return null;
  const token = value.slice(pos + 1, caret);
  if (/\s/.test(token)) return null;
  return { trigger, atPos: pos, caret, token };
}

function applyMentionActive() {
  if (!mentionState) return;
  mentionDropdownEl.querySelectorAll(".mention-item").forEach((item, index) => {
    item.classList.toggle("active", index === mentionState.activeIndex);
  });
}

function insertMentionCandidate(index) {
  if (!mentionState) return false;
  const site = mentionState.candidates[index];
  if (!site) return false;
  const value = promptEl.value;
  const head = value.slice(0, mentionState.atPos);
  const tail = value.slice(mentionState.caret);
  promptEl.value = `${head}${tail}`;
  const nextCaret = head.length;
  promptEl.selectionStart = nextCaret;
  promptEl.selectionEnd = nextCaret;
  if (mentionState.mode === "focus") {
    if (focusedSiteId === site.id) {
      exitPaneFocus();
    } else {
      enterPaneFocus(site.id);
    }
  } else {
    if (mentionSiteIds.includes(site.id)) {
      mentionSiteIds = mentionSiteIds.filter((id) => id !== site.id);
    } else {
      mentionSiteIds.push(site.id);
    }
    renderMentionChips();
  }
  autoResizePrompt();
  promptEl.focus();
  hideMentionDropdown();
  return true;
}

function removeMentionSite(siteId) {
  mentionSiteIds = mentionSiteIds.filter((id) => id !== siteId);
  renderMentionChips();
}

function renderMentionChips() {
  const valid = mentionSiteIds.filter((siteId) => getSiteById(siteId));
  mentionSiteIds = valid;
  mentionChipsEl.innerHTML = "";
  if (!valid.length) {
    mentionChipsEl.classList.add("hidden");
    return;
  }

  valid.forEach((siteId) => {
    const site = getSiteById(siteId);
    if (!site) return;
    const chip = document.createElement("span");
    chip.className = "mention-chip";
    chip.innerHTML = `
      <img src="${getFavicon(site.url)}" alt="" class="site-icon" />
      <span class="label">@${escapeHtml(site.id)}</span>
      <button type="button" class="remove" aria-label="${escapeHtml(t("remove"))} ${escapeHtml(site.id)}" title="${escapeHtml(t("remove"))}">×</button>
    `;
    chip.querySelector(".remove").addEventListener("click", () => {
      removeMentionSite(siteId);
      promptEl.focus();
    });
    mentionChipsEl.appendChild(chip);
  });

  mentionChipsEl.classList.remove("hidden");
}

function refreshMentionDropdown() {
  const ctx = getPickerContext();
  if (!ctx) {
    hideMentionDropdown();
    return;
  }

  const candidates = getMentionCandidates(ctx.token);
  if (!candidates.length) {
    hideMentionDropdown();
    return;
  }

  const mode = ctx.trigger === "#" ? "focus" : "mention";
  mentionState = {
    atPos: ctx.atPos,
    caret: ctx.caret,
    token: ctx.token,
    candidates,
    mode,
    activeIndex: 0
  };

  mentionDropdownEl.innerHTML = "";
  candidates.forEach((site, index) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "mention-item";
    item.innerHTML = `
      <span class="index">${index + 1}</span>
      <img src="${getFavicon(site.url)}" alt="" class="site-icon" />
      <span class="name">${escapeHtml(site.name)}</span>
      <span class="id">${mode === "focus" ? "#" : "@"}${escapeHtml(site.id)}</span>
    `;
    item.addEventListener("mousedown", (event) => {
      event.preventDefault();
      void insertMentionCandidate(index);
    });
    mentionDropdownEl.appendChild(item);
  });

  applyMentionActive();
  mentionDropdownEl.classList.remove("hidden");
}

async function onSend() {
  const message = promptEl.value.trim();
  const files = pendingAttachments.map((item) => ({
    name: item.name,
    type: item.type,
    size: item.size,
    dataUrl: item.dataUrl
  }));
  if (!message && !files.length) return;

  const targetSiteIds = mentionSiteIds.length ? [...mentionSiteIds] : [...selectedSiteIds];
  if (!targetSiteIds.length) return;

  const payload = {};
  if (mentionSiteIds.length) {
    sendToTargetFrames("CHAT_MESSAGE", message, targetSiteIds, payload);
  } else {
    sendToFrames("CHAT_MESSAGE", message, payload);
  }

  const currentUrls = urlsForSelectedSites(targetSiteIds);
  const shouldStoreHistory = Boolean(message) && hasNonDefaultTargetUrl(targetSiteIds, currentUrls);
  if (shouldStoreHistory) {
    const existing = await findLatestMatchingHistory(targetSiteIds, currentUrls);
    if (!existing || files.length) {
      const historyPrompt = message || t("image_placeholder_history");
      const entry = await appendHistory(historyPrompt, targetSiteIds);
      pendingHistoryBySite = {};
      const now = Date.now();
      targetSiteIds.forEach((siteId) => {
        pendingHistoryBySite[siteId] = {
          entryId: entry.id,
          baselineUrl: String(currentUrls[siteId] || ""),
          expireAt: now + HISTORY_URL_PATCH_WINDOW_MS
        };
      });
    } else if (isNewChatHistoryPrompt(existing.prompt)) {
      await upgradeNewChatHistoryEntry(existing.id, message, targetSiteIds);
      pendingHistoryBySite = {};
    }
  } else {
    pendingHistoryBySite = {};
  }

  promptEl.value = "";
  pendingAttachments = [];
  renderAttachmentChips();
  mentionSiteIds = [];
  renderMentionChips();
  autoResizePrompt();
  keepPromptFocus();
}

function autoResizePrompt() {
  promptEl.style.height = "auto";
  promptEl.style.height = `${Math.min(promptEl.scrollHeight, 200)}px`;
}

function runPanelOpenAnimation(panelEl) {
  panelEl.classList.add("panel-open-initial");
  panelBackdropEl.classList.add("panel-open-initial");
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      panelEl.classList.remove("panel-open-initial");
      panelBackdropEl.classList.remove("panel-open-initial");
    });
  });
}

function openSettingsPanel(tab = "sites") {
  exitPaneFocus();
  historyPanelEl.classList.add("hidden");
  rightPanelEl.classList.remove("hidden");
  panelTitleEl.textContent = t("settings_title");
  switchSettingsTab(tab);
  panelBackdropEl.classList.remove("hidden");
  runPanelOpenAnimation(rightPanelEl);
}

function openHistoryPanel() {
  exitPaneFocus();
  rightPanelEl.classList.add("hidden");
  historyPanelEl.classList.remove("hidden");
  panelTitleEl.textContent = t("history_title");
  panelBackdropEl.classList.remove("hidden");
  runPanelOpenAnimation(historyPanelEl);
}

function closePanels() {
  rightPanelEl.classList.add("panel-closing");
  historyPanelEl.classList.add("panel-closing");
  panelBackdropEl.classList.add("panel-closing");
  const onClosed = () => {
    panelBackdropEl.removeEventListener("transitionend", onClosed);
    rightPanelEl.classList.add("hidden");
    historyPanelEl.classList.add("hidden");
    panelBackdropEl.classList.add("hidden");
    rightPanelEl.classList.remove("panel-closing");
    historyPanelEl.classList.remove("panel-closing");
    panelBackdropEl.classList.remove("panel-closing");
  };
  panelBackdropEl.addEventListener("transitionend", onClosed);
}

function syncBackdropVisibility() {
  const hasOpenPanel = !rightPanelEl.classList.contains("hidden") || !historyPanelEl.classList.contains("hidden");
  panelBackdropEl.classList.toggle("hidden", !hasOpenPanel);
}

function switchSettingsTab(tab) {
  settingsSidebarEl.querySelectorAll(".sidebar-item").forEach((item) => {
    const active = item.dataset.settingsTab === tab;
    item.classList.toggle("active", active);
  });

  document.querySelectorAll(".settings-tab").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.tab === tab);
  });
}

async function loadThemeMode() {
  const data = await chrome.storage.local.get([STORAGE_KEYS.themeMode]);
  const saved = data[STORAGE_KEYS.themeMode];
  if (["system", "light", "dark"].includes(saved)) {
    themeMode = saved;
  } else {
    themeMode = "system";
  }
}

function getEffectiveTheme() {
  if (themeMode === "system") {
    return mediaDark.matches ? "dark" : "light";
  }
  return themeMode;
}

function applyTheme() {
  const effective = getEffectiveTheme();
  document.documentElement.setAttribute("data-theme", effective);

  const radio = document.querySelector(`input[name="theme-mode"][value="${themeMode}"]`);
  if (radio) radio.checked = true;
}

async function setThemeMode(mode) {
  themeMode = mode;
  await chrome.storage.local.set({ [STORAGE_KEYS.themeMode]: mode });
  applyTheme();
}

function bindEvents() {
  let paneBtnDrag = null;

  window.addEventListener("mousemove", (event) => {
    if (!paneBtnDrag) return;
    const { toolbar, pane, startX, startY, baseLeft, baseTop } = paneBtnDrag;
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (!paneBtnDrag.moved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
      paneBtnDrag.moved = true;
      toolbar.classList.add("dragging");
      const focusBtn = toolbar.querySelector(".pane-focus-btn");
      if (focusBtn) focusBtn.classList.add("dragging");
    }
    if (!paneBtnDrag.moved) return;

    const maxLeft = Math.max(0, pane.clientWidth - toolbar.offsetWidth);
    const maxTop = Math.max(0, pane.clientHeight - toolbar.offsetHeight);
    const nextLeft = Math.max(0, Math.min(maxLeft, baseLeft + dx));
    const nextTop = Math.max(0, Math.min(maxTop, baseTop + dy));
    toolbar.style.right = "auto";
    toolbar.style.left = `${nextLeft}px`;
    toolbar.style.top = `${nextTop}px`;
  });

  window.addEventListener("mouseup", () => {
    if (!paneBtnDrag) return;
    const { toolbar, pane, moved } = paneBtnDrag;
    if (moved) {
      const focusBtn = toolbar.querySelector(".pane-focus-btn");
      if (focusBtn) focusBtn.dataset.dragMovedAt = String(Date.now());
      paneFocusButtonPosBySite[pane.dataset.siteId] = {
        left: Number.parseFloat(toolbar.style.left) || 10,
        top: Number.parseFloat(toolbar.style.top) || 10
      };
    }
    toolbar.classList.remove("dragging");
    const focusBtn = toolbar.querySelector(".pane-focus-btn");
    if (focusBtn) focusBtn.classList.remove("dragging");
    paneBtnDrag = null;
    document.body.style.userSelect = "";
  });

  panesEl.addEventListener("mousedown", (event) => {
    const btn = event.target.closest(".pane-focus-btn");
    if (!btn || event.button !== 0) return;
    const toolbar = btn.closest(".pane-toolbar");
    const pane = btn.closest(".pane");
    if (!toolbar || !pane) return;

    const paneRect = pane.getBoundingClientRect();
    const toolbarRect = toolbar.getBoundingClientRect();
    const baseLeft = toolbar.style.left ? Number.parseFloat(toolbar.style.left) : toolbarRect.left - paneRect.left;
    const baseTop = toolbar.style.top ? Number.parseFloat(toolbar.style.top) : toolbarRect.top - paneRect.top;
    toolbar.style.right = "auto";
    toolbar.style.left = `${baseLeft}px`;
    toolbar.style.top = `${baseTop}px`;

    paneBtnDrag = {
      toolbar,
      pane,
      startX: event.clientX,
      startY: event.clientY,
      baseLeft,
      baseTop,
      moved: false
    };
    document.body.style.userSelect = "none";
  });

  document.addEventListener("keydown", (event) => {
    const isFocusShortcut = (event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "f";
    if (!isFocusShortcut) return;
    if (!focusedSiteId) return;
    event.preventDefault();
    exitPaneFocus();
  });

  panesEl.addEventListener("click", (event) => {
    const openBtn = event.target.closest(".pane-open-btn");
    if (openBtn) {
      const siteId = openBtn.getAttribute("data-site-id");
      const site = siteId ? getSiteById(siteId) : null;
      const url = siteId ? String(siteUrlState[siteId] || "") : "";
      const targetUrl = isHttpUrl(url) ? url : (site?.url || "");
      if (isHttpUrl(targetUrl)) {
        window.open(targetUrl, "_blank", "noopener,noreferrer");
      }
      promptEl.focus();
      return;
    }
    const btn = event.target.closest(".pane-focus-btn");
    if (!btn) return;
    const dragMovedAt = Number(btn.dataset.dragMovedAt || "0");
    if (Date.now() - dragMovedAt < 240) return;
    const siteId = btn.getAttribute("data-site-id");
    if (!siteId) return;
    if (focusedSiteId === siteId) {
      exitPaneFocus();
    } else {
      enterPaneFocus(siteId);
    }
  });
  paneFocusBackdropEl.addEventListener("click", exitPaneFocus);

  document.getElementById("send").addEventListener("click", onSend);
  document.getElementById("new-chat").addEventListener("click", () => {
    const activeSiteIds = Array.from(document.querySelectorAll("iframe"))
      .map((frame) => frame.dataset.siteId)
      .filter((id) => !!id);
    if (!activeSiteIds.length) return;
    activeSiteIds.forEach((siteId) => {
      delete pendingHistoryBySite[siteId];
    });
    sendToFrames("NEW_CHAT", "NEW_CHAT");
  });

  promptEl.addEventListener("keydown", (e) => {
    if (e.isComposing || isComposing || e.keyCode === 229) return;

    if (mentionState) {
      const max = mentionState.candidates.length;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        mentionState.activeIndex = (mentionState.activeIndex + 1) % max;
        applyMentionActive();
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        mentionState.activeIndex = (mentionState.activeIndex - 1 + max) % max;
        applyMentionActive();
        return;
      }
      if (e.key >= "1" && e.key <= "9") {
        const n = Number(e.key) - 1;
        if (n < max) {
          e.preventDefault();
          void insertMentionCandidate(n);
          return;
        }
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void insertMentionCandidate(mentionState.activeIndex);
        return;
      }
      if (e.key === "Escape") {
        hideMentionDropdown();
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void onSend();
      return;
    }
    if (e.key === "Backspace" && !promptEl.value && mentionSiteIds.length) {
      e.preventDefault();
      mentionSiteIds.pop();
      renderMentionChips();
      return;
    }
  });
  promptEl.addEventListener("compositionstart", () => {
    isComposing = true;
  });
  promptEl.addEventListener("compositionend", () => {
    isComposing = false;
  });
  promptEl.addEventListener("input", () => {
    autoResizePrompt();
    refreshMentionDropdown();
  });
  promptEl.addEventListener("paste", (event) => {
    const files = event.clipboardData?.files;
    if (!files || !files.length) return;
    event.preventDefault();
    keepPromptFocus();
    void appendAttachmentsFromFiles(files);
  });
  promptEl.addEventListener("dragover", (event) => {
    event.preventDefault();
  });
  promptEl.addEventListener("drop", (event) => {
    event.preventDefault();
    const transfer = event.dataTransfer;
    if (!transfer) return;

    const files = transfer.files;
    const hasFiles = files && files.length;
    if (hasFiles) {
      keepPromptFocus();
      void appendAttachmentsFromFiles(files);
    }

    const droppedText = transfer.getData("text/plain") || transfer.getData("text/uri-list") || "";
    if (droppedText) {
      insertTextAtCursor(droppedText);
      autoResizePrompt();
      refreshMentionDropdown();
    }

    if (hasFiles || droppedText) {
      keepPromptFocus();
    }
  });
  promptEl.addEventListener("click", refreshMentionDropdown);
  promptEl.addEventListener("keyup", (e) => {
    if (["ArrowUp", "ArrowDown", "Enter", "Escape"].includes(e.key)) return;
    if (e.isComposing || isComposing || e.keyCode === 229) return;
    refreshMentionDropdown();
  });
  document.addEventListener("click", (event) => {
    if (event.target === promptEl || mentionDropdownEl.contains(event.target)) return;
    hideMentionDropdown();
  });

  document.getElementById("site-settings-btn").addEventListener("click", () => {
    openSettingsPanel("sites");
  });
  document.getElementById("panel-close").addEventListener("click", closePanels);
  panelBackdropEl.addEventListener("click", closePanels);

  settingsSidebarEl.querySelectorAll(".sidebar-item").forEach((item) => {
    item.addEventListener("click", () => {
      switchSettingsTab(item.dataset.settingsTab);
    });
  });

  document.getElementById("save-sites").addEventListener("click", async () => {
    const checked = Array.from(siteCheckboxesEl.querySelectorAll("input:checked")).map((x) => x.value);
    const checkedSet = new Set(checked.length > 0 ? checked : defaultSiteIds);
    const deniedNames = [];
    const allowedIds = [];
    for (const id of siteOrder.filter((siteId) => checkedSet.has(siteId))) {
      const site = getSiteById(id);
      if (!site) continue;
      if (!site.id.startsWith("custom-")) {
        allowedIds.push(id);
        continue;
      }
      const granted = await ensureSitePermission(site.url);
      if (granted) {
        allowedIds.push(id);
      } else {
        deniedNames.push(site.name || id);
      }
    }
    selectedSiteIds = allowedIds;
    const allowedSet = new Set(allowedIds);
    mentionSiteIds = mentionSiteIds.filter((id) => allowedSet.has(id));
    if (deniedNames.length) {
      alert(formatText(t("custom_site_permission_denied"), { sites: deniedNames.join(", ") }));
      renderSiteSettings();
    }
    renderMentionChips();
    saveSelectedSites();
    renderPanes();
  });

  const customForm = document.getElementById("custom-site-form");
  document.getElementById("toggle-custom-site").addEventListener("click", () => {
    customForm.classList.toggle("hidden");
  });
  document.getElementById("cancel-custom-site").addEventListener("click", () => {
    customForm.classList.add("hidden");
  });

  document.getElementById("add-custom-site").addEventListener("click", async () => {
    const nameInput = document.getElementById("custom-site-name");
    const urlInput = document.getElementById("custom-site-url");
    const name = nameInput.value.trim();
    const url = urlInput.value.trim();

    if (!name || !url) return;

    let normalizedUrl = url;
    if (!/^https?:\/\//i.test(normalizedUrl)) {
      normalizedUrl = `https://${normalizedUrl}`;
    }

    try {
      const parsed = new URL(normalizedUrl);
      const granted = await ensureSitePermission(parsed.toString());
      if (!granted) {
        alert(t("custom_site_permission_required"));
        return;
      }
      const id = `custom-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`;
      customSites.push({ id, name, url: parsed.toString() });
      siteOrder.push(id);
      await saveCustomSites();
      await saveSiteOrder();
      renderSiteSettings();
      nameInput.value = "";
      urlInput.value = "";
      customForm.classList.add("hidden");
    } catch (_error) {
      // Invalid URL ignored.
    }
  });

  document.getElementById("history-btn").addEventListener("click", async () => {
    await renderHistory();
    openHistoryPanel();
  });

  document.getElementById("history-close").addEventListener("click", closePanels);
  document.getElementById("history-clear").addEventListener("click", async () => {
    await chrome.storage.local.set({ [STORAGE_KEYS.history]: [] });
    await renderHistory();
  });

  document.querySelectorAll('input[name="theme-mode"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      void setThemeMode(radio.value);
    });
  });

  document.querySelectorAll('input[name="locale-mode"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      void setLocaleMode(radio.value);
    });
  });

  document.querySelectorAll('input[name="panes-per-row"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      void setPanesPerRow(Number(radio.value));
    });
  });

  historySummaryEnabledEl?.addEventListener("change", () => {
    void saveHistorySummaryConfig();
  });
  historySummaryUrlEl?.addEventListener("change", () => {
    void saveHistorySummaryConfig();
  });
  historySummaryModelEl?.addEventListener("change", () => {
    void saveHistorySummaryConfig();
  });
  historySummaryUrlEl?.addEventListener("input", () => setHistorySummaryTestResult(""));
  historySummaryModelEl?.addEventListener("input", () => setHistorySummaryTestResult(""));
  document.getElementById("save-history-summary")?.addEventListener("click", () => {
    void saveHistorySummaryConfig();
  });
  testHistorySummaryBtnEl?.addEventListener("click", () => {
    void testHistorySummaryConfig();
  });

  mediaDark.addEventListener("change", () => {
    if (themeMode === "system") applyTheme();
  });

  window.addEventListener("message", (event) => {
    if (!event.data || !event.data.type) return;
    if (event.data.type === "PANE_EXIT_FOCUS") {
      if (focusedSiteId) exitPaneFocus();
      return;
    }
    if (event.data.type === "QUOTE_TEXT") {
      const raw = typeof event.data.payload === "string" ? event.data.payload : event.data.payload?.text;
      applyQuoteTextToPrompt(raw || "");
      return;
    }
    if (event.data.type !== "UPDATE_HISTORY") return;
    const payload = event.data.payload || {};
    if (payload.siteId && payload.url) {
      siteUrlState[payload.siteId] = payload.url;
      void saveSiteUrlState();
      const pendingPatch = pendingHistoryBySite[payload.siteId];
      if (pendingPatch && typeof pendingPatch === "object") {
        const expired = Number(pendingPatch.expireAt || 0) < Date.now();
        const baseline = String(pendingPatch.baselineUrl || "");
        if (expired) {
          delete pendingHistoryBySite[payload.siteId];
        } else if (isHttpUrl(payload.url) && payload.url !== baseline) {
          delete pendingHistoryBySite[payload.siteId];
          void patchHistoryUrl(String(pendingPatch.entryId || ""), payload.siteId, payload.url);
        }
      }
    }
  });

  initDraggableBubble("input-bubble");
}

function initDraggableBubble(targetId) {
  const target = document.getElementById(targetId);
  if (!target) return;

  let dragging = false;
  let startX = 0;
  let startY = 0;
  let baseLeft = 0;
  let baseTop = 0;

  target.addEventListener("mousedown", (e) => {
    const blocked = e.target.closest("textarea, button, input, a, label");
    if (blocked) return;

    const rect = target.getBoundingClientRect();
    const nearLeft = Math.abs(e.clientX - rect.left) <= 34;
    const nearRight = Math.abs(e.clientX - rect.right) <= 34;
    const nearTop = Math.abs(e.clientY - rect.top) <= 34;
    const nearBottom = Math.abs(e.clientY - rect.bottom) <= 34;
    if (!(nearLeft || nearRight || nearTop || nearBottom)) return;

    dragging = true;
    target.style.left = `${rect.left}px`;
    target.style.top = `${rect.top}px`;
    target.style.bottom = "auto";
    target.style.transform = "none";
    startX = e.clientX;
    startY = e.clientY;
    baseLeft = rect.left;
    baseTop = rect.top;
    document.body.style.userSelect = "none";
  });

  window.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const nextLeft = baseLeft + (e.clientX - startX);
    const nextTop = baseTop + (e.clientY - startY);
    const maxLeft = window.innerWidth - target.offsetWidth;
    const maxTop = window.innerHeight - target.offsetHeight;
    const clampedLeft = Math.max(0, Math.min(maxLeft, nextLeft));
    const clampedTop = Math.max(0, Math.min(maxTop, nextTop));
    target.style.left = `${clampedLeft}px`;
    target.style.top = `${clampedTop}px`;
  });

  window.addEventListener("mouseup", () => {
    dragging = false;
    document.body.style.userSelect = "";
  });
}

async function init() {
  await loadCustomSites();
  await loadSiteOrder();
  await loadSelectedSites();
  await loadSiteUrlState();
  await loadThemeMode();
  await loadLocaleMode();
  await loadHistorySummaryConfig();
  await loadPanesPerRow();
  applyI18n();
  normalizeOrderAndSelection();
  await saveSiteOrder();
  saveSelectedSites();
  renderPanes();
  renderSiteSettings();
  renderHistorySummarySettings();
  await renderHistory();
  applyTheme();
  autoResizePrompt();
  renderAttachmentChips();
  syncPanesPerRowRadio();
  bindEvents();
}

function syncPanesPerRowRadio() {
  const radio = document.querySelector(`input[name="panes-per-row"][value="${panesPerRow}"]`);
  if (radio) radio.checked = true;
}

function initSiteDragSort() {
  const cards = Array.from(siteCheckboxesEl.querySelectorAll(".site-card"));
  if (!cards.length) return;

  async function persistSiteOrderFromDom() {
    const orderedIds = Array.from(siteCheckboxesEl.querySelectorAll(".site-card"))
      .map((el) => el.dataset.siteId)
      .filter(Boolean);
    if (!orderedIds.length) return;
    siteOrder = orderedIds;
    await saveSiteOrder();
    const selectedSet = new Set(selectedSiteIds);
    selectedSiteIds = siteOrder.filter((id) => selectedSet.has(id));
    saveSelectedSites();
  }

  function moveCardToPosition(draggingEl, clientY) {
    const candidates = Array.from(siteCheckboxesEl.querySelectorAll(".site-card")).filter((card) => card !== draggingEl);
    let next = null;
    for (const card of candidates) {
      const rect = card.getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;
      if (clientY < midpoint) {
        next = card;
        break;
      }
    }
    siteCheckboxesEl.insertBefore(draggingEl, next);
  }

  siteCheckboxesEl.querySelectorAll(".site-drag-handle").forEach((handle) => {
    const card = handle.closest(".site-card");
    if (!card) return;

    handle.addEventListener("mousedown", (e) => {
      e.preventDefault();
      card.classList.add("dragging");

      const onMove = (moveEvent) => {
        moveEvent.preventDefault();
        moveCardToPosition(card, moveEvent.clientY);
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        card.classList.remove("dragging");
        void persistSiteOrderFromDom();
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  });
}

function initPaneResizers() {
  const resizers = Array.from(panesEl.querySelectorAll(".pane-resizer"));
  const panes = Array.from(panesEl.querySelectorAll(".pane"));
  if (resizers.length && panes.length >= 2) {
    resizers.forEach((resizer) => {
      const container = resizer.parentElement;
      const leftPane = resizer.previousElementSibling;
      const rightPane = resizer.nextElementSibling;
      const useSiblings = leftPane?.classList?.contains("pane") && rightPane?.classList?.contains("pane");
      const rowPanes = container ? Array.from(container.querySelectorAll(":scope > .pane")) : [];
      const updateRatios = true;
      if (useSiblings) {
        resizer.onmousedown = makeResizerHandler(leftPane, rightPane, container, rowPanes.length ? rowPanes : panes, updateRatios);
      } else {
        const leftIndex = Number(resizer.dataset.index);
        const left = panes[leftIndex];
        const right = panes[leftIndex + 1];
        if (!left || !right) return;
        resizer.onmousedown = makeResizerHandler(left, right, panesEl, panes, true);
      }
    });
  }

  const rowResizers = Array.from(panesEl.querySelectorAll(".pane-row-resizer"));
  if (!rowResizers.length) return;
  rowResizers.forEach((resizer) => {
    resizer.onmousedown = makeRowResizerHandler(resizer);
  });
}

function makeResizerHandler(leftPane, rightPane, container, allPanes, updateRatios) {
  return (event) => {
    event.preventDefault();
    const containerRect = container.getBoundingClientRect();
    const leftStart = leftPane.getBoundingClientRect().width;
    const rightStart = rightPane.getBoundingClientRect().width;
    const startX = event.clientX;
    const minWidth = 220;

    const onMove = (moveEvent) => {
      const delta = moveEvent.clientX - startX;
      let nextLeft = leftStart + delta;
      let nextRight = rightStart - delta;
      if (nextLeft < minWidth) {
        nextLeft = minWidth;
        nextRight = leftStart + rightStart - nextLeft;
      }
      if (nextRight < minWidth) {
        nextRight = minWidth;
        nextLeft = leftStart + rightStart - nextRight;
      }
      leftPane.style.width = `${nextLeft}px`;
      rightPane.style.width = `${nextRight}px`;
    };

    const onUp = () => {
      if (updateRatios && allPanes.length) {
        const widths = allPanes.map((p) => p.getBoundingClientRect().width);
        const total = widths.reduce((s, w) => s + w, 0) || containerRect.width;
        const localRatios = widths.map((w) => w / total);
        if (container === panesEl) {
          paneRatios = localRatios;
        }
        allPanes.forEach((pane, idx) => {
          pane.style.width = `${localRatios[idx] * 100}%`;
        });
      }
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };
}

function makeRowResizerHandler(resizer) {
  return (event) => {
    event.preventDefault();
    const topRow = resizer.previousElementSibling;
    const bottomRow = resizer.nextElementSibling;
    if (!topRow || !bottomRow || !topRow.classList.contains("pane-row") || !bottomRow.classList.contains("pane-row")) return;

    const startY = event.clientY;
    const topStart = topRow.getBoundingClientRect().height;
    const bottomStart = bottomRow.getBoundingClientRect().height;
    const minHeight = 160;

    const onMove = (moveEvent) => {
      const delta = moveEvent.clientY - startY;
      let nextTop = topStart + delta;
      let nextBottom = bottomStart - delta;
      if (nextTop < minHeight) {
        nextTop = minHeight;
        nextBottom = topStart + bottomStart - nextTop;
      }
      if (nextBottom < minHeight) {
        nextBottom = minHeight;
        nextTop = topStart + bottomStart - nextBottom;
      }
      topRow.style.flex = "0 0 auto";
      bottomRow.style.flex = "0 0 auto";
      topRow.style.height = `${nextTop}px`;
      bottomRow.style.height = `${nextBottom}px`;
    };

    const onUp = () => {
      const rows = Array.from(panesEl.querySelectorAll(".pane-row"));
      if (rows.length) {
        const heights = rows.map((row) => row.getBoundingClientRect().height);
        const total = heights.reduce((sum, h) => sum + h, 0) || 1;
        rowRatios = heights.map((h) => h / total);
        rows.forEach((row, idx) => {
          row.style.flex = "0 0 auto";
          row.style.height = `${(rowRatios[idx] * 100).toFixed(6)}%`;
        });
      }
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "ns-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };
}

void init();
