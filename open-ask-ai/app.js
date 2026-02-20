const STORAGE_KEYS = {
  selectedSites: "oa_selected_sites",
  history: "oa_history"
};

const SITES = [
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

const panesEl = document.getElementById("panes");
const promptEl = document.getElementById("prompt");
const historyListEl = document.getElementById("history-list");
const siteCheckboxesEl = document.getElementById("site-checkboxes");

function getSiteById(id) {
  return SITES.find((site) => site.id === id);
}

function gridColumns(count) {
  if (count <= 1) return "1fr";
  return `repeat(${count}, minmax(280px, 1fr))`;
}

function renderPanes() {
  const sites = selectedSiteIds.map(getSiteById).filter(Boolean);
  panesEl.innerHTML = "";
  panesEl.style.gridTemplateColumns = gridColumns(sites.length);

  sites.forEach((site) => {
    const pane = document.createElement("div");
    pane.className = "pane";
    pane.innerHTML = `
      <iframe name="${site.name}" data-site-id="${site.id}" src="${site.url}" allow="clipboard-read; clipboard-write"></iframe>
    `;
    panesEl.appendChild(pane);
  });
}

function renderSiteSettings() {
  siteCheckboxesEl.innerHTML = "";
  SITES.forEach((site) => {
    const row = document.createElement("label");
    row.className = "site-item";
    row.innerHTML = `
      <input type="checkbox" value="${site.id}" ${selectedSiteIds.includes(site.id) ? "checked" : ""} />
      <span>${site.name}</span>
    `;
    siteCheckboxesEl.appendChild(row);
  });
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
    selectedSiteIds = checked.length > 0 ? checked : [...defaultSiteIds];
    saveSelectedSites();
    renderPanes();
    siteSettings.classList.add("hidden");
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

  initDockDrag();
}

function initDockDrag() {
  const dock = document.getElementById("floating-dock");
  const handle = document.getElementById("dock-handle");
  if (!dock || !handle) return;

  let dragging = false;
  let startX = 0;
  let startY = 0;
  let baseLeft = 0;
  let baseTop = 0;

  handle.addEventListener("mousedown", (e) => {
    dragging = true;
    const rect = dock.getBoundingClientRect();
    dock.style.left = `${rect.left}px`;
    dock.style.top = `${rect.top}px`;
    dock.style.bottom = "auto";
    dock.style.transform = "none";
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
    const maxLeft = window.innerWidth - dock.offsetWidth;
    const maxTop = window.innerHeight - dock.offsetHeight;
    const clampedLeft = Math.max(0, Math.min(maxLeft, nextLeft));
    const clampedTop = Math.max(0, Math.min(maxTop, nextTop));
    dock.style.left = `${clampedLeft}px`;
    dock.style.top = `${clampedTop}px`;
  });

  window.addEventListener("mouseup", () => {
    dragging = false;
    document.body.style.userSelect = "";
  });
}

async function init() {
  await loadSelectedSites();
  renderPanes();
  renderSiteSettings();
  await renderHistory();
  bindEvents();
}

void init();
