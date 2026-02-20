const STORAGE_KEYS = {
  selectedSites: "oa_selected_sites",
  history: "oa_history",
  customSites: "oa_custom_sites",
  siteOrder: "oa_site_order",
  themeMode: "oa_theme_mode",
  siteUrlState: "oa_site_url_state",
  localeMode: "oa_locale_mode"
};

const BUILTIN_SITES = [
  { id: "chatgpt", name: "ChatGPT", url: "https://chatgpt.com/" },
  { id: "deepseek", name: "DeepSeek", url: "https://chat.deepseek.com/" },
  { id: "kimi", name: "Kimi", url: "https://www.kimi.com/" },
  { id: "qwen", name: "Qwen", url: "https://chat.qwen.ai/" },
  { id: "doubao", name: "Doubao", url: "https://www.doubao.com/" },
  { id: "yuanbao", name: "Yuanbao", url: "https://yuanbao.tencent.com/" },
  { id: "grok", name: "Grok", url: "https://grok.com/" },
  { id: "gemini", name: "Gemini", url: "https://gemini.google.com/" }
];

const defaultSiteIds = ["chatgpt", "deepseek", "kimi"];

let selectedSiteIds = [];
let siteUrlState = {};
let customSites = [];
let siteOrder = [];
let paneRatios = [];
let themeMode = "system";
let pendingHistoryBySite = {};
let isComposing = false;
let mentionState = null;
let mentionSiteIds = [];
let localeMode = "auto";

const panesEl = document.getElementById("panes");
const promptEl = document.getElementById("prompt");
const historyListEl = document.getElementById("history-list");
const siteCheckboxesEl = document.getElementById("site-checkboxes");
const panelBackdropEl = document.getElementById("panel-backdrop");
const rightPanelEl = document.getElementById("right-panel");
const historyPanelEl = document.getElementById("history-panel");
const panelTitleEl = document.getElementById("panel-title");
const settingsSidebarEl = document.querySelector(".settings-sidebar");
const mentionDropdownEl = document.getElementById("mention-dropdown");
const mentionChipsEl = document.getElementById("mention-chips");

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
    prompt_placeholder: "输入问题，支持 @ 选择指定 AI；回车发送（Shift+Enter 换行）",
    send: "发送",
    close: "关闭",
    settings_categories: "设置类别",
    sites_tab: "站点",
    appearance_tab: "外观",
    sites_subtitle: "站点选择与排序",
    save: "保存",
    add_site: "添加站点",
    site_name: "站点名称",
    site_url: "站点地址",
    site_name_placeholder: "站点名称，例如 Perplexity",
    site_url_placeholder: "站点地址，例如 https://www.perplexity.ai/",
    cancel: "取消",
    add: "添加",
    theme_mode: "主题模式",
    language_mode: "语言",
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
    remove: "移除"
  },
  en: {
    input_bubble_aria: "Input and actions",
    toolbar_aria: "Toolbar",
    settings_title: "Settings",
    history_title: "History",
    new_chat: "New Chat",
    selected_sites: "Selected Sites",
    prompt_label: "Prompt",
    prompt_placeholder: "Message... @ targets AI. Enter sends.",
    send: "Send",
    close: "Close",
    settings_categories: "Settings categories",
    sites_tab: "Sites",
    appearance_tab: "Appearance",
    sites_subtitle: "Site selection and sorting",
    save: "Save",
    add_site: "Add Site",
    site_name: "Site Name",
    site_url: "Site URL",
    site_name_placeholder: "Site name, e.g. Perplexity",
    site_url_placeholder: "Site URL, e.g. https://www.perplexity.ai/",
    cancel: "Cancel",
    add: "Add",
    theme_mode: "Theme Mode",
    language_mode: "Language",
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
    remove: "Remove"
  }
};
let locale = "en";

