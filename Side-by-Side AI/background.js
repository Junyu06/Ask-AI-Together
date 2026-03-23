const MAIN_PAGE = "index.html";
const CONTROLLER_PAGE = "controller.html";

const STORAGE_WINDOW_TARGETS = "oa_window_targets_v1";

/** @type {Record<string, { siteId: string, windowId: number, tabId: number, transport: string }>} */
let targetsCache = null;

const BUILTIN_SITE_URLS = {
  chatgpt: "https://chatgpt.com/",
  deepseek: "https://chat.deepseek.com/",
  kimi: "https://www.kimi.com/",
  qwen: "https://chat.qwen.ai/",
  doubao: "https://www.doubao.com/",
  yuanbao: "https://yuanbao.tencent.com/",
  grok: "https://grok.com/",
  claude: "https://claude.ai/",
  gemini: "https://gemini.google.com/"
};

/** Hostnames for matching tabs (aligned with content.js SITES) */
const SITE_HOSTS = {
  chatgpt: ["chatgpt.com", "chat.openai.com"],
  deepseek: ["chat.deepseek.com"],
  kimi: ["kimi.com", "www.kimi.com"],
  qwen: ["chat.qwen.ai"],
  doubao: ["doubao.com", "www.doubao.com"],
  yuanbao: ["yuanbao.tencent.com"],
  grok: ["grok.com"],
  claude: ["claude.ai"],
  gemini: ["gemini.google.com"]
};

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
        const created = await chrome.windows.create({ tabId: rec.tabId });
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

function openMainPage() {
  chrome.tabs.create({ url: chrome.runtime.getURL(MAIN_PAGE) });
}

function openControllerPage() {
  chrome.tabs.create({ url: chrome.runtime.getURL(CONTROLLER_PAGE) });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.declarativeNetRequest.updateDynamicRules(
    {
      removeRuleIds: [9001],
      addRules: [
        {
          id: 9001,
          priority: 1,
          action: {
            type: "modifyHeaders",
            responseHeaders: [
              { header: "x-frame-options", operation: "remove" },
              { header: "frame-options", operation: "remove" },
              { header: "content-security-policy", operation: "remove" },
              { header: "content-security-policy-report-only", operation: "remove" }
            ]
          },
          condition: {
            urlFilter: "*",
            resourceTypes: ["main_frame", "sub_frame"]
          }
        }
      ]
    },
    () => void chrome.runtime.lastError
  );
});

async function loadTargets() {
  if (targetsCache) return targetsCache;
  const data = await chrome.storage.session.get(STORAGE_WINDOW_TARGETS);
  const raw = data[STORAGE_WINDOW_TARGETS];
  targetsCache = raw && typeof raw === "object" ? { ...raw } : {};
  return targetsCache;
}

async function saveTargets(targets) {
  targetsCache = targets;
  await chrome.storage.session.set({ [STORAGE_WINDOW_TARGETS]: targets });
}

function broadcastToExtensionPages(message) {
  chrome.runtime.sendMessage(message).catch(() => {});
}

/**
 * Deterministic tiling for 1–4 windows inside workArea.
 * 3-window layout: two on top row, one full-width bottom.
 */
function tileRects(n, work) {
  const { left, top, width, height } = work;
  const rects = [];
  const nClamped = Math.min(Math.max(n, 1), 4);
  if (nClamped === 1) {
    rects.push({ left, top, width, height });
  } else if (nClamped === 2) {
    const half = Math.floor(width / 2);
    rects.push({ left, top, width: half, height });
    rects.push({ left: left + half, top, width: width - half, height });
  } else if (nClamped === 3) {
    const halfW = Math.floor(width / 2);
    const halfH = Math.floor(height / 2);
    rects.push({ left, top, width: halfW, height: halfH });
    rects.push({ left: left + halfW, top, width: width - halfW, height: halfH });
    rects.push({ left, top: top + halfH, width, height: height - halfH });
  } else {
    const halfW = Math.floor(width / 2);
    const halfH = Math.floor(height / 2);
    rects.push({ left, top, width: halfW, height: halfH });
    rects.push({ left: left + halfW, top, width: width - halfW, height: halfH });
    rects.push({ left, top: top + halfH, width: halfW, height: height - halfH });
    rects.push({ left: left + halfW, top: top + halfH, width: width - halfW, height: height - halfH });
  }
  return rects;
}

async function ensureWindowForSite(siteId, url, targets) {
  const u = String(url || "").trim() || BUILTIN_SITE_URLS[siteId];
  if (!u) throw new Error("missing-url");

  const existing = targets[siteId];
  if (existing?.windowId) {
    try {
      const w = await chrome.windows.get(existing.windowId, { populate: true });
      const tabId = w.tabs?.[0]?.id;
      if (tabId != null) {
        targets[siteId] = { siteId, windowId: w.id, tabId, transport: "window" };
        return targets[siteId];
      }
    } catch (_e) {
      delete targets[siteId];
    }
  }

  const found = await findTabForAiSite(siteId, u);
  if (found?.windowId != null && found.id != null) {
    targets[siteId] = { siteId, windowId: found.windowId, tabId: found.id, transport: "window" };
    return targets[siteId];
  }

  const created = await chrome.windows.create({
    url: u,
    focused: false,
    type: "normal",
    width: 1280,
    height: 800
  });
  const tabId = created.tabs?.[0]?.id;
  if (tabId == null) throw new Error("no-tab");
  targets[siteId] = { siteId, windowId: created.id, tabId, transport: "window" };
  return targets[siteId];
}

