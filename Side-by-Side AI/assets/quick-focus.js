"use strict";

const QF_PROVIDER_CATALOG = window.AskAiTogetherProviderCatalog;
const QF_SITE_LABELS = QF_PROVIDER_CATALOG?.getDisplayNameMap?.() || {};
const QF_BUILTIN_SITES = QF_PROVIDER_CATALOG?.getBuiltInSiteEntries?.() || [];

function qfEscapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function qfT(key, vars = {}) {
  const i18n = window.OA_OPTIONS_I18N;
  if (i18n?.format) return i18n.format(key, vars);
  return key;
}

async function getOptionsPageOriginPayload() {
  if (typeof chrome === "undefined" || !chrome.tabs?.getCurrent) return null;
  try {
    const tab = await chrome.tabs.getCurrent();
    if (!tab) return null;
    return {
      windowId: Number.isInteger(tab.windowId) ? tab.windowId : null,
      tabId: Number.isInteger(tab.id) ? tab.id : null,
      groupId: Number.isInteger(tab.groupId) ? tab.groupId : null,
      index: Number.isInteger(tab.index) ? tab.index : null
    };
  } catch (_e) {
    return null;
  }
}

window.getOptionsPageOriginPayload = getOptionsPageOriginPayload;

function qfNormalizeHost(hostname, ignoreWww = true) {
  const clean = String(hostname || "").toLowerCase();
  return ignoreWww ? clean.replace(/^www\./, "") : clean;
}

function qfHostMatches(hostname, needles, options = {}) {
  const builtIn = options.builtIn !== false;
  const host = qfNormalizeHost(hostname, builtIn);
  return needles.some((needle) => {
    const normalized = qfNormalizeHost(needle, builtIn);
    return host === normalized || (builtIn && host.endsWith("." + normalized));
  });
}

function qfHostNeedlesForSite(site) {
  const siteId = String(site?.siteId || site?.id || "");
  const builtIn = QF_PROVIDER_CATALOG?.getHostMap?.()?.[siteId];
  if (Array.isArray(builtIn) && builtIn.length) return { needles: builtIn, builtIn: true };
  try {
    return { needles: [new URL(String(site?.url || "")).hostname], builtIn: false };
  } catch (_e) {
    return { needles: [], builtIn: false };
  }
}

function qfTabMatchesSite(tab, site) {
  const raw = String(tab?.url || "");
  if (!/^https?:/i.test(raw)) return false;
  let host = "";
  try {
    host = new URL(raw).hostname;
  } catch (_e) {
    return false;
  }
  const { needles, builtIn } = qfHostNeedlesForSite(site);
  return needles.length > 0 && qfHostMatches(host, needles, { builtIn });
}

function qfTabAffinityScore(tab, originTab) {
  if (!originTab || typeof originTab !== "object") return tab?.active ? 10 : 0;
  let score = tab?.active ? 10 : 0;
  if (Number.isInteger(originTab.windowId) && tab?.windowId === originTab.windowId) score += 100;
  if (Number.isInteger(originTab.groupId) && originTab.groupId >= 0 && tab?.groupId === originTab.groupId) score += 200;
  if (Number.isInteger(originTab.index) && Number.isInteger(tab?.index) && tab?.windowId === originTab.windowId) {
    score += Math.max(0, 20 - Math.abs(tab.index - originTab.index));
  }
  return score;
}

async function getOptionsPageTargetHints(sites) {
  if (typeof chrome === "undefined" || !chrome.tabs?.getCurrent || !chrome.tabs?.query) return [];
  const list = Array.isArray(sites) ? sites : [];
  if (!list.length) return [];
  let originTab = null;
  try {
    originTab = await chrome.tabs.getCurrent();
  } catch (_e) {
    originTab = null;
  }
  if (!Number.isInteger(originTab?.windowId)) return [];
  let openTabs = [];
  try {
    openTabs = await chrome.tabs.query({ windowId: originTab.windowId });
  } catch (_e) {
    return [];
  }
  return list
    .map((site) => {
      const siteId = String(site?.siteId || "");
      if (!siteId) return null;
      const matches = openTabs.filter((tab) => qfTabMatchesSite(tab, site));
      if (!matches.length) return null;
      matches.sort((a, b) => qfTabAffinityScore(b, originTab) - qfTabAffinityScore(a, originTab));
      const tab = matches[0];
      if (!Number.isInteger(tab?.id) || !Number.isInteger(tab?.windowId)) return null;
      return { siteId, tabId: tab.id, windowId: tab.windowId };
    })
    .filter(Boolean);
}

window.getOptionsPageTargetHints = getOptionsPageTargetHints;

/**
 * 与控制器页一致：按「设置里的站点顺序」返回当前勾选站点的 { siteId, url }。
 * @returns {Promise<Array<{ siteId: string, url: string }>>}
 */
async function loadOrderedSelectedSitesPayload() {
  const data = await chrome.storage.local.get([
    "oa_selected_sites",
    "oa_custom_sites",
    "oa_site_order"
  ]);
  const customSites = Array.isArray(data.oa_custom_sites) ? data.oa_custom_sites : [];
  const siteOrder = Array.isArray(data.oa_site_order) ? data.oa_site_order : [];
  const allSites = [...QF_BUILTIN_SITES, ...customSites];
  const map = new Map(allSites.map((s) => [s.id, s]));

  let selectedSiteIds = Array.isArray(data.oa_selected_sites) && data.oa_selected_sites.length
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

/**
 * @param {string} containerId
 */
async function renderQuickFocus(containerId) {
  await window.OA_OPTIONS_I18N?.ready?.();
  const el = document.getElementById(containerId);
  if (!el) return;

  let res;
  try {
    res = await chrome.runtime.sendMessage({ type: "OA_BG_GET_STATE" });
  } catch (_e) {
    el.innerHTML = `<p class="qf-hint">${qfEscapeHtml(qfT("status_quick_focus_error"))}</p>`;
    return;
  }

  const targets = res?.targets || {};
  const ids = Object.keys(targets);
  if (!ids.length) {
    el.innerHTML = `<p class="qf-hint">${qfEscapeHtml(qfT("status_quick_focus_empty"))}</p>`;
    return;
  }

  el.innerHTML = ids
    .map((id) => {
      const name = QF_SITE_LABELS[id] || id;
      const safeId = qfEscapeHtml(id);
      const safeName = qfEscapeHtml(name);
      return `<button type="button" class="qf-btn qf-chip" data-site-id="${safeId}">${qfEscapeHtml(qfT("quick_focus_button", { name }))}</button>`;
    })
    .join("");

  el.querySelectorAll("button[data-site-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const siteId = btn.getAttribute("data-site-id");
      if (!siteId) return;
      try {
        await chrome.runtime.sendMessage({ type: "OA_BG_FOCUS", siteId });
      } catch (_e) {
        /* ignore */
      }
    });
  });
}
