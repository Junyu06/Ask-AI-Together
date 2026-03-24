"use strict";

function hostMatchesList(hostname, needles) {
  const h = String(hostname || "").toLowerCase().replace(/^www\./, "");
  return needles.some((n) => {
    const needle = String(n).toLowerCase().replace(/^www\./, "");
    return h === needle || h.endsWith("." + needle);
  });
}

/**
 * Find an open tab for this AI site (any window). Prefer active tab in matches.
 */
async function findTabForAiSite(siteId, siteUrl) {
  let needles = SITE_HOSTS[siteId];
  if (!needles) {
    try {
      needles = [new URL(String(siteUrl || "").trim()).hostname];
    } catch (_e) {
      return null;
    }
  }
  const tabs = await chrome.tabs.query({});
  const matches = [];
  for (const tab of tabs) {
    const raw = tab.url;
    if (!raw || !/^https?:/i.test(raw)) continue;
    let host;
    try {
      host = new URL(raw).hostname;
    } catch (_e) {
      continue;
    }
    if (hostMatchesList(host, needles)) {
      matches.push(tab);
    }
  }
  if (!matches.length) return null;
  const active = matches.find((t) => t.active);
  return active || matches[0];
}

async function syncTargetsFromTabsForSites(siteEntries) {
  const targets = await loadTargets();
  const list = Array.isArray(siteEntries) ? siteEntries : [];
  for (const entry of list) {
    const siteId = String(entry?.siteId || "");
    if (!siteId) continue;
    const url = String(entry?.url || "").trim() || BUILTIN_SITE_URLS[siteId];
    if (targets[siteId]?.windowId) {
      try {
        await chrome.windows.get(targets[siteId].windowId);
        continue;
      } catch (_e) {
        delete targets[siteId];
      }
    }
    const tab = await findTabForAiSite(siteId, url);
    if (tab?.windowId != null && tab.id != null) {
      targets[siteId] = { siteId, windowId: tab.windowId, tabId: tab.id, transport: "window" };
    }
  }
  await saveTargets(targets);
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
