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

  function t(key, vars = {}) {
    const i18n = window.OA_OPTIONS_I18N;
    if (i18n?.format) return i18n.format(key, vars);
    return key;
  }

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

  function normalizeSiteOrder(nextOrder = siteOrder) {
    const validIds = new Set(allSites().map((site) => site.id));
    const seen = new Set();
    const normalized = [];
    (Array.isArray(nextOrder) ? nextOrder : []).forEach((id) => {
      const cleanId = String(id || "");
      if (!cleanId || !validIds.has(cleanId) || seen.has(cleanId)) return;
      seen.add(cleanId);
      normalized.push(cleanId);
    });
    allSites().forEach((site) => {
      if (seen.has(site.id)) return;
      seen.add(site.id);
      normalized.push(site.id);
    });
    return normalized;
  }

  function saveSiteOrder(nextOrder = siteOrder) {
    siteOrder = normalizeSiteOrder(nextOrder);
    chrome.storage.local.set({ [STORAGE_KEYS.siteOrder]: siteOrder });
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
    siteOrder = normalizeSiteOrder(siteOrder);
    const rawLayout = String(data[STORAGE_KEYS.tileLayoutPreset] || "auto");
    const allowed = new Set([
      "auto",
      "horizontal",
      "vertical",
      "focus-left",
      "focus-top",
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
      li.className = "site-card";
      li.dataset.siteId = site.id;
      const checked = selectedSiteIds.includes(site.id);
      const dragSortLabel = escapeHtml(t("drag_sort"));
      li.innerHTML = `
        <label class="site-checkbox-content controller-site-label">
          <span class="left-section">
            <span class="toggle-switch">
              <input type="checkbox" value="${escapeHtml(site.id)}" ${checked ? "checked" : ""} />
              <span class="slider"></span>
            </span>
            <span>
              <span class="site-main-name controller-site-name">${escapeHtml(site.name)}</span>
              <span class="site-sub-name controller-site-url">${escapeHtml(site.url)}</span>
            </span>
          </span>
          <span class="right-section site-order-actions">
            <span class="site-action site-drag-handle" data-site-id="${escapeHtml(site.id)}" aria-label="${dragSortLabel}" title="${dragSortLabel}">
              <svg class="icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 7h3M8 12h3M8 17h3M13 7h3M13 12h3M13 17h3"/></svg>
            </span>
          </span>
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
    initSiteDragSort();
  }

  function initSiteDragSort() {
    const cards = Array.from(siteListEl.querySelectorAll(".site-card"));
    if (!cards.length) return;

    async function persistSiteOrderFromDom() {
      const orderedIds = Array.from(siteListEl.querySelectorAll(".site-card"))
        .map((el) => el.dataset.siteId)
        .filter(Boolean);
      if (!orderedIds.length) return;
      saveSiteOrder(orderedIds);
      const selectedSet = new Set(selectedSiteIds);
      selectedSiteIds = siteOrder.filter((id) => selectedSet.has(id));
      saveSelectedSites();
      await refreshState();
    }

    function moveCardToPosition(draggingEl, clientY) {
      const candidates = Array.from(siteListEl.querySelectorAll(".site-card")).filter((card) => card !== draggingEl);
      let next = null;
      for (const card of candidates) {
        const rect = card.getBoundingClientRect();
        if (clientY < rect.top + rect.height / 2) {
          next = card;
          break;
        }
      }
      siteListEl.insertBefore(draggingEl, next);
    }

    siteListEl.querySelectorAll(".site-drag-handle").forEach((handle) => {
      const card = handle.closest(".site-card");
      if (!card) return;

      handle.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();
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
      const target = targets[siteId];
      const ok = !!(target && target.windowId && target.tabId);
      return `<div class="controller-chip ${ok ? "controller-chip-ok" : "controller-chip-miss"}">${escapeHtml(
        ok ? t("settings_state_open", { name, windowId: target.windowId }) : t("settings_state_closed", { name })
      )}</div>`;
    });
    statusEl.innerHTML = rows.length
      ? rows.join("")
      : `<div class="controller-chip controller-chip-miss">${escapeHtml(t("settings_state_missing"))}</div>`;
  }

  function setPanelStatus(text) {
    if (sendStatusEl) sendStatusEl.textContent = text || "";
  }

  async function doTile() {
    const siteIds = selectedSiteIdsOrdered();
    if (!siteIds.length) {
      setPanelStatus(t("settings_pick_sites"));
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
      setPanelStatus(t("settings_tile_failed", { reason: res?.reason || res?.error || "no-windows" }));
      return;
    }
    setPanelStatus(t("settings_tiled"));
    await refreshState();
  }

  async function boot() {
    await window.OA_OPTIONS_I18N?.ready?.();
    await loadStorage();
    applyPrefsToForm();
    bindPrefsControls();
    renderSiteList();
    await refreshState();
  }

  document.getElementById("sw-open-windows")?.addEventListener("click", async () => {
    const sites = selectedSitesPayloadOrdered();
    if (!sites.length) {
      setPanelStatus(t("settings_pick_one_site"));
      return;
    }
    setPanelStatus(t("settings_opening"));
    const res = await chrome.runtime.sendMessage({ type: "OA_BG_OPEN_WINDOWS", sites });
    if (!res?.ok) {
      setPanelStatus(t("settings_open_failed", { reason: res?.error || "unknown" }));
      return;
    }
    await refreshState();
    setPanelStatus(t("settings_tiling"));
    await doTile();
  });

  document.getElementById("sw-tile")?.addEventListener("click", () => void doTile());
  document.getElementById("sw-retile")?.addEventListener("click", () => void doTile());

  document.getElementById("sw-focus")?.addEventListener("click", async () => {
    const siteIds = selectedSiteIdsOrdered();
    if (!siteIds.length) {
      setPanelStatus(t("settings_pick_sites"));
      return;
    }
    const st = await chrome.runtime.sendMessage({
      type: "OA_BG_GET_STATE",
      sites: selectedSitesPayloadOrdered()
    });
    const targets = st?.targets || {};
    const target = siteIds.find((id) => targets[id]?.windowId);
    if (!target) {
      setPanelStatus(t("settings_focus_missing"));
      return;
    }
    const res = await chrome.runtime.sendMessage({ type: "OA_BG_FOCUS", siteId: target });
    if (!res?.ok) {
      setPanelStatus(t("settings_focus_failed"));
      await refreshState();
      return;
    }
    setPanelStatus(t("settings_focus_done", { target }));
  });

  document.getElementById("sw-close")?.addEventListener("click", async () => {
    setPanelStatus(t("settings_close_all_running"));
    const res = await chrome.runtime.sendMessage({ type: "OA_BG_CLOSE_ALL_TARGETS" });
    if (!res?.ok) {
      setPanelStatus(t("settings_close_all_failed", { reason: res?.error || "unknown" }));
      return;
    }
    await refreshState();
    setPanelStatus(t("settings_close_all_done", { count: res.closedCount || 0 }));
  });

  document.getElementById("sw-refresh")?.addEventListener("click", () => void refreshState());

  window.__oaRefreshOptionsSettings = refreshState;
  window.__oaOptionsOpenAndTile = () => document.getElementById("sw-open-windows")?.click();
  window.__oaOptionsRetile = () => document.getElementById("sw-retile")?.click();
  window.__oaOptionsCloseTargets = () => document.getElementById("sw-close")?.click();

  void boot();
})();
