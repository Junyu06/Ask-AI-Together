"use strict";

const historyService = globalThis.AskAiTogetherHistoryService;

function runtimeApi() {
  return globalThis.__ASK_AI_TOGETHER_RUNTIME__ || null;
}

function makeBackgroundRuntimeOutcome(status, fields = {}) {
  const runtime = runtimeApi();
  if (runtime?.makeOutcome) return runtime.makeOutcome(status, fields);
  return {
    ok: status === "response-found" || status === "response-empty",
    status,
    timestamp: Date.now(),
    ...fields
  };
}

function normalizeTargetSiteIds(siteIds, siteEntries) {
  const ids = Array.isArray(siteIds) ? siteIds.map((id) => String(id || "").trim()).filter(Boolean) : [];
  if (ids.length) return ids;
  if (!Array.isArray(siteEntries)) return [];
  return siteEntries.map((entry) => String(entry?.siteId || "").trim()).filter(Boolean);
}

function registerBackgroundProviders() {
  const runtime = runtimeApi();
  if (!runtime?.registerProviderDefinitions) return;
  const providers = Object.keys(BUILTIN_SITE_URLS).map((siteId) => ({
    id: siteId,
    displayName: SITE_DISPLAY_NAMES[siteId] || siteId,
    matchHosts: SITE_HOSTS[siteId] || [],
    homeUrl: BUILTIN_SITE_URLS[siteId],
    newChatUrl: BUILTIN_SITE_NEW_CHAT_URLS[siteId] || BUILTIN_SITE_URLS[siteId],
    capabilities: {
      supportsAttachments: false,
      attachmentMode: "unsupported"
    }
  }));
  runtime.registerProviderDefinitions(providers, { mode: "compatibility" });
}

registerBackgroundProviders();

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

async function patchRecentHistoryUrl(siteId, url) {
  if (!historyService?.patchRecentHistoryUrl) return false;
  return historyService.patchRecentHistoryUrl(siteId, url);
}

async function runHistoryMutation(payload) {
  const method = String(payload?.method || "");
  const args = Array.isArray(payload?.args) ? payload.args : [];
  const allowed = new Set([
    "saveHistory",
    "prependEntry",
    "deleteEntryById",
    "updateEntryById",
    "patchHistoryUrl",
    "patchRecentHistoryUrl"
  ]);
  if (!allowed.has(method) || typeof historyService?.[method] !== "function") {
    return { ok: false, error: "unsupported-history-mutation" };
  }
  try {
    const result = await historyService[method](...args);
    return { ok: true, result };
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
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

async function closeAllTargets() {
  const targets = await loadTargets();
  const siteIds = Object.keys(targets);
  if (!siteIds.length) return { ok: true, closedCount: 0 };
  return closeTargets(siteIds);
}

async function getCapabilitiesForTargets(siteIds, siteEntries) {
  const ids = normalizeTargetSiteIds(siteIds, siteEntries);
  const runtime = runtimeApi();
  if (runtime?.getCapabilities) return runtime.getCapabilities(ids, "compatibility");
  return makeBackgroundRuntimeOutcome("response-found", {
    capabilities: ids.map((siteId) => ({
      siteId,
      supportsAttachments: false,
      attachmentMode: "unsupported"
    }))
  });
}

function attachmentUnsupportedOutcome(siteIds, siteEntries, action) {
  const ids = normalizeTargetSiteIds(siteIds, siteEntries);
  return makeBackgroundRuntimeOutcome("capability-unsupported", {
    action,
    error: "attachments-unsupported",
    capabilities: ids.map((siteId) => ({
      siteId,
      supportsAttachments: false,
      attachmentMode: "unsupported"
    }))
  });
}

async function attachFilesToTargets(siteIds, siteEntries, files = []) {
  const attachments = Array.isArray(files) ? files : [];
  if (!attachments.length) return { ok: true, attachedCount: 0 };
  return attachmentUnsupportedOutcome(siteIds, siteEntries, "attachFiles");
}

const COMPATIBILITY_CONTENT_RUNTIME_FILES = [
  "shared/runtime-contract.js",
  "shared/provider-catalog.js",
  "shared/quote-helper.js",
  "content/content-sites.js",
  "content/content-dom.js",
  "content/content-response.js",
  "content/content-input.js",
  "content/content-attachments.js",
  "content/content-send-runtime.js",
  "content/content-shared-runtime.js",
  "content/content-quote-ui.js"
];

function isMissingContentRuntimeError(error) {
  const message = String(error?.message || error || "");
  return /Receiving end does not exist|Could not establish connection/i.test(message);
}

async function injectCompatibilityContentRuntime(tabId) {
  if (!Number.isInteger(tabId) || !chrome.scripting?.executeScript) return false;
  try {
    const guard = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        if (globalThis.__ASK_AI_TOGETHER_RUNTIME__?.getTransport?.("compatibility-content")) {
          return { ok: true, alreadyReady: true };
        }
        if (globalThis.__ASK_AI_TOGETHER_FULL_RUNTIME_INJECTION_STARTED__) {
          return { ok: false, reason: "full-runtime-injection-already-started" };
        }
        globalThis.__ASK_AI_TOGETHER_FULL_RUNTIME_INJECTION_STARTED__ = true;
        return { ok: true, shouldInject: true };
      }
    });
    const guardResult = guard?.[0]?.result || {};
    if (guardResult.alreadyReady) return true;
    if (!guardResult.shouldInject) return false;
    await chrome.scripting.executeScript({
      target: { tabId },
      files: COMPATIBILITY_CONTENT_RUNTIME_FILES
    });
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        globalThis.__ASK_AI_TOGETHER_FULL_RUNTIME_INJECTION_COMPLETE__ = true;
      }
    });
    return true;
  } catch (_error) {
    return false;
  }
}

