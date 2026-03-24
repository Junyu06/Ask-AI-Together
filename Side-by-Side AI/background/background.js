"use strict";

importScripts(
  "bg-constants.js",
  "bg-session.js",
  "bg-tabs.js",
  "bg-switcher.js",
  "bg-tiling.js",
  "bg-actions.js"
);

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

  if (msg.type === "OA_BG_SEND_PROMPT") {
    sendPromptToTargets(msg.siteIds, msg.message, msg.requestId, msg.sites)
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

  if (msg.type === "OA_BG_OPEN_CONTROLLER") {
    openControllerPage();
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === "OA_BG_OPEN_SWITCHER") {
    openSwitcherWindow()
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
  }

  if (msg.type === "OA_BG_RESTORE_HISTORY_URLS") {
    restoreHistoryUrlsToTargets(msg.urls, msg.sites)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
  }

  return false;
});
