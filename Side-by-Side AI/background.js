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

async function applyTile(siteIds, workArea) {
  const targets = await loadTargets();
  const ids = Array.isArray(siteIds) ? siteIds.filter((id) => targets[id]?.windowId) : [];
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

async function sendPromptToTargets(siteIds, message, requestId) {
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

async function newChatOnTargets(siteIds) {
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

async function getState() {
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
    applyTile(msg.siteIds, msg.workArea)
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
    sendPromptToTargets(msg.siteIds, msg.message, msg.requestId)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
  }

  if (msg.type === "OA_BG_NEW_CHAT") {
    newChatOnTargets(msg.siteIds)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
  }

  if (msg.type === "OA_BG_GET_STATE") {
    getState()
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
