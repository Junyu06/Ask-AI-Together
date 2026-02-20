"use strict";

const SITES = [
  {
    id: "chatgpt",
    matchHosts: ["chatgpt.com", "chat.openai.com"],
    homeUrl: "https://chatgpt.com/",
    inputSelectors: ["#prompt-textarea", "textarea"],
    sendSelectors: ['button[data-testid="send-button"]', 'button[type="submit"]'],
    newChatSelectors: ['[data-testid="create-new-chat-button"]', "a.no-draggable", 'a[href="/"]']
  },
  {
    id: "deepseek",
    matchHosts: ["chat.deepseek.com"],
    homeUrl: "https://chat.deepseek.com/",
    inputSelectors: ["textarea#chat-input", "textarea"],
    sendSelectors: ['button[type="submit"]'],
    newChatSelectors: ["._5a8ac7a", 'a[href="/"]']
  },
  {
    id: "kimi",
    matchHosts: ["www.kimi.com"],
    homeUrl: "https://www.kimi.com/",
    inputSelectors: ['div[contenteditable="true"]', "textarea"],
    sendSelectors: [".send-button-container", 'button[type="submit"]'],
    newChatSelectors: [".new-chat-btn", 'a[href="/"]']
  },
  {
    id: "qwen",
    matchHosts: ["chat.qwen.ai"],
    homeUrl: "https://chat.qwen.ai/",
    inputSelectors: [".message-input-textarea", "textarea"],
    sendSelectors: ['button[type="submit"]'],
    newChatSelectors: [".sidebar-entry-list-content", 'a[href="/"]']
  },
  {
    id: "doubao",
    matchHosts: ["www.doubao.com"],
    homeUrl: "https://www.doubao.com/",
    inputSelectors: ["textarea"],
    sendSelectors: ["#flow-end-msg-send", 'button[type="submit"]'],
    newChatSelectors: ['div[data-testid="create_conversation_button"]', 'a[href="/"]']
  },
  {
    id: "yuanbao",
    matchHosts: ["yuanbao.tencent.com"],
    homeUrl: "https://yuanbao.tencent.com/",
    inputSelectors: ["div.ql-editor", "textarea", 'div[contenteditable="true"]'],
    sendSelectors: [".icon-send", 'button[type="submit"]'],
    newChatSelectors: [".yb-common-nav__trigger", 'a[href="/"]']
  },
  {
    id: "grok",
    matchHosts: ["grok.com"],
    homeUrl: "https://grok.com/",
    inputSelectors: ["textarea[aria-label]", 'div[contenteditable="true"]', "textarea"],
    sendSelectors: ['button[type="submit"]'],
    newChatSelectors: ['a[data-sidebar="menu-button"]', 'a[href="/"]']
  },
  {
    id: "gemini",
    matchHosts: ["gemini.google.com"],
    homeUrl: "https://gemini.google.com/",
    inputSelectors: [".ql-editor", 'div[contenteditable="true"]', "textarea"],
    sendSelectors: ["button.submit", 'button[type="submit"]'],
    newChatSelectors: ['[data-test-id="new-chat-button"]', 'a[href="/"]']
  }
];

function currentSite() {
  const host = location.hostname;
  return SITES.find((site) => site.matchHosts.some((h) => host.includes(h))) || null;
}

const GENERIC_SITE = {
  id: "generic",
  inputSelectors: ["textarea", 'div[contenteditable="true"]', "input[type='text']"],
  sendSelectors: ['button[type="submit"]', "button.send", "button[aria-label*='Send']"],
  newChatSelectors: []
};

function findFirst(selectors) {
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) return el;
  }
  return null;
}

