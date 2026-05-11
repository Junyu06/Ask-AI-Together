"use strict";

function hostMatchesList(hostname, needles, options = {}) {
  const ignoreWww = options.ignoreWww !== false;
  const normalize = (value) => {
    const clean = String(value || "").toLowerCase();
    return ignoreWww ? clean.replace(/^www\./, "") : clean;
  };
  const h = normalize(hostname);
  const allowSubdomains = options.allowSubdomains !== false;
  return needles.some((n) => {
    const needle = normalize(n);
    return h === needle || (allowSubdomains && h.endsWith("." + needle));
  });
}

function hostNeedlesForAiSite(siteId, siteUrl) {
  const builtinNeedles = SITE_HOSTS[siteId];
  if (builtinNeedles) return builtinNeedles;
  try {
    return [new URL(String(siteUrl || "").trim()).hostname];
  } catch (_e) {
    return null;
  }
}

function isBuiltInAiSite(siteId) {
  return Boolean(SITE_HOSTS[siteId]);
}

function tabMatchesAiSite(tab, siteId, siteUrl) {
  const raw = tab?.url;
  if (!raw || !/^https?:/i.test(raw)) return false;
  let host;
  try {
    host = new URL(raw).hostname;
  } catch (_e) {
    return false;
  }
  const needles = hostNeedlesForAiSite(siteId, siteUrl);
  const builtIn = isBuiltInAiSite(siteId);
  return Array.isArray(needles) && hostMatchesList(host, needles, { allowSubdomains: builtIn, ignoreWww: builtIn });
}

/**
 * Find an open tab for this AI site (any window). Prefer active tab in matches.
 */
function tabAffinityScore(tab, origin) {
  if (!origin || typeof origin !== "object") return tab?.active ? 10 : 0;
  let score = tab?.active ? 10 : 0;
  if (Number.isInteger(origin.windowId) && tab?.windowId === origin.windowId) score += 100;
  if (Number.isInteger(origin.groupId) && origin.groupId >= 0 && tab?.groupId === origin.groupId) score += 200;
  if (Number.isInteger(origin.index) && Number.isInteger(tab?.index) && tab?.windowId === origin.windowId) {
    score += Math.max(0, 20 - Math.abs(tab.index - origin.index));
  }
  return score;
}

async function findTabForAiSite(siteId, siteUrl, origin) {
  const needles = hostNeedlesForAiSite(siteId, siteUrl);
  if (!Array.isArray(needles)) return null;
  const tabs = await chrome.tabs.query({});
  const matches = [];
  for (const tab of tabs) {
    if (tabMatchesAiSite(tab, siteId, siteUrl)) {
      matches.push(tab);
    }
  }
  if (!matches.length) return null;
  matches.sort((a, b) => tabAffinityScore(b, origin) - tabAffinityScore(a, origin));
  return matches[0];
}

async function getValidTargetTab(rec, siteId, siteUrl) {
  if (!rec?.tabId) return null;
  try {
    const tab = await chrome.tabs.get(rec.tabId);
    if (tab?.id != null && tab.windowId != null && tabMatchesAiSite(tab, siteId, siteUrl)) {
      return tab;
    }
  } catch (_e) {
    /* ignore */
  }
  return null;
}

function targetHintForSite(targetHints, siteId) {
  if (!Array.isArray(targetHints)) return null;
  return targetHints.find((hint) => String(hint?.siteId || "") === siteId) || null;
}

async function syncTargetsFromTabsForSites(siteEntries, origin, targetHints) {
  const targets = await loadTargets();
  const list = Array.isArray(siteEntries) ? siteEntries : [];
  for (const entry of list) {
    const siteId = String(entry?.siteId || "");
    if (!siteId) continue;
    const url = String(entry?.url || "").trim() || BUILTIN_SITE_URLS[siteId];
    const hint = targetHintForSite(targetHints, siteId);
    if (hint?.tabId) {
      const hintedTab = await getValidTargetTab({ tabId: hint.tabId }, siteId, url);
      if (hintedTab) {
        targets[siteId] = { siteId, windowId: hintedTab.windowId, tabId: hintedTab.id, transport: "window" };
        continue;
      }
    }
    if (targets[siteId]) {
      const validTab = await getValidTargetTab(targets[siteId], siteId, url);
      if (validTab) {
        if (targets[siteId].windowId !== validTab.windowId || targets[siteId].tabId !== validTab.id) {
          targets[siteId] = { siteId, windowId: validTab.windowId, tabId: validTab.id, transport: "window" };
        }
        continue;
      }
      delete targets[siteId];
    }
    const tab = await findTabForAiSite(siteId, url, origin);
    if (tab?.windowId != null && tab.id != null) {
      targets[siteId] = { siteId, windowId: tab.windowId, tabId: tab.id, transport: "window" };
    }
  }
  await saveTargets(targets);
}

async function bindTargetForSenderTab(siteEntry, sender) {
  const siteId = String(siteEntry?.siteId || "").trim();
  if (!siteId) return { ok: false, reason: "missing-site" };
  const senderTabId = Number.isInteger(sender?.tab?.id) ? sender.tab.id : null;
  if (senderTabId == null) return { ok: false, reason: "missing-sender-tab" };
  const url = String(siteEntry?.url || "").trim() || BUILTIN_SITE_URLS[siteId];
  let tab = sender.tab;
  if (!tab?.url) {
    try {
      tab = await chrome.tabs.get(senderTabId);
    } catch (_e) {
      return { ok: false, reason: "sender-tab-gone" };
    }
  }
  if (!tabMatchesAiSite(tab, siteId, url)) {
    return { ok: false, reason: "sender-tab-site-mismatch" };
  }
  const windowId = Number.isInteger(tab.windowId) ? tab.windowId : sender.tab.windowId;
  if (!Number.isInteger(windowId)) return { ok: false, reason: "missing-window" };
  const targets = await loadTargets();
  targets[siteId] = { siteId, windowId, tabId: senderTabId, transport: "window" };
  await saveTargets(targets);
  return { ok: true, siteId, windowId, tabId: senderTabId };
}

/**
 * If multiple targets share one browser window (tabs in same window), detach extras
 * so each target has its own window — otherwise tiling only moves one rectangle.
 */
async function ensureSeparateWindowsForTargets(siteIds) {
  const targets = await loadTargets();
  const ids = Array.isArray(siteIds) ? siteIds : [];
  const seenWin = new Set();
  for (const siteId of ids) {
    const rec = targets[siteId];
    if (!rec?.tabId || rec.windowId == null) continue;
    let winId = rec.windowId;
    if (seenWin.has(winId)) {
      try {
        const prefs = await getWindowPrefs();
        const created = await chrome.windows.create({
          tabId: rec.tabId,
          type: prefs.type,
          width: prefs.width,
          height: prefs.height,
          focused: false
        });
        if (created?.id != null) {
          winId = created.id;
          targets[siteId] = { siteId, windowId: winId, tabId: rec.tabId, transport: "window" };
        }
      } catch (_e) {
        /* ignore */
      }
    }
    seenWin.add(winId);
  }
  await saveTargets(targets);
}
