"use strict";

async function restoreInitiatorFocus(sourceWindowId, sourceTabId) {
  if (sourceTabId != null) {
    try {
      await chrome.tabs.update(sourceTabId, { active: true });
    } catch (_e) {
      /* ignore */
    }
  }
  if (sourceWindowId != null) {
    try {
      await chrome.windows.update(sourceWindowId, { focused: true });
    } catch (_e) {
      /* ignore */
    }
  }
}

async function withInitiatorFocusRestored(origin, work) {
  const sourceWindowId = Number.isInteger(origin?.windowId) ? origin.windowId : null;
  const sourceTabId = Number.isInteger(origin?.tabId) ? origin.tabId : null;
  try {
    return await work();
  } finally {
    await restoreInitiatorFocus(sourceWindowId, sourceTabId);
  }
}

function isRootLikePath(pathname) {
  const p = String(pathname || "").trim();
  return (
    !p ||
    p === "/" ||
    p === "/new" ||
    p === "/new/" ||
    p === "/chat" ||
    p === "/chat/" ||
    p === "/app" ||
    p === "/app/" ||
    /^\/u\/\d+\/app\/?$/.test(p)
  );
}

function shouldReplaceHistoryUrl(previousUrl, nextUrl) {
  const prev = String(previousUrl || "").trim();
  const next = String(nextUrl || "").trim();
  if (!/^https?:\/\//i.test(next)) return false;
  if (!prev) return true;
  if (prev === next) return false;
  try {
    const prevUrl = new URL(prev);
    const nextUrlObj = new URL(next);
    if (prevUrl.origin !== nextUrlObj.origin) return false;
    if (isRootLikePath(prevUrl.pathname) && !isRootLikePath(nextUrlObj.pathname)) return true;
    if (!prevUrl.search && !prevUrl.hash && (nextUrlObj.search || nextUrlObj.hash)) return true;
    if (
      prevUrl.pathname !== nextUrlObj.pathname &&
      nextUrlObj.pathname.startsWith(`${prevUrl.pathname.replace(/\/+$/, "")}/`)
    ) {
      return true;
    }
  } catch (_e) {
    return true;
  }
  return false;
}

async function patchRecentHistoryUrl(siteId, url) {
  const cleanSiteId = String(siteId || "").trim();
  const cleanUrl = String(url || "").trim();
  if (!cleanSiteId || !/^https?:\/\//i.test(cleanUrl)) return;

  const data = await chrome.storage.local.get(["oa_history"]);
  const history = Array.isArray(data.oa_history) ? data.oa_history.slice() : [];
  let changed = false;
  const now = Date.now();

  for (const entry of history) {
    if (!entry || typeof entry !== "object") continue;
    const ts = Number(entry.ts) || 0;
    if (ts && now - ts > 30 * 60 * 1000) break;
    const urls = entry.urls && typeof entry.urls === "object" ? { ...entry.urls } : null;
    if (!urls || !(cleanSiteId in urls)) continue;
    if (!shouldReplaceHistoryUrl(urls[cleanSiteId], cleanUrl)) break;
    urls[cleanSiteId] = cleanUrl;
    entry.urls = urls;
    changed = true;
    break;
  }

  if (changed) {
    await chrome.storage.local.set({ oa_history: history.slice(0, 200) });
  }
}

async function focusTarget(siteId) {
  const targets = await loadTargets();
  const rec = targets[siteId];
  if (!rec?.windowId) return { ok: false, reason: "missing" };
  try {
    await chrome.windows.update(rec.windowId, { focused: true });
    return { ok: true };
  } catch (_e) {
    delete targets[siteId];
    await saveTargets(targets);
    return { ok: false, reason: "gone" };
  }
}

async function closeTargets(siteIds, siteEntries) {
  if (Array.isArray(siteEntries) && siteEntries.length) {
    await syncTargetsFromTabsForSites(siteEntries);
  }
  const targets = await loadTargets();
  const ids = Array.isArray(siteIds) ? siteIds : [];
  const tabIds = [];

  for (const siteId of ids) {
    const rec = targets[siteId];
    if (!rec?.tabId) continue;
    tabIds.push(rec.tabId);
    delete targets[siteId];
  }

  const uniqueTabIds = [...new Set(tabIds)];
  if (uniqueTabIds.length) {
    try {
      await chrome.tabs.remove(uniqueTabIds);
    } catch (_e) {
      /* ignore */
    }
  }

  await saveTargets(targets);
  return { ok: true, closedCount: uniqueTabIds.length };
}

/** 与旧版分屏页类似：广播发送成功后写入本地 oa_history（简化版，无去重合并） */
async function appendHistoryAfterSend(message, siteIds, targets) {
  const text = String(message || "").trim();
  if (!text) return;
  const ids = Array.isArray(siteIds) ? siteIds : [];
  const data = await chrome.storage.local.get(["oa_custom_sites", "oa_history"]);
  const customSites = Array.isArray(data.oa_custom_sites) ? data.oa_custom_sites : [];
  const nameById = new Map(customSites.map((s) => [s.id, s.name]));
  const displayNames = ids.map((id) => nameById.get(id) || SITE_DISPLAY_NAMES[id] || id);
  const urls = {};
  for (const siteId of ids) {
    const rec = targets[siteId];
    if (!rec?.tabId) continue;
    try {
      const tab = await chrome.tabs.get(rec.tabId);
      if (tab?.url && /^https?:/i.test(tab.url)) urls[siteId] = tab.url;
    } catch (_e) {
      /* ignore */
    }
  }
  const history = Array.isArray(data.oa_history) ? data.oa_history : [];
  const entry = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    prompt: text.slice(0, 2000),
    aiSummary: false,
    ts: Date.now(),
    siteIds: ids,
    sites: displayNames,
    urls
  };
  history.unshift(entry);
  await chrome.storage.local.set({ oa_history: history.slice(0, 200) });
}

async function sendPromptToTargets(siteIds, message, requestId, siteEntries) {
  if (Array.isArray(siteEntries) && siteEntries.length) {
    await syncTargetsFromTabsForSites(siteEntries);
  }
  const targets = await loadTargets();
  const text = String(message || "");
  const rid = String(requestId || "");
  const ids = Array.isArray(siteIds) ? siteIds : [];
  await Promise.all(
    ids.map(async (siteId) => {
      const rec = targets[siteId];
      if (!rec?.tabId) return;
      try {
        await chrome.tabs.sendMessage(rec.tabId, {
          type: "OA_RUNTIME_CHAT",
          message: text,
          requestId: rid,
          files: []
        });
      } catch (_e) {
        broadcastToExtensionPages({
          type: "OA_SEND_PROGRESS",
          payload: { requestId: rid, siteId, phase: "failed", reason: "tab-unreachable" }
        });
      }
    })
  );
  if (text.trim()) {
    await appendHistoryAfterSend(text, ids, targets);
  }
  return { ok: true };
}

/**
 * 从各独立 AI 标签页抓取最新回复（与旧版 COLLECT_LAST_RESPONSE 语义一致）。
 */
async function collectLastFromTargets(siteIds, siteEntries) {
  if (Array.isArray(siteEntries) && siteEntries.length) {
    await syncTargetsFromTabsForSites(siteEntries);
  }
  const targets = await loadTargets();
  const ids = Array.isArray(siteIds) ? siteIds : [];
  const sections = [];
  for (const siteId of ids) {
    const rec = targets[siteId];
    let text = "";
    if (rec?.tabId) {
      try {
        const r = await chrome.tabs.sendMessage(rec.tabId, { type: "OA_RUNTIME_COLLECT_LAST" });
        text = r?.text || "";
      } catch (_e) {
        text = "";
      }
    }
    sections.push({
      siteId,
      siteName: SITE_DISPLAY_NAMES[siteId] || siteId,
      text
    });
  }
  return { ok: true, sections };
}

/** 串行执行，避免多路并发时各窗口 chrome.windows.update 抢焦点导致死循环/卡死 */
let __oaNewChatChain = Promise.resolve();

async function newChatOnTargets(siteIds, siteEntries, origin) {
  const job = async () => {
    return withInitiatorFocusRestored(origin, async () => {
      if (Array.isArray(siteEntries) && siteEntries.length) {
        await syncTargetsFromTabsForSites(siteEntries);
      }
      const targets = await loadTargets();
      const ids = Array.isArray(siteIds) ? siteIds : [];
      for (const siteId of ids) {
        const rec = targets[siteId];
        if (!rec?.tabId) continue;
        try {
          await chrome.tabs.sendMessage(rec.tabId, { type: "OA_RUNTIME_NEW_CHAT" });
          await delay(40);
        } catch (_e) {
          /* ignore */
        }
      }
      return { ok: true };
    });
  };
  const p = __oaNewChatChain.then(job);
  __oaNewChatChain = p.catch(() => {});
  return p;
}

/**
 * 将已绑定标签页导航到历史记录里保存的各站点 URL（恢复当时对话页）。
 */
async function restoreHistoryUrlsToTargets(urls, siteEntries, origin) {
  if (!urls || typeof urls !== "object") {
    return { ok: false, error: "no-urls" };
  }
  return withInitiatorFocusRestored(origin, async () => {
    const historySites = Array.isArray(siteEntries) ? siteEntries.filter((entry) => String(entry?.siteId || "")) : [];
    if (historySites.length) {
      await syncTargetsFromTabsForSites(historySites);
    }
    const targets = await loadTargets();
    for (const entry of historySites) {
      const siteId = String(entry.siteId || "");
      const url = String(entry.url || "").trim();
      if (!siteId || !/^https?:\/\//i.test(url)) continue;
      if (targets[siteId]?.tabId) continue;
      try {
        await ensureWindowForSite(siteId, url, targets, false);
      } catch (_e) {
        /* ignore */
      }
    }
    await saveTargets(targets);

    const freshTargets = await loadTargets();
    const entries = Object.entries(urls).filter(
      ([_, u]) => typeof u === "string" && /^https?:\/\//i.test(u.trim())
    );
    let navigated = 0;
    /* 串行导航，避免同时改多标签 URL 时状态记录互相覆盖 */
    for (const [siteId, url] of entries) {
      const rec = freshTargets[siteId];
      if (!rec?.tabId) continue;
      try {
        await chrome.tabs.update(rec.tabId, { url: url.trim() });
        navigated += 1;
        await delay(60);
      } catch (_e) {
        /* ignore */
      }
    }
    return { ok: true, navigated };
  });
}

async function getState(siteEntries) {
  if (Array.isArray(siteEntries) && siteEntries.length) {
    await syncTargetsFromTabsForSites(siteEntries);
  }
  const targets = await loadTargets();
  const copy = { ...targets };
  for (const siteId of Object.keys(copy)) {
    const rec = copy[siteId];
    if (!rec?.windowId) {
      delete copy[siteId];
      continue;
    }
    try {
      await chrome.windows.get(rec.windowId);
    } catch (_e) {
      delete copy[siteId];
    }
  }
  if (Object.keys(copy).length !== Object.keys(targets).length) {
    await saveTargets(copy);
  }
  return { ok: true, targets: copy };
}