async function probeCompatibilityContentRuntime(tabId) {
  if (!Number.isInteger(tabId) || !chrome.scripting?.executeScript) return null;
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const runtime = globalThis.__ASK_AI_TOGETHER_RUNTIME__ || null;
        return {
          hasRuntime: Boolean(runtime),
          hasTransport: Boolean(runtime?.getTransport?.("compatibility-content")),
          bootstrapState: runtime?.bootstrap?.state || "",
          hasRuntimeMessageListener: Boolean(runtime?.listenerFlags?.["compatibility-content-runtime-message"]),
          hasRecoveryListener: Boolean(runtime?.listenerFlags?.["compatibility-content-runtime-recovery"]),
          listenerFlags: runtime?.listenerFlags || {}
        };
      }
    });
    return results?.[0]?.result || null;
  } catch (_error) {
    return null;
  }
}

async function injectCompatibilitySharedTransport(tabId) {
  if (!Number.isInteger(tabId) || !chrome.scripting?.executeScript) return false;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content/content-shared-runtime.js"]
    });
    return true;
  } catch (_error) {
    return false;
  }
}

async function registerCompatibilityContentRuntimeRecovery(tabId) {
  if (!Number.isInteger(tabId) || !chrome.scripting?.executeScript) return false;
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const runtime = globalThis.__ASK_AI_TOGETHER_RUNTIME__ || null;
        const transport = runtime?.getTransport?.("compatibility-content");
        if (!runtime || !transport) return { ok: false, reason: "runtime-not-ready" };
        if (runtime.markListenerRegistered) {
          if (runtime.markListenerRegistered("compatibility-content-runtime-recovery") === false) {
            return { ok: true, registered: false, alreadyRegistered: true };
          }
        } else if (globalThis.__ASK_AI_TOGETHER_RECOVERY_LISTENER_REGISTERED__) {
          return { ok: true, registered: false, alreadyRegistered: true };
        } else {
          globalThis.__ASK_AI_TOGETHER_RECOVERY_LISTENER_REGISTERED__ = true;
        }

        globalThis.__ASK_AI_TOGETHER_RECOVERY_LISTENER_LOADS__ =
          (Number(globalThis.__ASK_AI_TOGETHER_RECOVERY_LISTENER_LOADS__) || 0) + 1;

        function makeOutcome(status, fields = {}) {
          if (runtime?.makeOutcome) return runtime.makeOutcome(status, fields);
          return Object.assign({ ok: status !== "transport-failed" && status !== "runtime-not-ready", status }, fields);
        }

        function providerIdFromMessage(msg) {
          return String(msg?.siteId || msg?.targetSiteId || msg?.providerId || "generic");
        }

        chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
          if (!msg || !msg.type) return false;
          if (
            msg.type !== "OA_RUNTIME_CHAT" &&
            msg.type !== "OA_RUNTIME_ATTACH_FILES" &&
            msg.type !== "OA_RUNTIME_NEW_CHAT" &&
            msg.type !== "OA_RUNTIME_COLLECT_LAST"
          ) {
            return false;
          }
          const providerId = providerIdFromMessage(msg);
          const requestId = String(msg.requestId || "");

          if (msg.type === "OA_RUNTIME_ATTACH_FILES") {
            sendResponse(makeOutcome("capability-unsupported", {
              action: "attachFiles",
              requestId,
              providerId,
              capabilities: [{ siteId: providerId, supportsAttachments: false, attachmentMode: "unsupported" }]
            }));
            return false;
          }

          const activeTransport = runtime?.getTransport?.("compatibility-content");
          if (!activeTransport) {
            sendResponse(makeOutcome("runtime-not-ready", { requestId, providerId }));
            return false;
          }

          if (msg.type === "OA_RUNTIME_CHAT") {
            if (!activeTransport.sendPrompt) {
              sendResponse(makeOutcome("runtime-not-ready", { action: "sendPrompt", requestId, providerId }));
              return false;
            }
            void activeTransport.sendPrompt([providerId], String(msg.message || ""), {
              requestId,
              payload: { action: "sendPrompt", message: String(msg.message || ""), files: msg.files || [] }
            })
              .then((outcome) => sendResponse(outcome || makeOutcome("transport-failed", { action: "sendPrompt", requestId, providerId })))
              .catch((error) => sendResponse(makeOutcome("transport-failed", {
                action: "sendPrompt",
                requestId,
                providerId,
                error: String(error?.message || error || "")
              })));
            return true;
          }

          if (msg.type === "OA_RUNTIME_NEW_CHAT") {
            if (!activeTransport.newChat) {
              sendResponse(makeOutcome("runtime-not-ready", { action: "newChat", requestId, providerId }));
              return false;
            }
            void activeTransport.newChat([providerId], { requestId }).catch(() => {});
            sendResponse(makeOutcome("response-found", { action: "newChat", requestId, providerId }));
            return false;
          }

          if (msg.type === "OA_RUNTIME_COLLECT_LAST") {
            if (!activeTransport.collectLatest) {
              sendResponse(makeOutcome("runtime-not-ready", { action: "collectLatest", requestId, providerId, siteId: providerId, text: "" }));
              return false;
            }
            void activeTransport.collectLatest([providerId], { requestId })
              .then((outcome) => sendResponse({
                ok: outcome?.ok !== false,
                status: outcome?.status || "response-empty",
                siteId: providerId,
                text: outcome?.text || ""
              }))
              .catch(() => sendResponse(makeOutcome("transport-failed", {
                action: "collectLatest",
                requestId,
                providerId,
                siteId: providerId,
                text: ""
              })));
            return true;
          }

          return false;
        });

        return {
          ok: true,
          registered: true,
          loads: globalThis.__ASK_AI_TOGETHER_RECOVERY_LISTENER_LOADS__
        };
      }
    });
    return results?.[0]?.result?.ok === true;
  } catch (_error) {
    return false;
  }
}

