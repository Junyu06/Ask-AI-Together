"use strict";

const SITES = [
  {
    id: "chatgpt",
    matchHosts: ["chatgpt.com", "chat.openai.com"],
    homeUrl: "https://chatgpt.com/",
    newChatUrl: "https://chatgpt.com/",
    inputSelectors: ["#prompt-textarea", "textarea"],
    sendSelectors: ['button[data-testid="send-button"]', 'button[type="submit"]'],
    newChatSelectors: ['[data-testid="create-new-chat-button"]', "a.no-draggable", 'a[href="/"]']
  },
  {
    id: "deepseek",
    matchHosts: ["chat.deepseek.com"],
    homeUrl: "https://chat.deepseek.com/",
    newChatUrl: "https://chat.deepseek.com/",
    inputSelectors: ["textarea#chat-input", "textarea"],
    sendSelectors: ['button[type="submit"]'],
    newChatSelectors: ["._5a8ac7a", 'a[href="/"]']
  },
  {
    id: "kimi",
    matchHosts: ["www.kimi.com", "kimi.com"],
    homeUrl: "https://www.kimi.com/",
    newChatUrl: "https://www.kimi.com/",
    inputSelectors: ['div[contenteditable="true"]', "textarea"],
    sendSelectors: [".send-button-container", 'button[type="submit"]'],
    newChatSelectors: [".new-chat-btn", 'a[href="/"]']
  },
  {
    id: "qwen",
    matchHosts: ["chat.qwen.ai"],
    homeUrl: "https://chat.qwen.ai/",
    newChatUrl: "https://chat.qwen.ai/",
    inputSelectors: [".message-input-textarea", "textarea"],
    sendSelectors: ['button[type="submit"]'],
    newChatSelectors: [".sidebar-entry-list-content", 'a[href="/"]']
  },
  {
    id: "doubao",
    matchHosts: ["www.doubao.com"],
    homeUrl: "https://www.doubao.com/",
    newChatUrl: "https://www.doubao.com/",
    inputSelectors: ["textarea"],
    sendSelectors: ["#flow-end-msg-send", 'button[type="submit"]'],
    newChatSelectors: ['div[data-testid="create_conversation_button"]', 'a[href="/"]']
  },
  {
    id: "yuanbao",
    matchHosts: ["yuanbao.tencent.com"],
    homeUrl: "https://yuanbao.tencent.com/",
    newChatUrl: "https://yuanbao.tencent.com/",
    inputSelectors: ["div.ql-editor", "textarea", 'div[contenteditable="true"]'],
    sendSelectors: [".icon-send", 'button[type="submit"]'],
    newChatSelectors: [".yb-common-nav__trigger", 'a[href="/"]']
  },
  {
    id: "grok",
    matchHosts: ["grok.com"],
    homeUrl: "https://grok.com/",
    newChatUrl: "https://grok.com/",
    inputSelectors: ["textarea[aria-label]", 'div[contenteditable="true"]', "textarea"],
    sendSelectors: ['button[type="submit"]'],
    newChatSelectors: ['a[data-sidebar="menu-button"]', 'a[href="/"]']
  },
  {
    id: "claude",
    matchHosts: ["claude.ai"],
    homeUrl: "https://claude.ai/",
    newChatUrl: "https://claude.ai/new",
    inputSelectors: ['div[contenteditable="true"]', "textarea"],
    sendSelectors: ['button[aria-label*="Send" i]', 'button[type="submit"]'],
    newChatSelectors: ['a[href="/new"]', 'button[aria-label*="New chat" i]', 'a[href="/"]']
  },
  {
    id: "gemini",
    matchHosts: ["gemini.google.com"],
    homeUrl: "https://gemini.google.com/",
    newChatUrl: "https://gemini.google.com/",
    inputSelectors: [".ql-editor", 'div[contenteditable="true"]', "textarea"],
    sendSelectors: ["button.submit", 'button[type="submit"]'],
    newChatSelectors: [
      '[data-test-id="new-chat-button"]',
      'button[aria-label*="New chat" i]',
      'button[aria-label*="新聊天" i]',
      '[role="button"][aria-label*="New chat" i]',
      'a[href="/"]'
    ]
  },
  {
    id: "perplexity",
    matchHosts: ["www.perplexity.ai", "perplexity.ai"],
    homeUrl: "https://www.perplexity.ai/",
    newChatUrl: "https://www.perplexity.ai/",
    inputSelectors: ['textarea[placeholder]', 'div[contenteditable="true"]', "textarea"],
    sendSelectors: ['button[aria-label*="Submit" i]', 'button[type="submit"]'],
    newChatSelectors: ['a[href="/"]', 'button[aria-label*="New" i]']
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

const RESPONSE_SELECTORS = {
  chatgpt: [
    '[data-message-author-role="assistant"]',
    'article [data-message-author-role="assistant"]',
    '[data-testid="conversation-turn"] [data-message-author-role="assistant"]'
  ],
  deepseek: ['[data-role="assistant"]', '.ds-markdown', '.markdown-body'],
  kimi: ['[data-role="assistant"]', '.markdown', '.segment-content'],
  qwen: ['[data-role="assistant"]', '.message-item-assistant', '.markdown-body'],
  doubao: ['[data-testid*="assistant"]', '.markdown-body', '.semi-typography'],
  yuanbao: ['[data-role="assistant"]', '.agent-message', '.markdown-body'],
  grok: ['[data-testid*="assistant"]', '[data-message-author-role="assistant"]', '.prose'],
  claude: ['[data-is-streaming="false"] .font-claude-message', '[data-testid*="assistant"]', '.prose'],
  gemini: ['message-content', '[data-response-id]', '.model-response-text', '.response-content'],
  perplexity: ['.prose', '[data-testid="answer"]', '.markdown']
};
