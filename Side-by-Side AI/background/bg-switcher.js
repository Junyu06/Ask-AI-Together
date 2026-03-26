"use strict";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 依次短暂聚焦每个已打开的 AI 窗口，最后聚焦最后一个，便于用户看清布局。
 */
async function focusOpenedTargetsThenSwitcher(siteIdsOrdered) {
  const targets = await loadTargets();
  const ids = Array.isArray(siteIdsOrdered) ? siteIdsOrdered : [];
  const FOCUS_MS = 110;
  let lastWin = null;
  for (const siteId of ids) {
    const rec = targets[siteId];
    if (!rec?.windowId) continue;
    try {
      await chrome.windows.update(rec.windowId, { focused: true });
      lastWin = rec.windowId;
      await delay(FOCUS_MS);
    } catch (_e) {
      /* ignore */
    }
  }
  if (lastWin != null) {
    try {
      await chrome.windows.update(lastWin, { focused: true });
    } catch (_e) {
      /* ignore */
    }
  }
}

/** 与 `assets/quick-focus.js` 的 `loadOrderedSelectedSitesPayload` 一致（勾选 + 顺序）。 */
async function loadOrderedSelectedSitesFromStorage() {
  const data = await chrome.storage.local.get([
    "oa_selected_sites",
    "oa_custom_sites",
    "oa_site_order"
  ]);
  const builtinSites = [
    { id: "chatgpt", url: BUILTIN_SITE_URLS.chatgpt },
    { id: "deepseek", url: BUILTIN_SITE_URLS.deepseek },
    { id: "kimi", url: BUILTIN_SITE_URLS.kimi },
    { id: "qwen", url: BUILTIN_SITE_URLS.qwen },
    { id: "doubao", url: BUILTIN_SITE_URLS.doubao },
    { id: "yuanbao", url: BUILTIN_SITE_URLS.yuanbao },
    { id: "grok", url: BUILTIN_SITE_URLS.grok },
    { id: "claude", url: BUILTIN_SITE_URLS.claude },
    { id: "gemini", url: BUILTIN_SITE_URLS.gemini },
    { id: "perplexity", url: BUILTIN_SITE_URLS.perplexity }
  ];
  const customSites = Array.isArray(data.oa_custom_sites) ? data.oa_custom_sites : [];
  const siteOrder = Array.isArray(data.oa_site_order) ? data.oa_site_order : [];
  const allSites = [...builtinSites, ...customSites];
  const map = new Map(allSites.map((s) => [s.id, s]));

  let selectedSiteIds =
    Array.isArray(data.oa_selected_sites) && data.oa_selected_sites.length
      ? data.oa_selected_sites.filter((id) => map.has(id))
      : ["chatgpt", "deepseek", "kimi"];

  const ordered = [];
  siteOrder.forEach((id) => {
    const site = map.get(id);
    if (site && selectedSiteIds.includes(id)) ordered.push(site);
  });
  selectedSiteIds.forEach((id) => {
    const site = map.get(id);
    if (site && !ordered.find((s) => s.id === id)) ordered.push(site);
  });

  return ordered.map((s) => ({ siteId: s.id, url: s.url }));
}

async function getTileLayoutPresetFromStorage() {
  const data = await chrome.storage.local.get(["oa_tile_layout_preset"]);
  const rawLayout = String(data.oa_tile_layout_preset || "auto");
  const allowed = new Set([
    "auto",
    "horizontal",
    "vertical",
    "two-top-one-bottom",
    "one-left-two-right",
    "grid-2x2"
  ]);
  return allowed.has(rawLayout) ? rawLayout : "auto";
}

/** 按勾选站点打开/复用各 AI 窗口并平铺（不再打开独立常驻输入条小窗）。 */
async function openSelectedAisTiled(workArea) {
  const sites = await loadOrderedSelectedSitesFromStorage();
  if (!sites.length) return;
  try {
    const layoutPreset = await getTileLayoutPresetFromStorage();
    await openOrReuseWindows(sites, { skipFocusChain: true });
    await applyTile(sites, workArea || undefined, layoutPreset);
  } catch (_e) {
    /* ignore */
  }
}

/**
 * 工具栏图标：
 * - legacy 模式（默认）：打开 legacy/index.html 分屏页（已有则聚焦）。
 * - windows 模式：尝试页内嵌侧栏，否则按勾选平铺多窗口。
 */
async function openSwitcherFromToolbarAction(tab) {
  const data = await chrome.storage.local.get(["oa_mode"]);
  const mode = data.oa_mode === "windows" ? "windows" : "legacy";

  if (mode === "legacy") {
    const legacyUrl = chrome.runtime.getURL("legacy/index.html");
    const existing = await chrome.tabs.query({ url: legacyUrl });
    if (existing.length) {
      const t = existing[0];
      try {
        if (t.windowId != null) await chrome.windows.update(t.windowId, { focused: true });
        await chrome.tabs.update(t.id, { active: true });
      } catch (_e) {
        chrome.tabs.create({ url: legacyUrl });
      }
    } else {
      chrome.tabs.create({ url: legacyUrl });
    }
    return;
  }

  if (tab?.id != null && isStaleExtensionUiUrl(tab.url || "")) {
    try {
      await chrome.tabs.update(tab.id, { url: chrome.runtime.getURL(OPTIONS_PAGE) });
    } catch (_e) {
      /* ignore */
    }
  }
  if (tab?.id != null) {
    try {
      const res = await chrome.tabs.sendMessage(tab.id, { type: "OA_PAGE_EMBED_OPEN_SWITCHER" });
      if (res?.ok) return;
    } catch (_e) {
      /* 非 AI 页或未注入 embed 脚本 */
    }
  }

  let workArea = null;
  try {
    const displays = await chrome.system.display.getInfo();
    const primary = displays.find((d) => d.isPrimary) || displays[0];
    if (primary?.workArea?.width > 0) {
      workArea = {
        left: primary.workArea.left,
        top: primary.workArea.top,
        width: primary.workArea.width,
        height: primary.workArea.height
      };
    }
  } catch (_e) {
    /* 无法获取显示器信息，applyTile 将使用默认值 */
  }
  await openSelectedAisTiled(workArea);
}