async function recoverCompatibilityContentRuntime(tabId) {
  const probe = await probeCompatibilityContentRuntime(tabId);
  if (!probe?.hasRuntime) return injectCompatibilityContentRuntime(tabId);
  if (!probe.hasTransport) {
    await injectCompatibilitySharedTransport(tabId);
    const refreshed = await probeCompatibilityContentRuntime(tabId);
    if (!refreshed?.hasTransport) return false;
    if (refreshed.hasRuntimeMessageListener) return true;
    return registerCompatibilityContentRuntimeRecovery(tabId);
  }
  if (probe.hasRuntimeMessageListener || probe.hasRecoveryListener) return true;
  return registerCompatibilityContentRuntimeRecovery(tabId);
}

function isRecoverableRuntimeOutcome(outcome) {
  return outcome?.ok === false && outcome.status === "runtime-not-ready";
}

async function sendRuntimeMessageToTarget(tabId, message) {
  const topFrame = { frameId: 0 };
  try {
    const outcome = await chrome.tabs.sendMessage(tabId, message, topFrame);
    if (isRecoverableRuntimeOutcome(outcome) && await recoverCompatibilityContentRuntime(tabId)) {
      return chrome.tabs.sendMessage(tabId, message, topFrame);
    }
    return outcome;
  } catch (error) {
    if (!isMissingContentRuntimeError(error) || !(await recoverCompatibilityContentRuntime(tabId))) {
      throw error;
    }
    return chrome.tabs.sendMessage(tabId, message, topFrame);
  }
}

