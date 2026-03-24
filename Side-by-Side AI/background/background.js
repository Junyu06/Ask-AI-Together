"use strict";

importScripts(
  "bg-constants.js",
  "bg-session.js",
  "bg-tabs.js",
  "bg-switcher.js",
  "bg-tiling.js",
  "bg-actions.js"
);

function getMessageOrigin(sender) {
  const windowId = Number.isInteger(sender?.tab?.windowId) ? sender.tab.windowId : null;
  const tabId = Number.isInteger(sender?.tab?.id) ? sender.tab.id : null;
  return { windowId, tabId };
}

function ensureToolbarClickRunsTilingOnly() {
  try {
    chrome.action.setPopup({ popup: "" });
  } catch (_e) {
    /* ignore */
  }
}

/** 将仍指向已删除扩展页的标签重定向到选项页（避免 ERR_FILE_NOT_FOUND 与误聚焦）。 */
function redirectStaleExtensionUiTabs() {
  const target = chrome.runtime.getURL(OPTIONS_PAGE);
  chrome.tabs.query({}).then((tabs) => {
    for (const t of tabs) {
      const u = t.url || "";
      if (t.id != null && isStaleExtensionUiUrl(u)) {
        chrome.tabs.update(t.id, { url: target }).catch(() => {});
      }
    }
  }).catch(() => {});
}

chrome.action.onClicked.addListener((tab) => {
  void openSwitcherFromToolbarAction(tab);
});

chrome.runtime.onInstalled.addListener(() => {
  ensureToolbarClickRunsTilingOnly();
  redirectStaleExtensionUiTabs();
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

chrome.runtime.onStartup.addListener(() => {
  ensureToolbarClickRunsTilingOnly();
  redirectStaleExtensionUiTabs();
});

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

  if (msg.type === "OA_SEND_PROGRESS" || msg.type === "OA_QUOTE_TEXT") {
    if (sender.tab) {
      broadcastToExtensionPages(msg);
    }
    return false;
  }

  if (msg.type === "OA_UPDATE_HISTORY") {
    const siteId = String(msg.payload?.siteId || "");
    const url = String(msg.payload?.url || "");
    patchRecentHistoryUrl(siteId, url).catch(() => {});
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
    applyTile(siteEntriesFromMessage(msg), msg.workArea, msg.layoutPreset)
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

  if (msg.type === "OA_BG_CLOSE_ALL_TARGETS") {
    closeAllTargets()
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
  }

  if (msg.type === "OA_BG_ATTACH_FILES") {
    attachFilesToTargets(msg.siteIds, msg.sites, msg.files)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
  }

  if (msg.type === "OA_BG_SEND_PROMPT") {
    sendPromptToTargets(msg.siteIds, msg.message, msg.requestId, msg.sites, msg.files)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
  }

  if (msg.type === "OA_BG_COLLECT_LAST") {
    collectLastFromTargets(msg.siteIds, msg.sites)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
  }

  if (msg.type === "OA_BG_NEW_CHAT") {
    newChatOnTargets(msg.siteIds, msg.sites, getMessageOrigin(sender))
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

  if (msg.type === "OA_BG_RESTORE_HISTORY_URLS") {
    restoreHistoryUrlsToTargets(msg.urls, msg.sites, getMessageOrigin(sender))
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
  }

  return false;
});
