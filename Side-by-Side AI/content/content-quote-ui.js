"use strict";

function isSelectionInsideEditable(range) {
  const node = range.commonAncestorContainer?.nodeType === Node.ELEMENT_NODE
    ? range.commonAncestorContainer
    : range.commonAncestorContainer?.parentElement;
  if (!node) return false;
  return Boolean(node.closest?.("textarea, input, [contenteditable='true']"));
}

function quoteBtnLabel() {
  const lang = String(navigator.language || "").toLowerCase();
  return lang.startsWith("zh") ? "引用" : "Quote";
}

function removeQuoteButton() {
  const old = document.querySelector(".oa-quote-float-btn");
  if (old) old.remove();
}

function createQuoteButton(rect, text) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "oa-quote-float-btn";
  button.textContent = quoteBtnLabel();
  Object.assign(button.style, {
    position: "absolute",
    zIndex: "2147483646",
    left: `${rect.left + window.scrollX}px`,
    top: `${rect.bottom + window.scrollY + 8}px`,
    padding: "4px 8px",
    border: "1px solid rgba(255,255,255,0.2)",
    borderRadius: "8px",
    background: "rgba(20,20,20,0.9)",
    color: "#fff",
    fontSize: "12px",
    lineHeight: "16px",
    cursor: "pointer",
    boxShadow: "0 8px 18px rgba(0,0,0,0.35)"
  });

  button.addEventListener("click", (event) => {
    event.stopPropagation();
    const payload = {
      text,
      siteId: (currentSite() || GENERIC_SITE).id,
      url: location.href
    };
    notifyExtension({ type: "OA_QUOTE_TEXT", payload });
    removeQuoteButton();
    const selection = window.getSelection();
    selection?.removeAllRanges();
  });

  return button;
}

function debounce(fn, wait) {
  let timer = null;
  return (...args) => {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  };
}

const showQuoteButton = debounce(() => {
  try {
    removeQuoteButton();
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (!text || !selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (range.collapsed || isSelectionInsideEditable(range)) return;
    const clipped = text.slice(0, 2500);
    const rect = range.getBoundingClientRect();
    if (!rect.width && !rect.height) return;
    document.body.appendChild(createQuoteButton(rect, clipped));
  } catch (_error) {
    // Ignore UI-only errors.
  }
}, 160);

function isTopLevelAiSurface() {
  return window.parent === window && !!currentSite();
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return false;
  if (
    msg.type === "OA_RUNTIME_CHAT" ||
    msg.type === "OA_RUNTIME_ATTACH_FILES" ||
    msg.type === "OA_RUNTIME_NEW_CHAT" ||
    msg.type === "OA_RUNTIME_COLLECT_LAST"
  ) {
    if (window !== window.top) return false;
  }
  if (msg.type === "OA_RUNTIME_CHAT") {
    void sendPrompt({
      message: msg.message || "",
      files: msg.files || [],
      requestId: msg.requestId || ""
    }).catch(() => {});
    sendResponse({ ok: true });
    return false;
  }
  if (msg.type === "OA_RUNTIME_ATTACH_FILES") {
    const site = currentSite() || GENERIC_SITE;
    const inputEl = findFirst(site.inputSelectors);
    if (!inputEl) {
      sendResponse({ ok: false, reason: "input-not-found" });
      return false;
    }
    void attachFiles(inputEl, msg.files || [], site.id)
      .then((ok) => sendResponse({ ok }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (msg.type === "OA_RUNTIME_NEW_CHAT") {
    newChat();
    sendResponse({ ok: true });
    return false;
  }
  if (msg.type === "OA_RUNTIME_COLLECT_LAST") {
    const site = currentSite() || GENERIC_SITE;
    sendResponse({ ok: true, siteId: site.id, text: extractLatestResponseText() });
    return false;
  }
  return false;
});

let lastHref = location.href;
function postUrlUpdate() {
  const site = currentSite() || GENERIC_SITE;
  const payload = {
    siteId: site.id,
    url: location.href
  };
  notifyExtension({ type: "OA_UPDATE_HISTORY", payload });
}

if (isTopLevelAiSurface()) {
  document.addEventListener("mouseup", showQuoteButton);
  document.addEventListener("touchend", showQuoteButton);
  document.addEventListener("click", (event) => {
    if (event.target && event.target.closest(".oa-quote-float-btn")) return;
    removeQuoteButton();
  });
  window.addEventListener("scroll", removeQuoteButton, true);
  postUrlUpdate();
  setInterval(() => {
    if (location.href === lastHref) return;
    lastHref = location.href;
    postUrlUpdate();
  }, 600);
}