/** 与旧版分屏页类似：广播发送成功后写入本地 oa_history（简化版，无去重合并） */
async function appendHistoryAfterSend(message, siteIds, targets) {
  const text = String(message || "").trim();
  if (!text) return;
  const ids = Array.isArray(siteIds) ? siteIds : [];
  const data = await chrome.storage.local.get(["oa_custom_sites"]);
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
  const entry = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    prompt: text.slice(0, 2000),
    aiSummary: false,
    ts: Date.now(),
    siteIds: ids,
    sites: displayNames,
    urls
  };
  await historyService?.prependEntry?.(entry);
}

function siteUrlForAction(siteId, siteEntries) {
  const clean = String(siteId || "");
  const entry = Array.isArray(siteEntries)
    ? siteEntries.find((candidate) => String(candidate?.siteId || "") === clean)
    : null;
  return String(entry?.url || "").trim() || BUILTIN_SITE_URLS[clean] || "";
}

async function ensureTargetsForAction(siteIds, siteEntries, targets, origin, targetHints) {
  const ids = Array.isArray(siteIds) ? siteIds.map((id) => String(id || "")).filter(Boolean) : [];
  let changed = false;
  for (const siteId of ids) {
    const url = siteUrlForAction(siteId, siteEntries);
    const existing = targets[siteId];
    if (existing?.tabId && typeof getValidTargetTab === "function") {
      const validTab = await getValidTargetTab(existing, siteId, url);
      if (validTab) {
        if (existing.windowId !== validTab.windowId || existing.tabId !== validTab.id) {
          targets[siteId] = { siteId, windowId: validTab.windowId, tabId: validTab.id, transport: "window" };
          changed = true;
        }
        continue;
      }
      delete targets[siteId];
      changed = true;
    } else if (existing?.tabId) {
      continue;
    }

    let tab = null;
    if (typeof targetHintForSite === "function" && typeof getValidTargetTab === "function") {
      const hint = targetHintForSite(targetHints, siteId);
      if (hint?.tabId) tab = await getValidTargetTab({ tabId: hint.tabId }, siteId, url);
    }
    if (!tab && typeof findTabForAiSite === "function") {
      tab = await findTabForAiSite(siteId, url, origin);
    }
    if (tab?.id != null && tab.windowId != null) {
      targets[siteId] = { siteId, windowId: tab.windowId, tabId: tab.id, transport: "window" };
      changed = true;
    }
  }
  if (changed) await saveTargets(targets);
}