function t(key) {
  return I18N[locale]?.[key] || I18N.en[key] || key;
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
  await renderHistory();
  panelTitleEl.textContent = !rightPanelEl.classList.contains("hidden") ? t("settings_title") : t("history_title");
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

  if (!sites.length) {
    panesEl.innerHTML = "";
    return;
  }

  if (paneRatios.length !== sites.length) {
    paneRatios = Array.from({ length: sites.length }, () => 1 / sites.length);
  }

  const existingPaneMap = new Map(
    Array.from(panesEl.querySelectorAll(".pane")).map((pane) => [pane.dataset.siteId, pane])
  );
  const frag = document.createDocumentFragment();

  sites.forEach((site, index) => {
    const pane = existingPaneMap.get(site.id) || createPane(site);
    pane.dataset.index = String(index);
    pane.style.width = `${paneRatios[index] * 100}%`;
    frag.appendChild(pane);

    if (index < sites.length - 1) {
      const resizer = document.createElement("div");
      resizer.className = "pane-resizer";
      resizer.dataset.index = String(index);
      frag.appendChild(resizer);
    }
  });

  panesEl.replaceChildren(frag);
  initPaneResizers();
}

function createPane(site) {
  const pane = document.createElement("div");
  pane.className = "pane";
  pane.dataset.siteId = site.id;
  pane.innerHTML = `<iframe name="${site.name}" data-site-id="${site.id}" src="${site.url}" allow="clipboard-read; clipboard-write"></iframe>`;
  return pane;
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
  return new Date(ts).toLocaleString();
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

async function applyHistoryItem(item) {
  const urls = item && item.urls && typeof item.urls === "object" ? item.urls : {};
  const candidateIds = Object.keys(urls).filter((siteId) => getSiteById(siteId) && isHttpUrl(urls[siteId]));
  if (candidateIds.length) {
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
      if (frame.src !== url) frame.src = url;
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
    const meta = `${formatTime(item.ts)} | ${escapeHtml((item.sites || []).join(", "))}`;
    box.innerHTML = `
      <div class="prompt">${prompt}</div>
      <div class="meta">${meta}</div>
      ${buildHistoryLinks(item)}
    `;
    box.addEventListener("click", (event) => {
      if (event.target.closest("a")) return;
      void applyHistoryItem(item);
      promptEl.value = item.prompt || "";
      promptEl.focus();
      autoResizePrompt();
      closePanels();
    });
    historyListEl.appendChild(box);
  });
}

