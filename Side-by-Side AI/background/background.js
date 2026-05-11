"use strict";

importScripts(
  "../shared/runtime-contract.js",
  "../shared/provider-catalog.js",
  "../shared/history-service.js",
  "bg-constants.js",
  "bg-session.js",
  "bg-tabs.js",
  "bg-switcher.js",
  "bg-tiling.js",
  "bg-actions.js"
);

globalThis.__ASK_AI_TOGETHER_RUNTIME__?.markBootstrapped?.({
  mode: "background",
  frameRole: "background",
  state: "background-runtime-ready"
});

function originInteger(value) {
  return Number.isInteger(value) ? value : null;
}

function getMessageOrigin(sender, explicitOrigin) {
  const fallback = explicitOrigin && typeof explicitOrigin === "object" ? explicitOrigin : {};
  const windowId = originInteger(sender?.tab?.windowId) ?? originInteger(fallback.windowId);
  const tabId = originInteger(sender?.tab?.id) ?? originInteger(fallback.tabId);
  const groupId = originInteger(sender?.tab?.groupId) ?? originInteger(fallback.groupId);
  const index = originInteger(sender?.tab?.index) ?? originInteger(fallback.index);
  return { windowId, tabId, groupId, index };
}

async function siteIdForSenderTab(sender) {
  const senderTabId = Number.isInteger(sender?.tab?.id) ? sender.tab.id : null;
  if (senderTabId == null) return "";
  const targets = await loadTargets();
  for (const rec of Object.values(targets)) {
    const siteId = String(rec?.siteId || "").trim();
    if (rec?.tabId === senderTabId && siteId && siteId !== "generic") return siteId;
  }
  return "";
}

async function resolveUpdateHistorySiteId(msg, sender) {
  const senderSiteId = await siteIdForSenderTab(sender);
  const payloadSiteId = String(msg?.payload?.siteId || "").trim();
  const explicitTargetSiteId = String(msg?.payload?.targetSiteId || msg?.siteId || msg?.targetSiteId || "").trim();
  const requestedSiteId = payloadSiteId && payloadSiteId !== "generic"
    ? payloadSiteId
    : explicitTargetSiteId && explicitTargetSiteId !== "generic"
      ? explicitTargetSiteId
      : "";
  if (senderSiteId) return senderSiteId;
  return requestedSiteId;
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
    const url = String(msg.payload?.url || "");
    resolveUpdateHistorySiteId(msg, sender)
      .then((siteId) => {
        if (!siteId || !url) return;
        patchRecentHistoryUrl(siteId, url).catch(() => {});
        if (sender.tab) {
          broadcastToExtensionPages({
            ...msg,
            payload: {
              ...(msg.payload || {}),
              siteId
            }
          });
        }
      })
      .catch(() => {});
    return false;
  }

  if (msg.type === "OA_HISTORY_MUTATE") {
    runHistoryMutation(msg.payload)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
  }

  if (msg.type === "OA_BG_OPEN_WINDOWS") {
    openOrReuseWindows(msg.sites, { origin: getMessageOrigin(sender, msg.origin), targetHints: msg.targetHints })
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
  }

  if (msg.type === "OA_BG_BIND_CURRENT_TARGET") {
    bindTargetForSenderTab(msg.site, sender)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
  }

  if (msg.type === "OA_BG_TILE" || msg.type === "OA_BG_RETILE") {
    applyTile(siteEntriesFromMessage(msg), msg.workArea, msg.layoutPreset, getMessageOrigin(sender, msg.origin), msg.targetHints)
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
    sendPromptToTargets(msg.siteIds, msg.message, msg.requestId, msg.sites, msg.files, getMessageOrigin(sender, msg.origin), msg.targetHints)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
  }

  if (msg.type === "OA_BG_COLLECT_LAST") {
    collectLastFromTargets(msg.siteIds, msg.sites, getMessageOrigin(sender, msg.origin), msg.targetHints)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
  }

  if (msg.type === "OA_BG_GET_CAPABILITIES") {
    getCapabilitiesForTargets(msg.siteIds, msg.sites)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, status: "transport-failed", error: String(e?.message || e) }));
    return true;
  }

  if (msg.type === "OA_BG_NEW_CHAT") {
    newChatOnTargets(msg.siteIds, msg.sites, getMessageOrigin(sender, msg.origin), msg.targetHints)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
  }

  if (msg.type === "OA_BG_GET_STATE") {
    getState(msg.sites, getMessageOrigin(sender, msg.origin), msg.targetHints)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
  }

  if (msg.type === "OA_BG_RESTORE_HISTORY_URLS") {
    restoreHistoryUrlsToTargets(msg.urls, msg.sites, getMessageOrigin(sender, msg.origin), msg.targetHints)
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
    return true;
  }

  return false;
});
