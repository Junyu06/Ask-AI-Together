"use strict";

/**
 * 扩展选项页「窗口与站点」面板（站点勾选、布局、打开/平铺）。
 */
(function initOptionsSitePanel() {
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

  const siteListEl = document.getElementById("sw-site-list");
  const statusEl = document.getElementById("sw-target-status");
  const sendStatusEl = document.getElementById("sw-panel-status");

  if (!siteListEl || !statusEl) return;

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
    const modeEl = document.getElementById("sw-window-mode");
    const layoutEl = document.getElementById("sw-layout-preset");
    if (modeEl) modeEl.value = windowChromeMode === "normal" ? "normal" : "minimal";
    if (layoutEl) layoutEl.value = tileLayoutPreset;
  }

  function bindPrefsControls() {
    const modeEl = document.getElementById("sw-window-mode");
    const layoutEl = document.getElementById("sw-layout-preset");
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

  function setPanelStatus(text) {
    if (sendStatusEl) sendStatusEl.textContent = text || "";
  }

  async function doTile() {
    const siteIds = selectedSiteIdsOrdered();
    if (!siteIds.length) {
      setPanelStatus("请先勾选站点。");
      return;
    }
    const layoutEl = document.getElementById("sw-layout-preset");
    const layoutPreset = layoutEl ? layoutEl.value : tileLayoutPreset;
    const res = await chrome.runtime.sendMessage({
      type: "OA_BG_TILE",
      siteIds,
      sites: selectedSitesPayloadOrdered(),
      workArea: getWorkArea(),
      layoutPreset
    });
    if (!res?.ok) {
      setPanelStatus(`平铺失败：${res?.reason || res?.error || "无可用窗口"}`);
      return;
    }
    setPanelStatus("已按所选布局平铺（最多 4 个目标）。");
    await refreshState();
  }

  async function boot() {
    await loadStorage();
    applyPrefsToForm();
    bindPrefsControls();
    renderSiteList();
    await refreshState();
  }

  document.getElementById("sw-open-windows")?.addEventListener("click", async () => {
    const sites = selectedSitesPayloadOrdered();
    if (!sites.length) {
      setPanelStatus("请先勾选至少一个站点。");
      return;
    }
    setPanelStatus("正在打开窗口…");
    const res = await chrome.runtime.sendMessage({ type: "OA_BG_OPEN_WINDOWS", sites });
    if (!res?.ok) {
      setPanelStatus(`打开失败：${res?.error || "未知错误"}`);
      return;
    }
    await refreshState();
    setPanelStatus("正在按所选布局平铺…");
    await doTile();
  });

  document.getElementById("sw-tile")?.addEventListener("click", () => void doTile());
  document.getElementById("sw-retile")?.addEventListener("click", () => void doTile());

  document.getElementById("sw-focus")?.addEventListener("click", async () => {
    const siteIds = selectedSiteIdsOrdered();
    if (!siteIds.length) {
      setPanelStatus("请先勾选站点。");
      return;
    }
    const st = await chrome.runtime.sendMessage({
      type: "OA_BG_GET_STATE",
      sites: selectedSitesPayloadOrdered()
    });
    const targets = st?.targets || {};
    const target = siteIds.find((id) => targets[id]?.windowId);
    if (!target) {
      setPanelStatus("没有可聚焦的窗口：请先打开对应 AI 页签，或点「打开 / 复用窗口」。");
      return;
    }
    const res = await chrome.runtime.sendMessage({ type: "OA_BG_FOCUS", siteId: target });
    if (!res?.ok) {
      setPanelStatus("无法聚焦：窗口可能已关闭，请重新打开。");
      await refreshState();
      return;
    }
    setPanelStatus(`已聚焦 ${target}`);
  });

  document.getElementById("sw-refresh")?.addEventListener("click", () => void refreshState());

  window.__oaRefreshOptionsSettings = refreshState;

  void boot();
})();