async function openOrReuseWindows(sites) {
  const targets = await loadTargets();
  const list = Array.isArray(sites) ? sites : [];
  for (const entry of list) {
    const siteId = String(entry?.siteId || "");
    if (!siteId) continue;
    const url = String(entry?.url || "").trim() || BUILTIN_SITE_URLS[siteId];
    await ensureWindowForSite(siteId, url, targets);
  }
  await saveTargets(targets);
  return { ok: true, targets: { ...targets } };
}

function siteEntriesFromMessage(msg) {
  if (Array.isArray(msg.sites) && msg.sites.length) {
    return msg.sites;
  }
  const siteIds = Array.isArray(msg.siteIds) ? msg.siteIds : [];
  return siteIds.map((id) => ({ siteId: id, url: BUILTIN_SITE_URLS[id] || "" }));
}

async function applyTile(siteEntries, workArea) {
  await syncTargetsFromTabsForSites(siteEntries);
  const siteIds = siteEntries.map((e) => e.siteId);
  await ensureSeparateWindowsForTargets(siteIds);
  const targets = await loadTargets();
  const ids = siteIds.filter((id) => targets[id]?.windowId);
  const n = ids.length;
  if (!n) return { ok: false, reason: "no-windows" };

  const work = workArea && Number(workArea.width) > 0 && Number(workArea.height) > 0
    ? {
        left: Math.round(Number(workArea.left) || 0),
        top: Math.round(Number(workArea.top) || 0),
        width: Math.round(Number(workArea.width)),
        height: Math.round(Number(workArea.height))
      }
    : {
        left: 0,
        top: 0,
        width: 1920,
        height: 1080
      };

  const rects = tileRects(Math.min(n, 4), work);
  const count = Math.min(n, rects.length);
  for (let i = 0; i < count; i++) {
    const siteId = ids[i];
    const winId = targets[siteId].windowId;
    const r = rects[i];
    try {
      await chrome.windows.update(winId, {
        left: r.left,
        top: r.top,
        width: Math.max(320, r.width),
        height: Math.max(240, r.height),
        state: "normal"
      });
    } catch (_e) {
      delete targets[siteId];
    }
  }
  await saveTargets(targets);
  return { ok: true, targets: { ...targets } };
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

async function sendPromptToTargets(siteIds, message, requestId, siteEntries) {
  if (Array.isArray(siteEntries) && siteEntries.length) {
    await syncTargetsFromTabsForSites(siteEntries);
  }
  const targets = await loadTargets();
  const text = String(message || "");
  const rid = String(requestId || "");
  const ids = Array.isArray(siteIds) ? siteIds : [];
  for (const siteId of ids) {
    const rec = targets[siteId];
    if (!rec?.tabId) continue;
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
  }
  return { ok: true };
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
      await chrome.tabs.sendMessage(rec.tabId, { type: "OA_RUNTIME_NEW_CHAT" });
    } catch (_e) {
      /* ignore */
    }
  }
  return { ok: true };
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

chrome.windows.onRemoved.addListener(async (windowId) => {
  const targets = await loadTargets();
  let changed = false;
  for (const siteId of Object.keys(targets)) {
    if (targets[siteId]?.windowId === windowId) {
      delete targets[siteId];
      changed = true;
    }
  }
  if (changed) await saveTargets(targets);
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const targets = await loadTargets();
  let changed = false;
  for (const siteId of Object.keys(targets)) {
    if (targets[siteId]?.tabId === tabId) {
      delete targets[siteId];
      changed = true;
    }
  }
  if (changed) await saveTargets(targets);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return false;

  if (msg.type === "OA_SEND_PROGRESS" || msg.type === "OA_UPDATE_HISTORY" || msg.type === "OA_QUOTE_TEXT") {
    if (sender.tab) {
      broadcastToExtensionPages(msg);
    }
    return false;
  }

  if (msg.type === "OA_BG_OPEN_WINDOWS") {
    openOrReuseWindows(msg.sites)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
  }

  if (msg.type === "OA_BG_TILE" || msg.type === "OA_BG_RETILE") {
    applyTile(siteEntriesFromMessage(msg), msg.workArea)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
  }

  if (msg.type === "OA_BG_FOCUS") {
    focusTarget(msg.siteId)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
  }

  if (msg.type === "OA_BG_SEND_PROMPT") {
    sendPromptToTargets(msg.siteIds, msg.message, msg.requestId, msg.sites)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
  }

  if (msg.type === "OA_BG_NEW_CHAT") {
    newChatOnTargets(msg.siteIds, msg.sites)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
  }

  if (msg.type === "OA_BG_GET_STATE") {
    getState(msg.sites)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
  }

  if (msg.type === "OA_BG_OPEN_MAIN") {
    openMainPage();
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === "OA_BG_OPEN_CONTROLLER") {
    openControllerPage();
    sendResponse({ ok: true });
    return false;
  }

  return false;
});
