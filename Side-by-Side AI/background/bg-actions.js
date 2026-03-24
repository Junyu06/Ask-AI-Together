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

/** 串行执行，避免多路并发时各窗口 chrome.windows.update 抢焦点导致死循环/卡死 */
let __oaNewChatChain = Promise.resolve();

async function newChatOnTargets(siteIds, siteEntries) {
  const job = async () => {
    if (Array.isArray(siteEntries) && siteEntries.length) {
      await syncTargetsFromTabsForSites(siteEntries);
    }
    const targets = await loadTargets();
    const ids = Array.isArray(siteIds) ? siteIds : [];
    for (const siteId of ids) {
      const rec = targets[siteId];
      if (!rec?.tabId) continue;
      try {
        /*
         * 必须短暂聚焦目标窗口再发消息：多数站点（尤其 Gemini）在后台标签页内点击「新对话」无效。
         * 串行 await，且全局 __oaNewChatChain 串行，避免多路 newChat 并发抢焦点卡死。
         */
        if (rec.windowId != null) {
          await chrome.windows.update(rec.windowId, { focused: true });
        }
        await chrome.tabs.update(rec.tabId, { active: true });
        await delay(140);
        await chrome.tabs.sendMessage(rec.tabId, { type: "OA_RUNTIME_NEW_CHAT" });
        await delay(80);
      } catch (_e) {
        /* ignore */
      }
    }
    return { ok: true };
  };
  const p = __oaNewChatChain.then(job);
  __oaNewChatChain = p.catch(() => {});
  return p;
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
  /* 串行 + 短暂聚焦：后台标签页仅改 URL 时部分站点（如 Gemini）会落到新会话或未完成加载 */
  for (const [siteId, url] of entries) {
    const rec = targets[siteId];
    if (!rec?.tabId) continue;
    try {
      if (rec.windowId != null) {
        await chrome.windows.update(rec.windowId, { focused: true });
      }
      await chrome.tabs.update(rec.tabId, { active: true });
      await delay(100);
      await chrome.tabs.update(rec.tabId, { url: url.trim() });
      navigated += 1;
      await delay(60);
    } catch (_e) {
      /* ignore */
    }
  }
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
