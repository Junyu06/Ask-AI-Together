"use strict";

const OPTIONS_PAGE = "ui/options/options.html";

const STALE_EXTENSION_UI_PATHS = ["ui/switcher/switcher.html", "ui/popup/popup.html"];

function isStaleExtensionUiUrl(url) {
  if (typeof url !== "string" || !url.startsWith("chrome-extension://")) return false;
  return STALE_EXTENSION_UI_PATHS.some((path) => {
    const full = chrome.runtime.getURL(path);
    return url === full || url.startsWith(`${full}?`);
  });
}

const STORAGE_WINDOW_TARGETS = "oa_window_targets_v1";

/** @type {Record<string, { siteId: string, windowId: number, tabId: number, transport: string }>} */
let targetsCache = null;

const BUILTIN_SITE_URLS = {
  chatgpt: "https://chatgpt.com/",
  deepseek: "https://chat.deepseek.com/",
  kimi: "https://www.kimi.com/",
  qwen: "https://chat.qwen.ai/",
  doubao: "https://www.doubao.com/",
  yuanbao: "https://yuanbao.tencent.com/",
  grok: "https://grok.com/",
  claude: "https://claude.ai/",
  gemini: "https://gemini.google.com/",
  perplexity: "https://www.perplexity.ai/"
};

const SITE_DISPLAY_NAMES = {
  chatgpt: "ChatGPT",
  deepseek: "DeepSeek",
  kimi: "Kimi",
  qwen: "Qwen",
  doubao: "Doubao",
  yuanbao: "Yuanbao",
  grok: "Grok",
  claude: "Claude",
  gemini: "Gemini",
  perplexity: "Perplexity"
};

/** Hostnames for matching tabs (aligned with content/content-sites.js SITES) */
const SITE_HOSTS = {
  chatgpt: ["chatgpt.com", "chat.openai.com"],
  deepseek: ["chat.deepseek.com"],
  kimi: ["www.kimi.com", "kimi.com"],
  qwen: ["chat.qwen.ai"],
  doubao: ["doubao.com", "www.doubao.com"],
  yuanbao: ["yuanbao.tencent.com"],
  grok: ["grok.com"],
  claude: ["claude.ai"],
  gemini: ["gemini.google.com"],
  perplexity: ["www.perplexity.ai", "perplexity.ai"]
};
