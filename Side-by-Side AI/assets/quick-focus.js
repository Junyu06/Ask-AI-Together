"use strict";

const QF_SITE_LABELS = {
  chatgpt: "ChatGPT",
  deepseek: "DeepSeek",
  kimi: "Kimi",
  qwen: "Qwen",
  doubao: "Doubao",
  yuanbao: "Yuanbao",
  grok: "Grok",
  claude: "Claude",
  gemini: "Gemini"
};

const QF_BUILTIN_SITES = [
  { id: "chatgpt", url: "https://chatgpt.com/" },
  { id: "deepseek", url: "https://chat.deepseek.com/" },
  { id: "kimi", url: "https://www.kimi.com/" },
  { id: "qwen", url: "https://chat.qwen.ai/" },
  { id: "doubao", url: "https://www.doubao.com/" },
  { id: "yuanbao", url: "https://yuanbao.tencent.com/" },
  { id: "grok", url: "https://grok.com/" },
  { id: "claude", url: "https://claude.ai/" },
  { id: "gemini", url: "https://gemini.google.com/" }
];

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
