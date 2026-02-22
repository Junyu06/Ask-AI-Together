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
    id: "claude",
    matchHosts: ["claude.ai"],
    homeUrl: "https://claude.ai/",
    inputSelectors: ['div[contenteditable="true"]', "textarea"],
    sendSelectors: ['button[aria-label*="Send" i]', 'button[type="submit"]'],
    newChatSelectors: ['a[href="/new"]', 'button[aria-label*="New chat" i]', 'a[href="/"]']
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
  return queryDeepFirst(selectors) || null;
}

function isVisible(el) {
  if (!el) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function clickFirstVisible(selectors) {
  const target = queryDeepFirstVisible(selectors);
  if (!target) return false;
  target.click();
  return true;
}

function walkDeep(node, visitor) {
  visitor(node);
  const children = node.children ? Array.from(node.children) : [];
  for (const child of children) {
    walkDeep(child, visitor);
    if (child.shadowRoot) {
      walkDeep(child.shadowRoot, visitor);
    }
  }
}

function queryDeepAll(selectors, root = document) {
  const results = [];
  const seen = new Set();
  walkDeep(root, (node) => {
    if (!node.querySelectorAll) return;
    for (const selector of selectors) {
      const items = Array.from(node.querySelectorAll(selector));
      for (const item of items) {
        if (seen.has(item)) continue;
        seen.add(item);
        results.push(item);
      }
    }
  });
  return results;
}

function queryDeepFirst(selectors, root = document) {
  const all = queryDeepAll(selectors, root);
  return all.length ? all[0] : null;
}

function queryDeepFirstVisible(selectors, root = document) {
  const all = queryDeepAll(selectors, root);
  return all.find(isVisible) || null;
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
    const ariaDisabled = String(btn.getAttribute("aria-disabled") || "").toLowerCase() === "true";
    if (btn.disabled || ariaDisabled) return false;
    btn.click();
    return true;
  }

  if (!inputEl) return false;
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
  return true;
}

async function clickSendWithRetry(site, inputEl, options = {}) {
  const attempts = Number(options.attempts) > 0 ? Number(options.attempts) : 1;
  const delay = Number(options.delay) >= 0 ? Number(options.delay) : 200;
  for (let i = 0; i < attempts; i += 1) {
    if (clickSend(site, inputEl)) return true;
    if (i < attempts - 1) await sleep(delay);
  }
  return false;
}

