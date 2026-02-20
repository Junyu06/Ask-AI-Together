const STORAGE_KEYS = {
  selectedSites: "oa_selected_sites",
  history: "oa_history",
  customSites: "oa_custom_sites",
  siteOrder: "oa_site_order",
  themeMode: "oa_theme_mode",
  siteUrlState: "oa_site_url_state"
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

const panesEl = document.getElementById("panes");
const promptEl = document.getElementById("prompt");
const historyListEl = document.getElementById("history-list");
const siteCheckboxesEl = document.getElementById("site-checkboxes");
const panelBackdropEl = document.getElementById("panel-backdrop");
const rightPanelEl = document.getElementById("right-panel");
const historyPanelEl = document.getElementById("history-panel");
const panelTitleEl = document.getElementById("panel-title");
const settingsSidebarEl = document.querySelector(".settings-sidebar");

const mediaDark = window.matchMedia("(prefers-color-scheme: dark)");

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
          <span class="site-drag-handle" data-site-id="${safeId}" title="拖拽排序" aria-label="拖拽排序"><svg class="icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 7h3M8 12h3M8 17h3M13 7h3M13 12h3M13 17h3"/></svg></span>
          <a class="open-link" href="${safeUrl}" target="_blank" rel="noopener noreferrer" aria-label="打开站点" title="打开站点"><svg class="icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3h7v7"/><path d="M10 14 21 3"/><path d="M21 14v7h-7"/><path d="M3 10V3h7"/><path d="m3 3 11 11"/></svg></a>
          ${canDelete ? `<button type="button" class="site-delete" data-site-id="${safeId}" aria-label="删除" title="删除"><svg class="icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button>` : ""}
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

function urlsForSelectedSites() {
  const result = {};
  selectedSiteIds.forEach((siteId) => {
    const fallback = getSiteById(siteId)?.url || "";
    const raw = siteUrlState[siteId] || fallback;
    if (typeof raw === "string" && /^https?:\/\//i.test(raw)) {
      result[siteId] = raw;
    }
  });
  return result;
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
      promptEl.value = item.prompt || "";
      promptEl.focus();
      autoResizePrompt();
    });
    historyListEl.appendChild(box);
  });
}

async function appendHistory(prompt) {
  const history = await loadHistory();
  const entry = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    prompt,
    ts: Date.now(),
    sites: selectedSiteIds
      .map(getSiteById)
      .filter(Boolean)
      .map((site) => site.name),
    urls: urlsForSelectedSites()
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

async function onSend() {
  const prompt = promptEl.value.trim();
  if (!prompt) return;
  sendToFrames("CHAT_MESSAGE", prompt);
  const entry = await appendHistory(prompt);
  pendingHistoryBySite = {};
  selectedSiteIds.forEach((siteId) => {
    pendingHistoryBySite[siteId] = entry.id;
  });
  promptEl.value = "";
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
  panelTitleEl.textContent = "设置";
  switchSettingsTab(tab);
  syncBackdropVisibility();
}

function openHistoryPanel() {
  rightPanelEl.classList.add("hidden");
  historyPanelEl.classList.remove("hidden");
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
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void onSend();
    }
  });
  promptEl.addEventListener("input", autoResizePrompt);

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
