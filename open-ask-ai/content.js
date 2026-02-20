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

function sendPrompt(prompt) {
  const site = currentSite() || GENERIC_SITE;
  const inputEl = findFirst(site.inputSelectors);
  if (!setInputValue(inputEl, prompt)) return;
  setTimeout(() => clickSend(site, inputEl), 80);
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

window.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || !data.type) return;

  if (data.type === "CHAT_MESSAGE") {
    sendPrompt(data.message || "");
  } else if (data.type === "NEW_CHAT") {
    newChat();
  }
});

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