async function sendPromptToTargets(siteIds, message, requestId, siteEntries, files = [], origin, targetHints, actionContext = {}) {
  const attachments = Array.isArray(files) ? files : [];
  if (attachments.length) {
    return attachmentUnsupportedOutcome(siteIds, siteEntries, "sendPrompt");
  }
  if (Array.isArray(siteEntries) && siteEntries.length) {
    await syncTargetsFromTabsForSites(siteEntries, origin, targetHints);
  }
  const targets = await loadTargets();
  const text = String(message || "");
  const rid = String(requestId || "");
  const ids = Array.isArray(siteIds) ? siteIds : [];
  await ensureTargetsForAction(ids, siteEntries, targets, origin, targetHints);
  const outcomes = await Promise.all(
    ids.map(async (siteId) => {
      const rec = targets[siteId];
      if (!rec?.tabId) {
        return makeBackgroundRuntimeOutcome("transport-failed", {
          action: "sendPrompt",
          requestId: rid,
          providerId: siteId,
          reason: "missing-tab"
        });
      }
      try {
        const outcome = await sendRuntimeMessageToTarget(rec.tabId, {
          type: "OA_RUNTIME_CHAT",
          message: text,
          requestId: rid,
          siteId
        });
        return outcome || makeBackgroundRuntimeOutcome("transport-failed", {
          action: "sendPrompt",
          requestId: rid,
          providerId: siteId,
          reason: "empty-runtime-response"
        });
      } catch (_e) {
        broadcastToExtensionPages({
          type: "OA_SEND_PROGRESS",
          payload: { requestId: rid, siteId, phase: "failed", reason: "tab-unreachable" }
        });
        return makeBackgroundRuntimeOutcome("transport-failed", {
          action: "sendPrompt",
          requestId: rid,
          providerId: siteId,
          reason: "tab-unreachable"
        });
      }
    })
  );
  const failed = outcomes.filter((outcome) => outcome?.ok === false);
  const succeededIds = ids.filter((_siteId, index) => outcomes[index]?.ok !== false);
  if (failed.length && !succeededIds.length) {
    return {
      ok: false,
      status: failed[0]?.status || "transport-failed",
      outcomes
    };
  }
  if (text.trim() && succeededIds.length && actionContext?.historyMode !== "metadata-only" && actionContext?.bypassHistory !== true) {
    await appendHistoryAfterSend(text, succeededIds, targets);
  }
  if (failed.length) {
    return {
      ok: true,
      status: "partial-success",
      partialSuccess: true,
      sentCount: succeededIds.length,
      failedCount: failed.length,
      outcomes
    };
  }
  return { ok: true, status: "response-found", outcomes };
}

/**
 * 从各独立 AI 标签页抓取最新回复（与旧版 COLLECT_LAST_RESPONSE 语义一致）。
 */
async function collectLastFromTargets(siteIds, siteEntries, origin, targetHints) {
  if (Array.isArray(siteEntries) && siteEntries.length) {
    await syncTargetsFromTabsForSites(siteEntries, origin, targetHints);
  }
  const targets = await loadTargets();
  const ids = Array.isArray(siteIds) ? siteIds : [];
  await ensureTargetsForAction(ids, siteEntries, targets, origin, targetHints);
  const sections = [];
  for (const siteId of ids) {
    const rec = targets[siteId];
    let text = "";
    let status = "transport-failed";
    let reason = "missing-tab";
    if (rec?.tabId) {
      try {
        const r = await sendRuntimeMessageToTarget(rec.tabId, { type: "OA_RUNTIME_COLLECT_LAST", siteId });
        text = r?.text || "";
        status = r?.status || (text ? "response-found" : "response-empty");
        reason = r?.reason || r?.error || "";
      } catch (_e) {
        text = "";
        status = "transport-failed";
        reason = "tab-unreachable";
      }
    }
    sections.push({
      siteId,
      siteName: SITE_DISPLAY_NAMES[siteId] || siteId,
      text,
      status,
      reason
    });
  }
  return { ok: true, sections };
}

