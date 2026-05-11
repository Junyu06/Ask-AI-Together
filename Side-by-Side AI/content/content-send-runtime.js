"use strict";

function notifyExtension(message) {
  try {
    if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
      chrome.runtime.sendMessage(message);
    }
  } catch (_e) {
    /* ignore */
  }
}

function postSendProgress(requestId, siteId, phase, extra = {}) {
  if (!requestId || !siteId) return;
  notifyExtension({
    type: "OA_SEND_PROGRESS",
    payload: {
      requestId,
      siteId,
      phase,
      ...extra
    }
  });
}

function makeContentRuntimeOutcome(status, fields = {}) {
  const runtime = globalThis.__ASK_AI_TOGETHER_RUNTIME__;
  if (runtime?.makeOutcome) return runtime.makeOutcome(status, fields);
  return {
    ok: status === "response-found" || status === "response-empty" || status === "send-submitted",
    status,
    timestamp: Date.now(),
    ...fields
  };
}

function effectiveContentSiteId(site, packet = {}) {
  const detectedSiteId = String(site?.id || "").trim();
  const configuredSiteId = String(packet?.siteId || packet?.providerId || "").trim();
  if ((!detectedSiteId || detectedSiteId === "generic") && configuredSiteId) return configuredSiteId;
  return detectedSiteId || configuredSiteId || "generic";
}

function captureSendSnapshot(site, inputEl) {
  const replyNodes = collectReplyNodes(site, inputEl);
  return {
    replyCount: replyNodes.length,
    latestReply: normalizeEditableText(extractLatestResponseText()),
    inputValue: readInputValue(inputEl)
  };
}

function hasPageAcknowledgedSend(before, after, message) {
  const expected = normalizeEditableText(message).trim();
  const beforeInput = normalizeEditableText(before?.inputValue || "").trim();
  const afterInput = normalizeEditableText(after?.inputValue || "").trim();

  if (after.replyCount > before.replyCount) return true;
  if (after.latestReply && after.latestReply !== before.latestReply) return true;
  if (expected && beforeInput === expected && afterInput !== expected) return true;
  if (!expected && afterInput !== beforeInput) return true;
  return false;
}

function waitForSendAcknowledgement(site, inputEl, message, baseline, timeoutMs = 3000) {
  return new Promise((resolve) => {
    let settled = false;
    let timeoutId = 0;
    let observer = null;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      if (observer) observer.disconnect();
      if (timeoutId) window.clearTimeout(timeoutId);
      resolve(value);
    };

    const inspect = () => {
      const currentInput = findFirst(site.inputSelectors) || inputEl;
      const snapshot = captureSendSnapshot(site, currentInput);
      if (hasPageAcknowledgedSend(baseline, snapshot, message)) {
        finish(true);
      }
    };

    timeoutId = window.setTimeout(() => finish(false), timeoutMs);
    observer = new MutationObserver(() => inspect());
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true
    });

    window.setTimeout(() => inspect(), 120);
    window.setTimeout(() => inspect(), 500);
    window.setTimeout(() => inspect(), 1200);
  });
}

async function sendPrompt(packet) {
  const site = currentSite() || GENERIC_SITE;
  const providerId = effectiveContentSiteId(site, typeof packet === "object" ? packet : {});
  const message = typeof packet === "string" ? packet : String(packet?.message || "");
  const files = Array.isArray(packet?.files) ? packet.files : Array.isArray(packet?.images) ? packet.images : [];
  const requestId = String(packet?.requestId || "");

  if (files.length) {
    postSendProgress(requestId, providerId, "capability-unsupported", { reason: "attachments-unsupported" });
    return makeContentRuntimeOutcome("capability-unsupported", {
      action: "sendPrompt",
      requestId,
      providerId,
      capabilities: [
        {
          siteId: providerId,
          supportsAttachments: false,
          attachmentMode: "unsupported"
        }
      ]
    });
  }

  const inputEl = findFirst(site.inputSelectors);
  if (!inputEl) {
    postSendProgress(requestId, providerId, "failed", { reason: "input-not-found" });
    return makeContentRuntimeOutcome("input-injection-failed", {
      action: "sendPrompt",
      requestId,
      providerId,
      reason: "input-not-found"
    });
  }

  postSendProgress(requestId, providerId, "injecting");
  const beforeSnapshot = captureSendSnapshot(site, inputEl);

  const hasText = message.length > 0;
  if (hasText && !setInputValue(inputEl, message, site.id)) {
    postSendProgress(requestId, providerId, "failed", { reason: "set-input-failed" });
    return makeContentRuntimeOutcome("input-injection-failed", {
      action: "sendPrompt",
      requestId,
      providerId,
      reason: "set-input-failed"
    });
  }
  if (!hasText) inputEl.focus();

  await sleep(80);
  const submitted = await clickSendWithRetry(site, inputEl, {
    attempts: 4,
    delay: 100
  });
  if (!submitted) {
    postSendProgress(requestId, providerId, "failed", { reason: "submit-failed" });
    return makeContentRuntimeOutcome("send-failed", {
      action: "sendPrompt",
      requestId,
      providerId,
      reason: "submit-failed"
    });
  }

  if (typeof rememberSubmittedPromptText === "function") {
    rememberSubmittedPromptText(message);
  }
  postSendProgress(requestId, providerId, "submitted");
  const acknowledged = await waitForSendAcknowledgement(site, inputEl, message, beforeSnapshot);
  postSendProgress(requestId, providerId, acknowledged ? "acknowledged" : "submitted-unacknowledged");
  return makeContentRuntimeOutcome(acknowledged ? "response-found" : "send-submitted", {
    action: "sendPrompt",
    requestId,
    providerId,
    reason: acknowledged ? undefined : "acknowledgement-pending"
  });
}

function clickByText() {
  const keywords = ["新聊天", "新对话", "新建对话", "new chat", "new conversation"];
  const nodes = Array.from(document.querySelectorAll("button, a, div[role='button'], [aria-label], [title]"));
  const target = nodes.find((node) => {
    if (!isVisible(node)) return false;
    const text = `${node.textContent || ""} ${node.getAttribute("aria-label") || ""} ${node.getAttribute("title") || ""}`
      .toLowerCase()
      .trim();
    return keywords.some((kw) => text.includes(kw.toLowerCase()));
  });
  if (!target) return false;
  target.click();
  return true;
}

function newChat() {
  const site = currentSite();
  if (!site) return;

  const targetUrl = String(site.newChatUrl || site.homeUrl || `${location.origin}/`).trim();
  if (targetUrl) {
    if (location.href === targetUrl) {
      location.reload();
      return;
    }
    location.href = targetUrl;
    return;
  }

  if (clickFirstVisible(site.newChatSelectors || [])) return;
  if (clickByText()) return;

  location.href = site.homeUrl || `${location.origin}/`;
}
