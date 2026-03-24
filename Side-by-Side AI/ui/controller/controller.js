"use strict";

const STORAGE_KEYS = {
  selectedSites: "oa_selected_sites",
  customSites: "oa_custom_sites",
  siteOrder: "oa_site_order",
  windowChromeMode: "oa_window_chrome_mode",
  tileLayoutPreset: "oa_tile_layout_preset"
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

let customSites = [];
let siteOrder = [];
let selectedSiteIds = [];
/** @type {"minimal"|"normal"} */
let windowChromeMode = "minimal";
let tileLayoutPreset = "auto";

const siteListEl = document.getElementById("controller-site-list");
const statusEl = document.getElementById("controller-target-status");
const promptEl = document.getElementById("controller-prompt");
const sendStatusEl = document.getElementById("controller-send-status");

function allSites() {
  return [...BUILTIN_SITES, ...customSites];
}

function getSiteById(id) {
  return allSites().find((s) => s.id === id);
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

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

async function loadStorage() {
  const data = await chrome.storage.local.get([
    STORAGE_KEYS.selectedSites,
    STORAGE_KEYS.customSites,
    STORAGE_KEYS.siteOrder,
    STORAGE_KEYS.windowChromeMode,
    STORAGE_KEYS.tileLayoutPreset
  ]);
  customSites = Array.isArray(data[STORAGE_KEYS.customSites]) ? data[STORAGE_KEYS.customSites] : [];
  siteOrder = Array.isArray(data[STORAGE_KEYS.siteOrder]) ? data[STORAGE_KEYS.siteOrder] : [];
  const rawSel = data[STORAGE_KEYS.selectedSites];
  if (Array.isArray(rawSel) && rawSel.length) {
    selectedSiteIds = rawSel.filter((id) => getSiteById(id));
  } else {
    selectedSiteIds = ["chatgpt", "deepseek", "kimi"];
  }
  windowChromeMode = data[STORAGE_KEYS.windowChromeMode] === "normal" ? "normal" : "minimal";
  const rawLayout = String(data[STORAGE_KEYS.tileLayoutPreset] || "auto");
  const allowed = new Set([
    "auto",
    "horizontal",
    "vertical",
    "two-top-one-bottom",
    "one-left-two-right",
    "grid-2x2"
  ]);
  tileLayoutPreset = allowed.has(rawLayout) ? rawLayout : "auto";
}

function applyPrefsToForm() {
  const modeEl = document.getElementById("controller-window-mode");
  const layoutEl = document.getElementById("controller-layout-preset");
  if (modeEl) modeEl.value = windowChromeMode === "normal" ? "normal" : "minimal";
  if (layoutEl) layoutEl.value = tileLayoutPreset;
}

function bindPrefsControls() {
  const modeEl = document.getElementById("controller-window-mode");
  const layoutEl = document.getElementById("controller-layout-preset");
  if (modeEl) {
    modeEl.addEventListener("change", () => {
      windowChromeMode = modeEl.value === "normal" ? "normal" : "minimal";
      chrome.storage.local.set({
        [STORAGE_KEYS.windowChromeMode]: windowChromeMode
      });
    });
  }
  if (layoutEl) {
    layoutEl.addEventListener("change", () => {
      tileLayoutPreset = layoutEl.value;
      chrome.storage.local.set({
        [STORAGE_KEYS.tileLayoutPreset]: tileLayoutPreset
      });
    });
  }
}

function saveSelectedSites() {
  chrome.storage.local.set({ [STORAGE_KEYS.selectedSites]: selectedSiteIds });
}

function getWorkArea() {
  return {
    left: window.screen.availLeft ?? 0,
    top: window.screen.availTop ?? 0,
    width: window.screen.availWidth ?? 1280,
    height: window.screen.availHeight ?? 800
  };
}

function renderSiteList() {
  siteListEl.innerHTML = "";
  orderedSites().forEach((site) => {
    const li = document.createElement("li");
    li.className = "controller-site-row";
    const checked = selectedSiteIds.includes(site.id);
    li.innerHTML = `
      <label class="controller-site-label">
        <input type="checkbox" value="${escapeHtml(site.id)}" ${checked ? "checked" : ""} />
        <span class="controller-site-name">${escapeHtml(site.name)}</span>
        <span class="controller-site-url">${escapeHtml(site.url)}</span>
      </label>
    `;
    siteListEl.appendChild(li);
  });

  siteListEl.querySelectorAll('input[type="checkbox"]').forEach((input) => {
    input.addEventListener("change", () => {
      const id = input.value;
      if (input.checked) {
        if (!selectedSiteIds.includes(id)) selectedSiteIds.push(id);
      } else {
        selectedSiteIds = selectedSiteIds.filter((x) => x !== id);
      }
      saveSelectedSites();
      void refreshState();
    });
  });
}

/** 与设置里站点顺序一致，供平铺/绑定/发送顺序使用 */
function selectedSitesPayloadOrdered() {
  return selectedSiteIdsOrdered()
    .map((id) => {
      const site = getSiteById(id);
      if (!site) return null;
      return { siteId: site.id, url: site.url };
    })
    .filter(Boolean);
}

function selectedSiteIdsOrdered() {
  const set = new Set(selectedSiteIds);
  return orderedSites()
    .map((s) => s.id)
    .filter((id) => set.has(id));
}

async function refreshState() {
  const res = await chrome.runtime.sendMessage({
    type: "OA_BG_GET_STATE",
    sites: selectedSitesPayloadOrdered()
  });
  const targets = res?.targets || {};
  const rows = selectedSiteIdsOrdered().map((siteId) => {
    const site = getSiteById(siteId);
    const name = site?.name || siteId;
    const t = targets[siteId];
    const ok = !!(t && t.windowId && t.tabId);
    return `<div class="controller-chip ${ok ? "controller-chip-ok" : "controller-chip-miss"}">${escapeHtml(name)}：${
      ok ? `窗口 #${t.windowId}` : "未打开或已关闭"
    }</div>`;
  });
  statusEl.innerHTML = rows.length ? rows.join("") : '<div class="controller-chip controller-chip-miss">未选择站点</div>';
}

function setSendStatus(text) {
  sendStatusEl.textContent = text || "";
}

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || !msg.type) return;
  if (msg.type === "OA_QUOTE_TEXT" && msg.payload?.text) {
    const t = String(msg.payload.text || "");
    promptEl.value = promptEl.value ? `${promptEl.value}\n${t}` : t;
  }
  if (msg.type === "OA_SEND_PROGRESS" && msg.payload) {
    const { siteId, phase, requestId } = msg.payload;
    setSendStatus(`[${siteId}] ${phase}${requestId ? ` · ${requestId}` : ""}`);
  }
});

document.getElementById("controller-open-windows").addEventListener("click", async () => {
  const sites = selectedSitesPayloadOrdered();
  if (!sites.length) {
    setSendStatus("请先勾选至少一个站点。");
    return;
  }
  setSendStatus("正在打开窗口…");
  const res = await chrome.runtime.sendMessage({ type: "OA_BG_OPEN_WINDOWS", sites });
  if (!res?.ok) {
    setSendStatus(`打开失败：${res?.error || "未知错误"}`);
    return;
  }
  await refreshState();
  setSendStatus("正在按所选布局平铺…");
  await doTile();
});

async function doTile() {
  const siteIds = selectedSiteIdsOrdered();
  if (!siteIds.length) {
    setSendStatus("请先勾选站点。");
    return;
  }
  const layoutEl = document.getElementById("controller-layout-preset");
  const layoutPreset = layoutEl ? layoutEl.value : tileLayoutPreset;
  const res = await chrome.runtime.sendMessage({
    type: "OA_BG_TILE",
    siteIds,
    sites: selectedSitesPayloadOrdered(),
    workArea: getWorkArea(),
    layoutPreset
  });
  if (!res?.ok) {
    setSendStatus(`平铺失败：${res?.reason || res?.error || "无可用窗口"}`);
    return;
  }
  setSendStatus("已按所选布局平铺（最多 4 个目标）。");
  await refreshState();
}

document.getElementById("controller-tile").addEventListener("click", () => void doTile());

document.getElementById("controller-retile").addEventListener("click", () => void doTile());

document.getElementById("controller-focus").addEventListener("click", async () => {
  const siteIds = selectedSiteIdsOrdered();
  if (!siteIds.length) {
    setSendStatus("请先勾选站点。");
    return;
  }
  const st = await chrome.runtime.sendMessage({
    type: "OA_BG_GET_STATE",
    sites: selectedSitesPayloadOrdered()
  });
  const targets = st?.targets || {};
  const target = siteIds.find((id) => targets[id]?.windowId);
  if (!target) {
    setSendStatus("没有可聚焦的窗口：请先打开对应 AI 页签，或点「打开 / 复用窗口」，再试「刷新状态」。");
    return;
  }
  const res = await chrome.runtime.sendMessage({ type: "OA_BG_FOCUS", siteId: target });
  if (!res?.ok) {
    setSendStatus("无法聚焦：窗口可能已关闭，请重新打开。");
    await refreshState();
    return;
  }
  setSendStatus(`已聚焦 ${target}`);
});

document.getElementById("controller-send").addEventListener("click", async () => {
  const siteIds = selectedSiteIdsOrdered();
  if (!siteIds.length) {
    setSendStatus("请先勾选站点。");
    return;
  }
  const message = String(promptEl.value || "");
  const requestId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  setSendStatus("正在发送…");
  const res = await chrome.runtime.sendMessage({
    type: "OA_BG_SEND_PROMPT",
    siteIds,
    sites: selectedSitesPayloadOrdered(),
    message,
    requestId
  });
  if (!res?.ok) {
    setSendStatus(`发送失败：${res?.error || "未知错误"}`);
    return;
  }
});

document.getElementById("controller-new-chat").addEventListener("click", async () => {
  const siteIds = selectedSiteIdsOrdered();
  if (!siteIds.length) {
    setSendStatus("请先勾选站点。");
    return;
  }
  await chrome.runtime.sendMessage({
    type: "OA_BG_NEW_CHAT",
    siteIds,
    sites: selectedSitesPayloadOrdered()
  });
  setSendStatus("已请求各站点新对话。");
});

document.getElementById("controller-refresh").addEventListener("click", () => void refreshState());

document.getElementById("controller-open-switcher").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "OA_BG_OPEN_SWITCHER" });
  setSendStatus("已请求打开常驻切换小窗（可拖到角落，关闭即退出）。");
});

document.getElementById("controller-open-switcher-pip").addEventListener("click", async () => {
  try {
    await openSwitcherAsDocumentPictureInPicture();
    setSendStatus("已打开画中画常驻条（系统级置顶）。若未出现，请检查 Chrome 版本是否支持 Document PiP。");
  } catch (e) {
    setSendStatus(`画中画失败：${e?.message || String(e)}`);
  }
});

async function init() {
  await loadStorage();
  applyPrefsToForm();
  bindPrefsControls();
  renderSiteList();
  await refreshState();
}

void init();