function isVisible(el) {
  if (!el) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function clickFirstVisible(selectors) {
  for (const selector of selectors) {
    const nodes = Array.from(document.querySelectorAll(selector));
    const target = nodes.find(isVisible);
    if (target) {
      target.click();
      return true;
    }
  }
  return false;
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

function setInputValue(el, text) {
  if (!el) return false;

  const tag = el.tagName;
  if (tag === "TEXTAREA" || tag === "INPUT") {
    el.focus();
    el.value = text;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }

  if (el.isContentEditable) {
    el.focus();
    el.textContent = text;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  return false;
}

function clickSend(site, inputEl) {
  const btn = findFirst(site.sendSelectors);
  if (btn) {
    btn.click();
    return;
  }

  if (!inputEl) return;
  ["keydown", "keypress", "keyup"].forEach((eventType) => {
    const event = new KeyboardEvent(eventType, {
      bubbles: true,
      cancelable: true,
      key: "Enter",
      code: "Enter",
      keyCode: 13
    });
    inputEl.dispatchEvent(event);
  });
}

function dataUrlToBlob(dataUrl) {
  const idx = dataUrl.indexOf(",");
  if (idx < 0) return null;
  const meta = dataUrl.slice(0, idx);
  const body = dataUrl.slice(idx + 1);
  const mimeMatch = meta.match(/^data:([^;]+);base64$/i);
  if (!mimeMatch) return null;
  const mimeType = mimeMatch[1] || "image/png";
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

function toImageFiles(images) {
  return images
    .map((item, index) => {
      const type = String(item?.type || "image/png");
      if (!type.startsWith("image/")) return null;
      const blob = dataUrlToBlob(String(item?.dataUrl || ""));
      if (!blob) return null;
      const ext = type.split("/")[1] || "png";
      const name = String(item?.name || `image-${Date.now()}-${index}.${ext}`);
      return new File([blob], name, { type });
    })
    .filter(Boolean);
}

function buildDataTransfer(files) {
  try {
    const dt = new DataTransfer();
    files.forEach((file) => dt.items.add(file));
    return dt;
  } catch (_error) {
    return null;
  }
}

function attachByFileInput(files) {
  const inputs = Array.from(document.querySelectorAll('input[type="file"]')).filter((el) => !el.disabled && isVisible(el));
  for (const input of inputs) {
    try {
      const dt = buildDataTransfer(files);
      if (!dt) continue;
      input.focus();
      input.files = dt.files;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    } catch (_error) {
      // Continue trying next candidate.
    }
  }
  return false;
}

function attachByPaste(inputEl, files) {
  if (!inputEl) return false;
  const dt = buildDataTransfer(files);
  if (!dt) return false;

  try {
    inputEl.focus();
    const beforeEvent = new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "insertFromPaste",
      dataTransfer: dt
    });
    inputEl.dispatchEvent(beforeEvent);
  } catch (_error) {
    // Continue fallback.
  }

  try {
    const pasteEvent = new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true
    });
    Object.defineProperty(pasteEvent, "clipboardData", { value: dt });
    inputEl.dispatchEvent(pasteEvent);
    return true;
  } catch (_error) {
    return false;
  }
}

async function attachImages(inputEl, images) {
  const files = toImageFiles(images);
  if (!files.length) return false;
  if (attachByFileInput(files)) return true;
  return attachByPaste(inputEl, files);
}

async function sendPrompt(packet) {
  const site = currentSite() || GENERIC_SITE;
  const message = typeof packet === "string" ? packet : String(packet?.message || "");
  const images = Array.isArray(packet?.images) ? packet.images : [];

  const inputEl = findFirst(site.inputSelectors);
  if (!inputEl) return;

  const hasText = message.length > 0;
  if (hasText && !setInputValue(inputEl, message)) return;
  if (!hasText) inputEl.focus();

  if (images.length) {
    await attachImages(inputEl, images);
  }

  setTimeout(() => clickSend(site, inputEl), images.length ? 220 : 80);
}

function newChat() {
  const site = currentSite();
  if (!site) return;

  if (clickFirstVisible(site.newChatSelectors || [])) return;
  if (clickByText()) return;

  const targetUrl = site.homeUrl || `${location.origin}/`;
  if (location.href === targetUrl) {
    location.reload();
    return;
  }
  location.href = targetUrl;
}

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
    window.parent.postMessage(
      {
        type: "QUOTE_TEXT",
        payload: {
          text,
          siteId: (currentSite() || GENERIC_SITE).id,
          url: location.href
        }
      },
      "*"
    );
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

window.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || !data.type) return;

  if (data.type === "CHAT_MESSAGE") {
    void sendPrompt({
      message: data.message || "",
      images: data.payload?.images || []
    });
  } else if (data.type === "NEW_CHAT") {
    newChat();
  }
});

document.addEventListener("mouseup", showQuoteButton);
document.addEventListener("touchend", showQuoteButton);
document.addEventListener(
  "keydown",
  (event) => {
    if (event.key !== "Escape") return;
    window.parent.postMessage({ type: "PANE_ESCAPE" }, "*");
  },
  true
);
document.addEventListener("click", (event) => {
  if (event.target && event.target.closest(".oa-quote-float-btn")) return;
  removeQuoteButton();
});
window.addEventListener("scroll", removeQuoteButton, true);

let lastHref = location.href;
function postUrlUpdate() {
  const site = currentSite() || GENERIC_SITE;
  window.parent.postMessage(
    {
      type: "UPDATE_HISTORY",
      payload: {
        siteId: site.id,
        url: location.href
      }
    },
    "*"
  );
}

postUrlUpdate();
setInterval(() => {
  if (location.href === lastHref) return;
  lastHref = location.href;
  postUrlUpdate();
}, 600);