/** 串行执行，避免多路并发时各窗口 chrome.windows.update 抢焦点导致死循环/卡死 */
let __oaNewChatChain = Promise.resolve();
const NEW_CHAT_NAVIGATION_TIMEOUT_MS = 12000;

function normalizeNavigationUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    let path = url.pathname || "/";
    if (path.length > 1) path = path.replace(/\/+$/, "");
    return `${url.origin}${path}`;
  } catch (_error) {
    return String(value || "").trim().replace(/[?#].*$/, "").replace(/\/+$/, "");
  }
}

function urlsMatchForNewChat(currentUrl, targetUrl) {
  const current = normalizeNavigationUrl(currentUrl);
  const target = normalizeNavigationUrl(targetUrl);
  return Boolean(current && target && current === target);
}

function tabLooksReadyForNewChat(tab, targetUrl) {
  if (!tab?.url) return false;
  if (tab.status !== "complete") return false;
  return urlsMatchForNewChat(tab.url, targetUrl);
}

function waitForNewChatNavigation(tabId, siteId, targetUrl) {
  return new Promise((resolve) => {
    let settled = false;
    let timeoutId = 0;
    let listener = null;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      if (listener && chrome.tabs.onUpdated?.removeListener) {
        try {
          chrome.tabs.onUpdated.removeListener(listener);
        } catch (_error) {
          /* ignore */
        }
      }
      resolve(result);
    };

    const inspect = (tab) => {
      if (tabLooksReadyForNewChat(tab, targetUrl)) {
        finish({ ok: true, tab });
        return true;
      }
      return false;
    };

    const inspectCurrent = async () => {
      try {
        const tab = await chrome.tabs.get(tabId);
        inspect(tab);
      } catch (_error) {
        /* keep waiting until timeout */
      }
    };

    listener = (updatedTabId, changeInfo, tab) => {
      if (updatedTabId !== tabId || settled) return;
      const candidate = {
        ...(tab || {}),
        url: changeInfo?.url || tab?.url,
        status: changeInfo?.status || tab?.status
      };
      if (inspect(candidate)) return;
      if (changeInfo?.status === "complete" || changeInfo?.url) {
        void inspectCurrent();
      }
    };

    timeoutId = setTimeout(() => finish({
      ok: false,
      status: "navigation-timeout",
      reason: "new-chat-navigation-timeout"
    }), NEW_CHAT_NAVIGATION_TIMEOUT_MS);

    if (chrome.tabs.onUpdated?.addListener) {
      chrome.tabs.onUpdated.addListener(listener);
    }
    void inspectCurrent();
  });
}

async function navigateTargetToNewChat(siteId, rec, siteEntries) {
  const targetUrl = String(BUILTIN_SITE_NEW_CHAT_URLS[siteId] || BUILTIN_SITE_URLS[siteId] || siteUrlForAction(siteId, siteEntries)).trim();
  if (!targetUrl) {
    return makeBackgroundRuntimeOutcome("transport-failed", {
      ok: false,
      action: "newChat",
      providerId: siteId,
      siteId,
      reason: "missing-new-chat-url"
    });
  }

  try {
    const currentTab = await chrome.tabs.get(rec.tabId);
    if (urlsMatchForNewChat(currentTab?.url, targetUrl)) {
      await chrome.tabs.reload(rec.tabId);
    } else {
      await chrome.tabs.update(rec.tabId, { url: targetUrl });
    }
  } catch (error) {
    return makeBackgroundRuntimeOutcome("transport-failed", {
      ok: false,
      action: "newChat",
      providerId: siteId,
      siteId,
      reason: "navigation-failed",
      error: String(error?.message || error || "")
    });
  }

  const navigation = await waitForNewChatNavigation(rec.tabId, siteId, targetUrl);
  if (navigation?.ok !== true) {
    return makeBackgroundRuntimeOutcome("new-chat-failed", {
      ok: false,
      action: "newChat",
      providerId: siteId,
      siteId,
      reason: navigation?.reason || "new-chat-navigation-timeout"
    });
  }

  const runtimeReady = await recoverCompatibilityContentRuntime(rec.tabId);
  if (!runtimeReady) {
    return makeBackgroundRuntimeOutcome("runtime-not-ready", {
      ok: false,
      action: "newChat",
      providerId: siteId,
      siteId,
      reason: "runtime-not-ready-after-new-chat"
    });
  }

  return makeBackgroundRuntimeOutcome("response-found", {
    action: "newChat",
    providerId: siteId,
    siteId,
    reason: "",
    navigatedUrl: targetUrl
  });
}

