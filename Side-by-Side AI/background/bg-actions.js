"use strict";

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

async function newChatOnTargets(siteIds, siteEntries) {
  if (Array.isArray(siteEntries) && siteEntries.length) {
    await syncTargetsFromTabsForSites(siteEntries);
  }
  const targets = await loadTargets();
  const ids = Array.isArray(siteIds) ? siteIds : [];
  for (const siteId of ids) {
    const rec = targets[siteId];
    if (!rec?.tabId) continue;
    try {
      await chrome.tabs.update(rec.tabId, { active: true });
      if (rec.windowId != null) {
        await chrome.windows.update(rec.windowId, { focused: true });
      }
      await delay(100);
      await chrome.tabs.sendMessage(rec.tabId, { type: "OA_RUNTIME_NEW_CHAT" });
    } catch (_e) {
      /* ignore */
    }
  }
  return { ok: true };
}

/**
 * 将已绑定标签页导航到历史记录里保存的各站点 URL（恢复当时对话页）。
 */
async function restoreHistoryUrlsToTargets(urls, siteEntries) {
  if (!urls || typeof urls !== "object") {
    return { ok: false, error: "no-urls" };
  }
  if (Array.isArray(siteEntries) && siteEntries.length) {
    await syncTargetsFromTabsForSites(siteEntries);
  }
  const targets = await loadTargets();
  const entries = Object.entries(urls).filter(
    ([_, u]) => typeof u === "string" && /^https?:\/\//i.test(u.trim())
  );
  let navigated = 0;
  await Promise.all(
    entries.map(async ([siteId, url]) => {
      const rec = targets[siteId];
      if (!rec?.tabId) return;
      try {
        await chrome.tabs.update(rec.tabId, { url: url.trim() });
        navigated += 1;
      } catch (_e) {
        /* ignore */
      }
    })
  );
  return { ok: true, navigated };
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
