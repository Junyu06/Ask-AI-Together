"use strict";

const SITES = [
  {
    id: "chatgpt",
    matchHosts: ["chatgpt.com", "chat.openai.com"],
    inputSelectors: ["#prompt-textarea", "textarea"],
    sendSelectors: ['button[data-testid="send-button"]', 'button[type="submit"]'],
    newChatSelectors: ['[data-testid="create-new-chat-button"]', "a.no-draggable"]
  },
  {
    id: "deepseek",
    matchHosts: ["chat.deepseek.com"],
    inputSelectors: ["textarea#chat-input", "textarea"],
    sendSelectors: ['button[type="submit"]'],
    newChatSelectors: ["._5a8ac7a"]
  },
  {
    id: "kimi",
    matchHosts: ["www.kimi.com"],
    inputSelectors: ['div[contenteditable="true"]', "textarea"],
    sendSelectors: [".send-button-container", 'button[type="submit"]'],
    newChatSelectors: [".new-chat-btn"]
  },
  {
    id: "qwen",
    matchHosts: ["chat.qwen.ai"],
    inputSelectors: [".message-input-textarea", "textarea"],
    sendSelectors: ['button[type="submit"]'],
    newChatSelectors: [".sidebar-entry-list-content"]
  },
  {
    id: "doubao",
    matchHosts: ["www.doubao.com"],
    inputSelectors: ["textarea"],
    sendSelectors: ["#flow-end-msg-send", 'button[type="submit"]'],
    newChatSelectors: ['div[data-testid="create_conversation_button"]']
  },
  {
    id: "yuanbao",
    matchHosts: ["yuanbao.tencent.com"],
    inputSelectors: ["div.ql-editor", "textarea", 'div[contenteditable="true"]'],
    sendSelectors: [".icon-send", 'button[type="submit"]'],
    newChatSelectors: [".yb-common-nav__trigger"]
  },
  {
    id: "grok",
    matchHosts: ["grok.com"],
    inputSelectors: ["textarea[aria-label]", 'div[contenteditable="true"]', "textarea"],
    sendSelectors: ['button[type="submit"]'],
    newChatSelectors: ['a[data-sidebar="menu-button"]']
  },
  {
    id: "gemini",
    matchHosts: ["gemini.google.com"],
    inputSelectors: [".ql-editor", 'div[contenteditable="true"]', "textarea"],
    sendSelectors: ["button.submit", 'button[type="submit"]'],
    newChatSelectors: ['[data-test-id="new-chat-button"]']
  }
];

function currentSite() {
  const host = location.hostname;
  return SITES.find((site) => site.matchHosts.some((h) => host.includes(h))) || null;
}

function findFirst(selectors) {
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) return el;
  }
  return null;
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
  const site = currentSite();
  if (!site) return;
  const inputEl = findFirst(site.inputSelectors);
  if (!setInputValue(inputEl, prompt)) return;
  setTimeout(() => clickSend(site, inputEl), 80);
}

function newChat() {
  const site = currentSite();
  if (!site) return;
  const btn = findFirst(site.newChatSelectors);
  if (btn) btn.click();
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
setInterval(() => {
  if (location.href === lastHref) return;
  lastHref = location.href;
  const site = currentSite();
  if (!site) return;
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
}, 600);