async function newChatOnTargets(siteIds, siteEntries, origin, targetHints) {
  const job = async () => {
    return withInitiatorFocusRestored(origin, async () => {
      if (Array.isArray(siteEntries) && siteEntries.length) {
        await syncTargetsFromTabsForSites(siteEntries, origin, targetHints);
      }
      const targets = await loadTargets();
      const ids = Array.isArray(siteIds) ? siteIds : [];
      await ensureTargetsForAction(ids, siteEntries, targets, origin, targetHints);
      const outcomes = [];
      for (const siteId of ids) {
        const rec = targets[siteId];
        if (!rec?.tabId) {
          outcomes.push(makeBackgroundRuntimeOutcome("transport-failed", {
            action: "newChat",
            providerId: siteId,
            siteId,
            reason: "missing-tab"
          }));
          continue;
        }
        try {
          outcomes.push(await navigateTargetToNewChat(siteId, rec, siteEntries));
        } catch (error) {
          outcomes.push(makeBackgroundRuntimeOutcome("transport-failed", {
            action: "newChat",
            providerId: siteId,
            siteId,
            reason: "tab-unreachable",
            error: String(error?.message || error || "")
          }));
        }
        if (typeof delay === "function") await delay(40);
      }
      const failed = outcomes.filter((outcome) => outcome?.ok === false);
      if (failed.length) {
        return {
          ok: false,
          status: failed.length === outcomes.length ? "transport-failed" : "partial-failed",
          failedCount: failed.length,
          succeededCount: outcomes.length - failed.length,
          outcomes
        };
      }
      return {
        ok: true,
        status: "response-found",
        succeededCount: outcomes.length,
        failedCount: 0,
        outcomes
      };
    });
  };
  const p = __oaNewChatChain.then(job);
  __oaNewChatChain = p.catch(() => {});
  return p;
}

/**
 * 将已绑定标签页导航到历史记录里保存的各站点 URL（恢复当时对话页）。
 */
async function restoreHistoryUrlsToTargets(urls, siteEntries, origin, targetHints) {
  if (!urls || typeof urls !== "object") {
    return { ok: false, error: "no-urls" };
  }
  return withInitiatorFocusRestored(origin, async () => {
    const historySites = Array.isArray(siteEntries) ? siteEntries.filter((entry) => String(entry?.siteId || "")) : [];
    if (historySites.length) {
      await syncTargetsFromTabsForSites(historySites, origin, targetHints);
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

async function getState(siteEntries, origin, targetHints) {
  if (Array.isArray(siteEntries) && siteEntries.length) {
    await syncTargetsFromTabsForSites(siteEntries, origin, targetHints);
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

runtimeApi()?.registerTransport?.("compatibility", {
  sendPrompt(siteIds, message) {
    const requestId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    return sendPromptToTargets(siteIds, message, requestId, []);
  },
  collectLatest(siteIds) {
    return collectLastFromTargets(siteIds, []);
  },
  newChat(siteIds) {
    return newChatOnTargets(siteIds, [], {});
  },
  getCapabilities(siteIds) {
    return getCapabilitiesForTargets(siteIds, []);
  }
});
