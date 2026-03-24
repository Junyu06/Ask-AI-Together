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
  const raw = typeof packet === "string" ? packet : String(packet?.message || "");
  const message = stripLeadingNewlinesForPrompt(raw);
  const files = Array.isArray(packet?.files) ? packet.files : Array.isArray(packet?.images) ? packet.images : [];
  const requestId = String(packet?.requestId || "");

  const inputEl = findFirst(site.inputSelectors);
  if (!inputEl) {
    postSendProgress(requestId, site.id, "failed", { reason: "input-not-found" });
    return;
  }

  postSendProgress(requestId, site.id, "injecting");
  const beforeSnapshot = captureSendSnapshot(site, inputEl);

  const hasText = message.length > 0;
  if (hasText && !setInputValue(inputEl, message, site.id)) {
    postSendProgress(requestId, site.id, "failed", { reason: "set-input-failed" });
    return;
  }
  if (!hasText) inputEl.focus();

  if (files.length) {
    await attachFiles(inputEl, files, site.id);
  }

  await sleep(files.length ? 220 : 80);
  const submitted = await clickSendWithRetry(site, inputEl, {
    attempts: files.length ? 20 : 4,
    delay: files.length ? 250 : 100
  });
  if (!submitted) {
    postSendProgress(requestId, site.id, "failed", { reason: "submit-failed" });
    return;
  }

  postSendProgress(requestId, site.id, "submitted");
  const acknowledged = await waitForSendAcknowledgement(site, inputEl, message, beforeSnapshot);
  postSendProgress(requestId, site.id, acknowledged ? "acknowledged" : "timeout");
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
