"use strict";

/**
 * 在支持的 AI 网页主框架右侧显示吸边按钮，点击后以 iframe 打开扩展选项页（侧栏）。
 */
const STORAGE_EMBED_ENABLED = "oa_page_embed_switcher_enabled";

const EMBED_MATCH_HOST_SUFFIXES = [
  "chatgpt.com",
  "chat.openai.com",
  "chat.deepseek.com",
  "kimi.com",
  "www.kimi.com",
  "chat.qwen.ai",
  "doubao.com",
  "www.doubao.com",
  "yuanbao.tencent.com",
  "grok.com",
  "claude.ai",
  "gemini.google.com"
];

function hostMatchesEmbed(h) {
  const host = String(h || "").toLowerCase();
  return EMBED_MATCH_HOST_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`) || host.includes(s));
}

function injectEmbedStyles() {
  if (document.getElementById("oa-embed-options-style")) return;
  const style = document.createElement("style");
  style.id = "oa-embed-options-style";
  style.textContent = `
    #oa-embed-fab {
      position: fixed;
      right: 0;
      top: 50%;
      transform: translateY(-50%);
      z-index: 2147483646;
      width: 28px;
      height: 56px;
      padding: 0;
      margin: 0;
      border: none;
      border-radius: 8px 0 0 8px;
      background: color-mix(in srgb, #2563eb 92%, #000);
      color: #fff;
      font-size: 11px;
      font-weight: 650;
      cursor: pointer;
      box-shadow: 0 2px 12px rgba(0,0,0,.2);
      writing-mode: vertical-rl;
      text-orientation: mixed;
      line-height: 1;
      letter-spacing: 0.06em;
    }
    #oa-embed-fab:hover { filter: brightness(1.08); }
    #oa-embed-root {
      position: fixed;
      inset: 0 0 0 auto;
      z-index: 2147483647;
      width: min(420px, 100vw);
      max-width: 100vw;
      height: 100vh;
      box-shadow: -8px 0 32px rgba(0,0,0,.25);
      display: none;
      flex-direction: column;
      background: Canvas;
    }
    #oa-embed-root.oa-open { display: flex; }
    #oa-embed-root iframe {
      flex: 1;
      width: 100%;
      border: none;
      min-height: 0;
    }
  `;
  (document.head || document.documentElement).appendChild(style);
}

let rootEl = null;
let fabEl = null;

function getOptionsEmbedUrl() {
  return `${chrome.runtime.getURL("ui/options/options.html")}?embed=1`;
}

function openEmbedPanel() {
  injectEmbedStyles();
  if (!rootEl) {
    rootEl = document.createElement("div");
    rootEl.id = "oa-embed-root";
    rootEl.setAttribute("role", "dialog");
    rootEl.setAttribute("aria-label", "Side-by-Side AI");

    const iframe = document.createElement("iframe");
    iframe.src = getOptionsEmbedUrl();
    iframe.setAttribute("allow", "clipboard-read; clipboard-write");
    iframe.title = "Side-by-Side AI";
    rootEl.appendChild(iframe);
    document.body.appendChild(rootEl);
  }
  rootEl.classList.add("oa-open");
}

function closeEmbedPanel() {
  if (rootEl) rootEl.classList.remove("oa-open");
}

function toggleEmbedPanel() {
  if (rootEl?.classList.contains("oa-open")) closeEmbedPanel();
  else openEmbedPanel();
}

function ensureFab() {
  injectEmbedStyles();
  if (fabEl) return;
  fabEl = document.createElement("button");
  fabEl.id = "oa-embed-fab";
  fabEl.type = "button";
  fabEl.textContent = "AI";
  fabEl.title = "Side-by-Side AI（侧栏选项）";
  fabEl.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleEmbedPanel();
  });
  document.body.appendChild(fabEl);
}

async function isEmbedEnabledInStorage() {
  const data = await chrome.storage.local.get([STORAGE_EMBED_ENABLED]);
  return data[STORAGE_EMBED_ENABLED] !== false;
}

async function boot() {
  if (window.self !== window.top) return;
  if (!hostMatchesEmbed(location.hostname)) return;
  if (!(await isEmbedEnabledInStorage())) return;
  ensureFab();
}

window.addEventListener("message", (ev) => {
  if (ev.data?.type === "OA_EMBED_CLOSE" && ev.data?.source === "oa-options-embed") {
    closeEmbedPanel();
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && rootEl?.classList.contains("oa-open")) {
    closeEmbedPanel();
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== "OA_PAGE_EMBED_OPEN_SWITCHER") return false;
  void (async () => {
    if (!hostMatchesEmbed(location.hostname) || !(await isEmbedEnabledInStorage())) {
      sendResponse({ ok: false, reason: "disabled-or-host" });
      return;
    }
    ensureFab();
    openEmbedPanel();
    sendResponse({ ok: true });
  })();
  return true;
});

void boot();