async function appendHistory(prompt, siteIds = selectedSiteIds) {
  const history = await loadHistory();
  const validSiteIds = Array.isArray(siteIds) ? siteIds.filter((id) => getSiteById(id)) : [];
  const entry = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    prompt,
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

function sendToFrames(type, message) {
  const frames = Array.from(document.querySelectorAll("iframe"));
  frames.forEach((frame) => {
    frame.contentWindow.postMessage({ type, message, config: { siteId: frame.dataset.siteId } }, "*");
  });
}

function sendToTargetFrames(type, message, targetSiteIds) {
  const targetSet = new Set(targetSiteIds);
  const frames = Array.from(document.querySelectorAll("iframe"));
  frames.forEach((frame) => {
    if (!targetSet.has(frame.dataset.siteId)) return;
    frame.contentWindow.postMessage({ type, message, config: { siteId: frame.dataset.siteId } }, "*");
  });
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

function getMentionContext() {
  const value = promptEl.value;
  const caret = promptEl.selectionStart ?? value.length;
  const atPos = value.lastIndexOf("@", Math.max(0, caret - 1));
  if (atPos < 0) return null;
  const before = atPos > 0 ? value[atPos - 1] : "";
  if (before && !/\s/.test(before)) return null;
  const token = value.slice(atPos + 1, caret);
  if (/\s/.test(token)) return null;
  return { atPos, caret, token };
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
  if (mentionSiteIds.includes(site.id)) {
    mentionSiteIds = mentionSiteIds.filter((id) => id !== site.id);
  } else {
    mentionSiteIds.push(site.id);
  }
  renderMentionChips();
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
  const ctx = getMentionContext();
  if (!ctx) {
    hideMentionDropdown();
    return;
  }

  const candidates = getMentionCandidates(ctx.token);
  if (!candidates.length) {
    hideMentionDropdown();
    return;
  }

  mentionState = {
    atPos: ctx.atPos,
    caret: ctx.caret,
    token: ctx.token,
    candidates,
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
      <span class="id">@${escapeHtml(site.id)}</span>
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
  if (!message) return;

  const targetSiteIds = mentionSiteIds.length ? [...mentionSiteIds] : [...selectedSiteIds];
  if (!targetSiteIds.length) return;

  if (mentionSiteIds.length) {
    sendToTargetFrames("CHAT_MESSAGE", message, targetSiteIds);
  } else {
    sendToFrames("CHAT_MESSAGE", message);
  }

  const entry = await appendHistory(message, targetSiteIds);
  pendingHistoryBySite = {};
  targetSiteIds.forEach((siteId) => {
    pendingHistoryBySite[siteId] = entry.id;
  });
  promptEl.value = "";
  mentionSiteIds = [];
  renderMentionChips();
  autoResizePrompt();
  promptEl.focus();
}

function autoResizePrompt() {
  promptEl.style.height = "auto";
  promptEl.style.height = `${Math.min(promptEl.scrollHeight, 200)}px`;
}

function openSettingsPanel(tab = "sites") {
  historyPanelEl.classList.add("hidden");
  rightPanelEl.classList.remove("hidden");
  panelTitleEl.textContent = t("settings_title");
  switchSettingsTab(tab);
  syncBackdropVisibility();
}

function openHistoryPanel() {
  rightPanelEl.classList.add("hidden");
  historyPanelEl.classList.remove("hidden");
  panelTitleEl.textContent = t("history_title");
  syncBackdropVisibility();
}

function closePanels() {
  rightPanelEl.classList.add("hidden");
  historyPanelEl.classList.add("hidden");
  syncBackdropVisibility();
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
  document.getElementById("send").addEventListener("click", onSend);
  document.getElementById("new-chat").addEventListener("click", () => {
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

  document.getElementById("save-sites").addEventListener("click", () => {
    const checked = Array.from(siteCheckboxesEl.querySelectorAll("input:checked")).map((x) => x.value);
    const checkedSet = new Set(checked.length > 0 ? checked : defaultSiteIds);
    selectedSiteIds = siteOrder.filter((id) => checkedSet.has(id));
    mentionSiteIds = mentionSiteIds.filter((id) => checkedSet.has(id));
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

  mediaDark.addEventListener("change", () => {
    if (themeMode === "system") applyTheme();
  });

  window.addEventListener("message", (event) => {
    if (!event.data || event.data.type !== "UPDATE_HISTORY") return;
    const payload = event.data.payload || {};
    if (payload.siteId && payload.url) {
      siteUrlState[payload.siteId] = payload.url;
      void saveSiteUrlState();
      const pendingEntryId = pendingHistoryBySite[payload.siteId];
      if (pendingEntryId) {
        delete pendingHistoryBySite[payload.siteId];
        void patchHistoryUrl(pendingEntryId, payload.siteId, payload.url);
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
  applyI18n();
  normalizeOrderAndSelection();
  await saveSiteOrder();
  saveSelectedSites();
  renderPanes();
  renderSiteSettings();
  await renderHistory();
  applyTheme();
  autoResizePrompt();
  bindEvents();
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
  if (!resizers.length || panes.length < 2) return;

  resizers.forEach((resizer) => {
    resizer.onmousedown = (event) => {
      event.preventDefault();
      const leftIndex = Number(resizer.dataset.index);
      const leftPane = panes[leftIndex];
      const rightPane = panes[leftIndex + 1];
      if (!leftPane || !rightPane) return;

      const containerRect = panesEl.getBoundingClientRect();
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
        const widths = panes.map((pane) => pane.getBoundingClientRect().width);
        const total = widths.reduce((sum, width) => sum + width, 0) || containerRect.width;
        paneRatios = widths.map((width) => width / total);
        panes.forEach((pane, idx) => {
          pane.style.width = `${paneRatios[idx] * 100}%`;
        });
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
  });
}

void init();