function dataUrlToBlob(dataUrl) {
  const idx = dataUrl.indexOf(",");
  if (idx < 0) return null;
  const meta = dataUrl.slice(0, idx);
  const body = dataUrl.slice(idx + 1);
  const mimeMatch = meta.match(/^data:([^;]+);base64$/i);
  if (!mimeMatch) return null;
  const mimeType = mimeMatch[1] || "application/octet-stream";
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

function toFiles(items) {
  return items
    .map((item, index) => {
      const type = String(item?.type || "application/octet-stream");
      const blob = dataUrlToBlob(String(item?.dataUrl || ""));
      if (!blob) return null;
      const ext = type.split("/")[1]?.split(";")[0] || "bin";
      const name = String(item?.name || `file-${Date.now()}-${index}.${ext}`);
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

function attachByFileInput(files, hintEl = null) {
  const inputs = queryDeepAll(['input[type="file"]']).filter((el) => !el.disabled);
  inputs.sort((a, b) => {
    const aAccept = String(a.getAttribute("accept") || "").toLowerCase();
    const bAccept = String(b.getAttribute("accept") || "").toLowerCase();
    const aImg = aAccept.includes("image") ? 10 : 0;
    const bImg = bAccept.includes("image") ? 10 : 0;
    let aNear = 0;
    let bNear = 0;
    if (hintEl && hintEl.getBoundingClientRect) {
      const hr = hintEl.getBoundingClientRect();
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      const ad = Math.abs(ar.top - hr.top) + Math.abs(ar.left - hr.left);
      const bd = Math.abs(br.top - hr.top) + Math.abs(br.left - hr.left);
      aNear = -Math.min(ad, 5000) / 500;
      bNear = -Math.min(bd, 5000) / 500;
    }
    return (bImg + bNear) - (aImg + aNear);
  });
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

function attachByDrop(inputEl, files) {
  if (!inputEl) return false;
  const dt = buildDataTransfer(files);
  if (!dt) return false;
  try {
    inputEl.focus();
    ["dragenter", "dragover", "drop"].forEach((type) => {
      let evt;
      try {
        evt = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt });
      } catch (_error) {
        evt = new Event(type, { bubbles: true, cancelable: true });
      }
      if (!("dataTransfer" in evt)) {
        Object.defineProperty(evt, "dataTransfer", { value: dt });
      }
      inputEl.dispatchEvent(evt);
    });
    return true;
  } catch (_error) {
    return false;
  }
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

function attachByPasteTargets(targets, files) {
  for (const target of targets) {
    if (attachByPaste(target, files)) return true;
  }
  return false;
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function clickFirstVisibleSelector(selectors) {
  const target = queryDeepFirstVisible(selectors);
  if (!target || target.disabled) return false;
  target.click();
  return true;
}

function geminiMainWorldAttach() {
  function signal(ok) {
    document.dispatchEvent(new CustomEvent("__oa_attach_result", { detail: { ok: ok } }));
  }
  try {
    var el = document.getElementById("__oa_attach_payload");
    if (!el) { signal(false); return; }
    var items = JSON.parse(el.value);
    el.remove();

    var files = items.map(function (item) {
      var i = item.dataUrl.indexOf(",");
      var b = atob(item.dataUrl.slice(i + 1));
      var a = new Uint8Array(b.length);
      for (var j = 0; j < b.length; j++) a[j] = b.charCodeAt(j);
      return new File([a], item.name, { type: item.type });
    });
    if (!files.length) { signal(false); return; }

    var dt = new DataTransfer();
    files.forEach(function (f) { dt.items.add(f); });

    var done = false;
    var origClick = HTMLInputElement.prototype.click;
    var origPicker = window.showOpenFilePicker;

    function cleanup() {
      HTMLInputElement.prototype.click = origClick;
      if (origPicker) window.showOpenFilePicker = origPicker;
      observer.disconnect();
    }

    function inject(input) {
      if (done) return;
      done = true;
      cleanup();
      input.files = dt.files;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      signal(true);
    }

    HTMLInputElement.prototype.click = function () {
      if (this.type === "file" && !done) { inject(this); return; }
      return origClick.call(this);
    };

    if (window.showOpenFilePicker) {
      window.showOpenFilePicker = function () {
        done = true; cleanup(); signal(true);
        return Promise.resolve(files.map(function (f) {
          return { kind: "file", name: f.name, getFile: function () { return Promise.resolve(f); } };
        }));
      };
    }

    var observer = new MutationObserver(function () {
      if (done) return;
      var inputs = document.querySelectorAll('input[type="file"]');
      for (var k = 0; k < inputs.length; k++) {
        if (!inputs[k].disabled) { inject(inputs[k]); return; }
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    var sels = [
      'button[aria-label*="Upload" i]', 'button[aria-label*="Add file" i]',
      'button[aria-label*="Add photo" i]', 'button[aria-label*="Add image" i]',
      'button[aria-label*="Attach" i]', 'button[aria-label*="上传" i]',
      'button[aria-label*="文件" i]', 'button[aria-label*="图片" i]',
      'button[aria-label*="添加" i]', '[data-test-id*="upload"]',
      '[data-testid*="upload"]', 'button[mattooltip*="Upload" i]',
      'button[mattooltip*="photo" i]', '[data-tooltip*="Upload" i]',
      'div[role="button"][aria-label*="Upload" i]',
      'div[role="button"][aria-label*="file" i]'
    ];
    for (var s = 0; s < sels.length; s++) {
      var btn = document.querySelector(sels[s]);
      if (btn && btn.offsetWidth > 0) { btn.click(); break; }
    }

    setTimeout(function () {
      if (!done) { done = true; cleanup(); signal(false); }
    }, 6000);
  } catch (e) { signal(false); }
}

function attachByMainWorld(items) {
  return new Promise(function (resolve) {
    var resolved = false;
    var handler = function (event) {
      if (resolved) return;
      resolved = true;
      document.removeEventListener("__oa_attach_result", handler);
      resolve(!!event.detail?.ok);
    };
    document.addEventListener("__oa_attach_result", handler);

    var dataEl = document.createElement("textarea");
    dataEl.id = "__oa_attach_payload";
    dataEl.style.display = "none";
    dataEl.value = JSON.stringify(
      items.map(function (item) {
        return {
          dataUrl: String(item?.dataUrl || ""),
          name: String(item?.name || "file.bin"),
          type: String(item?.type || "application/octet-stream")
        };
      })
    );
    document.documentElement.appendChild(dataEl);

    var script = document.createElement("script");
    script.textContent = "(" + geminiMainWorldAttach.toString() + ")()";
    document.documentElement.appendChild(script);
    script.remove();

    setTimeout(function () {
      if (!resolved) {
        resolved = true;
        document.removeEventListener("__oa_attach_result", handler);
        try { dataEl.remove(); } catch (_) { /* noop */ }
        resolve(false);
      }
    }, 8000);
  });
}

async function attachFilesGemini(inputEl, files) {
  if (attachByFileInput(files, inputEl)) return true;

  const dropTargets = [
    queryDeepFirst(['.ql-editor', '[role="textbox"]', '[contenteditable="true"]']),
    inputEl,
    document.body
  ].filter(Boolean);
  const seenDrop = new Set();
  for (const target of dropTargets) {
    if (seenDrop.has(target)) continue;
    seenDrop.add(target);
    if (attachByDrop(target, files)) return true;
  }

  inputEl.focus();
  await sleep(80);
  const pasteTargets = [inputEl, document.activeElement, document.body, document].filter(Boolean);
  const seenPaste = new Set();
  for (const target of pasteTargets) {
    if (seenPaste.has(target)) continue;
    seenPaste.add(target);
    if (attachByPaste(target, files)) return true;
  }
  return false;
}

async function attachFiles(inputEl, items, siteId = "") {
  const files = toFiles(items);
  if (!files.length) return false;
  if (siteId === "gemini") {
    return attachFilesGemini(inputEl, files);
  }
  if (attachByFileInput(files, inputEl)) return true;
  if (attachByDrop(inputEl, files)) return true;
  return attachByPasteTargets([inputEl, document.activeElement, document.body].filter(Boolean), files);
}

async function sendPrompt(packet) {
  const site = currentSite() || GENERIC_SITE;
  const message = typeof packet === "string" ? packet : String(packet?.message || "");
  const files = Array.isArray(packet?.files) ? packet.files : Array.isArray(packet?.images) ? packet.images : [];

  const inputEl = findFirst(site.inputSelectors);
  if (!inputEl) return;

  const hasText = message.length > 0;
  if (hasText && !setInputValue(inputEl, message)) return;
  if (!hasText) inputEl.focus();

  if (files.length) {
    await attachFiles(inputEl, files, site.id);
  }

  await sleep(files.length ? 220 : 80);
  await clickSendWithRetry(site, inputEl, {
    attempts: files.length ? 20 : 4,
    delay: files.length ? 250 : 100
  });
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
      files: data.payload?.files || data.payload?.images || []
    });
  } else if (data.type === "ATTACH_FILES" || data.type === "ATTACH_IMAGES") {
    const site = currentSite() || GENERIC_SITE;
    const inputEl = findFirst(site.inputSelectors);
    if (inputEl) {
      void attachFiles(inputEl, data.payload?.files || data.payload?.images || [], site.id);
    }
  } else if (data.type === "NEW_CHAT") {
    newChat();
  }
});

document.addEventListener("mouseup", showQuoteButton);
document.addEventListener("touchend", showQuoteButton);
document.addEventListener(
  "keydown",
  (event) => {
    const isFocusShortcut = (event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "f";
    if (!isFocusShortcut) return;
    window.parent.postMessage({ type: "PANE_EXIT_FOCUS" }, "*");
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
