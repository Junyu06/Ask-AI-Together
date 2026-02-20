const STORAGE_KEYS = {
  selectedSites: "oa_selected_sites",
  history: "oa_history",
  customSites: "oa_custom_sites",
  siteOrder: "oa_site_order"
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

const panesEl = document.getElementById("panes");
const promptEl = document.getElementById("prompt");
const historyListEl = document.getElementById("history-list");
const siteCheckboxesEl = document.getElementById("site-checkboxes");

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

function gridColumns(count) {
  if (count <= 1) return "1fr";
  return `repeat(${count}, minmax(280px, 1fr))`;
}

function renderPanes() {
  const selectedSet = new Set(selectedSiteIds);
  const sites = orderedSites().filter((site) => selectedSet.has(site.id));
  panesEl.style.gridTemplateColumns = "";

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
  pane.innerHTML = `
    <iframe name="${site.name}" data-site-id="${site.id}" src="${site.url}" allow="clipboard-read; clipboard-write"></iframe>
  `;
  return pane;
}

function renderSiteSettings() {
  siteCheckboxesEl.innerHTML = "";
  orderedSites().forEach((site) => {
    const row = document.createElement("div");
    row.className = "site-card";
    row.draggable = true;
    row.dataset.siteId = site.id;
    const canDelete = site.id.startsWith("custom-");
    const tagText = canDelete ? "自定义" : "内置";
    row.innerHTML = `
      <div class="site-checkbox-content">
        <div class="left-section">
          <label class="toggle-switch">
            <input type="checkbox" value="${site.id}" ${selectedSiteIds.includes(site.id) ? "checked" : ""} />
            <span class="slider"></span>
          </label>
          <img src="${getFavicon(site.url)}" alt="${site.name}" class="site-icon" />
          <div class="site-name-block">
            <div class="site-main-name">${site.name}</div>
            <div class="site-sub-name">${site.url}</div>
          </div>
        </div>
        <div class="right-section">
          <button class="site-drag-handle" data-site-id="${site.id}" title="拖拽排序">⋮⋮</button>
          <span class="site-tag">${tagText}</span>
          <a class="open-link" href="${site.url}" target="_blank" rel="noopener noreferrer">打开</a>
          ${canDelete ? `<button class="site-delete" data-site-id="${site.id}">删除</button>` : ""}
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

function formatTime(ts) {
  return new Date(ts).toLocaleString();
}

async function renderHistory() {
  const history = await loadHistory();
  historyListEl.innerHTML = "";

  history.forEach((item) => {
    const box = document.createElement("div");
    box.className = "history-item";
    box.innerHTML = `
      <div class="prompt">${item.prompt}</div>
      <div class="meta">${formatTime(item.ts)} | ${item.sites.join(", ")}</div>
    `;
    historyListEl.appendChild(box);
  });
}

async function appendHistory(prompt) {
  const history = await loadHistory();
  history.unshift({
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    prompt,
    ts: Date.now(),
    sites: selectedSiteIds
      .map(getSiteById)
      .filter(Boolean)
      .map((site) => site.name),
    urls: { ...siteUrlState }
  });
  const keep = history.slice(0, 200);
  await chrome.storage.local.set({ [STORAGE_KEYS.history]: keep });
  await renderHistory();
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
  await appendHistory(prompt);
  promptEl.value = "";
  promptEl.focus();
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

  const siteSettings = document.getElementById("site-settings");
  const history = document.getElementById("history");
  document.getElementById("site-settings-btn").addEventListener("click", () => {
    history.classList.add("hidden");
    siteSettings.classList.toggle("hidden");
  });
  document.getElementById("site-settings-close").addEventListener("click", () => {
    siteSettings.classList.add("hidden");
  });
  document.getElementById("save-sites").addEventListener("click", () => {
    const checked = Array.from(siteCheckboxesEl.querySelectorAll("input:checked")).map((x) => x.value);
    const checkedSet = new Set(checked.length > 0 ? checked : defaultSiteIds);
    selectedSiteIds = siteOrder.filter((id) => checkedSet.has(id));
    saveSelectedSites();
    renderPanes();
    siteSettings.classList.add("hidden");
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
      customSites.push({
        id,
        name,
        url: parsed.toString()
      });
      siteOrder.push(id);
      await saveCustomSites();
      await saveSiteOrder();
      renderSiteSettings();
      nameInput.value = "";
      urlInput.value = "";
      customForm.classList.add("hidden");
    } catch (_error) {
      // Keep UI simple: invalid URL is ignored.
    }
  });

  document.getElementById("history-btn").addEventListener("click", async () => {
    siteSettings.classList.add("hidden");
    await renderHistory();
    history.classList.toggle("hidden");
  });
  document.getElementById("history-close").addEventListener("click", () => {
    history.classList.add("hidden");
  });
  document.getElementById("history-clear").addEventListener("click", async () => {
    await chrome.storage.local.set({ [STORAGE_KEYS.history]: [] });
    await renderHistory();
  });

  window.addEventListener("message", (event) => {
    if (!event.data || event.data.type !== "UPDATE_HISTORY") return;
    const payload = event.data.payload || {};
    if (payload.siteId && payload.url) {
      siteUrlState[payload.siteId] = payload.url;
    }
  });

  initDraggable("input-bubble", "input-bubble-handle", { clearCenterOnDrag: true });
  initDraggable("site-settings", "site-settings-handle");
  initDraggable("history", "history-handle");
}

function initDraggable(targetId, handleId, options = {}) {
  const target = document.getElementById(targetId);
  const handle = document.getElementById(handleId);
  if (!target || !handle) return;

  let dragging = false;
  let startX = 0;
  let startY = 0;
  let baseLeft = 0;
  let baseTop = 0;

  handle.addEventListener("mousedown", (e) => {
    dragging = true;
    const rect = target.getBoundingClientRect();
    target.style.left = `${rect.left}px`;
    target.style.top = `${rect.top}px`;
    target.style.bottom = "auto";
    if (options.clearCenterOnDrag) {
      target.style.transform = "none";
    }
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
  normalizeOrderAndSelection();
  await saveSiteOrder();
  saveSelectedSites();
  renderPanes();
  renderSiteSettings();
  await renderHistory();
  bindEvents();
}

function initSiteDragSort() {
  const cards = Array.from(siteCheckboxesEl.querySelectorAll(".site-card"));
  if (!cards.length) return;

  let draggingEl = null;
  let draggingSiteId = "";
  let dropped = false;

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

  cards.forEach((card) => {
    card.ondragstart = (event) => {
      const source = event.target;
      if (source instanceof HTMLElement && source.closest('input, a, button, .site-delete, .open-link')) {
        event.preventDefault();
        return;
      }
      dropped = false;
      draggingEl = card;
      draggingSiteId = card.dataset.siteId || "";
      card.classList.add("dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", draggingSiteId);
    };
    card.ondragend = () => {
      card.classList.remove("dragging");
      if (!dropped && draggingSiteId) {
        void persistSiteOrderFromDom();
      }
      draggingEl = null;
      draggingSiteId = "";
      dropped = false;
    };
  });

  siteCheckboxesEl.ondragover = (event) => {
    event.preventDefault();
    if (!draggingEl) return;
    const candidates = Array.from(siteCheckboxesEl.querySelectorAll(".site-card")).filter((card) => card !== draggingEl);
    let next = null;
    for (const card of candidates) {
      const rect = card.getBoundingClientRect();
      const midpoint = rect.top + rect.height / 2;
      if (event.clientY < midpoint) {
        next = card;
        break;
      }
    }
    siteCheckboxesEl.insertBefore(draggingEl, next);
  };

  siteCheckboxesEl.ondrop = async (event) => {
    event.preventDefault();
    const draggedId = draggingSiteId || event.dataTransfer.getData("text/plain");
    if (!draggedId) return;
    dropped = true;
    if (draggingEl) draggingEl.classList.remove("dragging");
    await persistSiteOrderFromDom();
    draggingEl = null;
    draggingSiteId = "";
  };
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
