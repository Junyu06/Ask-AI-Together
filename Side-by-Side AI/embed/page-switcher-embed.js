"use strict";

/**
 * 在支持的 AI 网页上注入「吸边」悬浮按钮，点击后在页面内 iframe 打开 switcher（类似沉浸式翻译的侧栏感，而非独立浏览器窗口）。
 */
const OA_EMBED_HOST_NEEDLES = [
  "chatgpt.com",
  "chat.openai.com",
  "chat.deepseek.com",
  "kimi.com",
  "chat.qwen.ai",
  "doubao.com",
  "yuanbao.tencent.com",
  "grok.com",
  "claude.ai",
  "gemini.google.com"
];

const STORAGE_EMBED_ENABLED = "oa_page_embed_switcher_enabled";
const STORAGE_EMBED_EDGE = "oa_embed_fab_edge";

const Z_PANEL = 2147483640;
const Z_BACKDROP = 2147483639;
const Z_FAB = 2147483641;

function normalizeHost(hostname) {
  return String(hostname || "")
    .toLowerCase()
    .replace(/^www\./, "");
}

function isAiChatHostPage() {
  const h = normalizeHost(location.hostname);
  if (!h) return false;
  return OA_EMBED_HOST_NEEDLES.some((n) => h === n || h.endsWith("." + n));
}

async function isEmbedEnabledInStorage() {
  const data = await chrome.storage.local.get([STORAGE_EMBED_ENABLED]);
  return data[STORAGE_EMBED_ENABLED] !== false;
}

async function getFabEdge() {
  const data = await chrome.storage.local.get([STORAGE_EMBED_EDGE]);
  const v = data[STORAGE_EMBED_EDGE];
  return v === "left" || v === "bottom" ? v : "right";
}

function buildShadowCss() {
  return `
    :host {
      all: initial;
      font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
    }
    .oa-root {
      position: fixed;
      inset: 0;
      pointer-events: none;
      z-index: ${Z_PANEL};
    }
    .oa-root * {
      box-sizing: border-box;
    }
    .oa-fab {
      pointer-events: auto;
      position: fixed;
      width: 46px;
      height: 46px;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(145deg, #1e3a5f 0%, #0f172a 100%);
      color: #e2e8f0;
      box-shadow: -4px 0 18px rgba(0,0,0,0.22);
      transition: transform 0.2s ease, filter 0.15s ease;
      z-index: ${Z_FAB};
    }
    .oa-fab:hover {
      filter: brightness(1.08);
    }
    .oa-fab[data-edge="right"] {
      right: 0;
      top: 42%;
      transform: translateY(-50%);
      border-radius: 14px 0 0 14px;
      padding-left: 4px;
    }
    .oa-fab[data-edge="left"] {
      left: 0;
      top: 42%;
      transform: translateY(-50%);
      border-radius: 0 14px 14px 0;
      padding-right: 4px;
      box-shadow: 4px 0 18px rgba(0,0,0,0.22);
    }
    .oa-fab[data-edge="bottom"] {
      right: 20px;
      bottom: 18px;
      transform: none;
      border-radius: 14px;
      box-shadow: 0 -2px 18px rgba(0,0,0,0.22);
    }
    .oa-fab svg {
      width: 26px;
      height: 26px;
      flex-shrink: 0;
    }
    .oa-fab[aria-expanded="true"] {
      opacity: 0.92;
    }
    .oa-backdrop {
      pointer-events: auto;
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.35);
      opacity: 0;
      visibility: hidden;
      transition: opacity 0.22s ease;
      z-index: ${Z_BACKDROP};
    }
    .oa-backdrop.open {
      opacity: 1;
      visibility: visible;
    }
    .oa-panel {
      pointer-events: auto;
      position: fixed;
      top: 0;
      bottom: 0;
      width: min(100vw, 520px);
      max-width: 100vw;
      background: Canvas;
      box-shadow: -8px 0 32px rgba(0,0,0,0.28);
      transform: translateX(110%);
      transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
      z-index: ${Z_PANEL};
      display: flex;
      flex-direction: column;
    }
    .oa-panel[data-edge="left"] {
      left: 0;
      right: auto;
      box-shadow: 8px 0 32px rgba(0,0,0,0.28);
      transform: translateX(-110%);
    }
    .oa-panel[data-edge="bottom"] {
      left: 0;
      right: 0;
      top: auto;
      bottom: 0;
      width: 100%;
      height: min(88vh, 720px);
      max-height: 90vh;
      transform: translateY(110%);
      border-radius: 16px 16px 0 0;
      box-shadow: 0 -8px 32px rgba(0,0,0,0.28);
    }
    .oa-panel.open[data-edge="right"] {
      transform: translateX(0);
    }
    .oa-panel.open[data-edge="left"] {
      transform: translateX(0);
    }
    .oa-panel.open[data-edge="bottom"] {
      transform: translateY(0);
    }
    .oa-panel iframe {
      flex: 1 1 auto;
      width: 100%;
      min-height: 0;
      border: none;
      background: Canvas;
    }
  `;
}

function createFabIconSvg() {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  const p1 = document.createElementNS(ns, "path");
  p1.setAttribute("d", "M8 9h8M8 13h5");
  const p2 = document.createElementNS(ns, "path");
  p2.setAttribute("d", "M12 21a9 9 0 1 0-9-9c0 1.5.4 2.9 1.1 4.1L3 21l4.9-1.1A8.9 8.9 0 0 0 12 21Z");
  svg.appendChild(p2);
  svg.appendChild(p1);
  return svg;
}

function mountUi(edge) {
  const host = document.createElement("div");
  host.id = "oa-sbs-page-embed-root";
  host.setAttribute("data-oembed", "1");

  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = buildShadowCss();
  shadow.appendChild(style);

  const root = document.createElement("div");
  root.className = "oa-root";

  const backdrop = document.createElement("div");
  backdrop.className = "oa-backdrop";
  backdrop.setAttribute("aria-hidden", "true");

  const panel = document.createElement("div");
  panel.className = "oa-panel";
  panel.setAttribute("data-edge", edge);
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Side-by-Side AI 常驻输入");

  const iframe = document.createElement("iframe");
  iframe.title = "Side-by-Side AI 切换器";
  iframe.setAttribute(
    "allow",
    "clipboard-read; clipboard-write"
  );
  iframe.src = `${chrome.runtime.getURL("ui/switcher/switcher.html")}?embed=1`;

  panel.appendChild(iframe);

  const fab = document.createElement("button");
  fab.type = "button";
  fab.className = "oa-fab";
  fab.setAttribute("data-edge", edge);
  fab.setAttribute("aria-label", "打开 Side-by-Side AI 输入条");
  fab.setAttribute("aria-expanded", "false");
  fab.appendChild(createFabIconSvg());

  root.appendChild(backdrop);
  root.appendChild(panel);
  root.appendChild(fab);
  shadow.appendChild(root);

  let open = false;

  function setOpen(next) {
    open = next;
    fab.setAttribute("aria-expanded", open ? "true" : "false");
    panel.classList.toggle("open", open);
    backdrop.classList.toggle("open", open);
    if (open) {
      try {
        iframe.contentWindow?.focus?.();
      } catch (_e) {
        /* ignore */
      }
    }
  }

  function toggle() {
    setOpen(!open);
  }

  function closePanel() {
    setOpen(false);
  }

  fab.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggle();
  });

  backdrop.addEventListener("click", () => {
    closePanel();
  });

  window.addEventListener(
    "message",
    (e) => {
      if (e.source !== iframe.contentWindow) return;
      const t = e.data?.type;
      if (t === "OA_EMBED_CLOSE") closePanel();
    },
    false
  );

  window.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape" && open) {
        closePanel();
      }
    },
    true
  );

  document.documentElement.appendChild(host);

  return { host, setOpen, closePanel, toggle, iframe };
}

let uiApi = null;
/** @type {Promise<void> | null} */
let initPageEmbedPromise = null;

async function initPageEmbed() {
  if (window.top !== window) return;
  if (window.__OA_PAGE_EMBED_INIT__) return;
  if (!isAiChatHostPage()) return;
  if (!(await isEmbedEnabledInStorage())) return;

  if (initPageEmbedPromise) {
    await initPageEmbedPromise;
    return;
  }

  initPageEmbedPromise = (async () => {
    const edge = await getFabEdge();
    if (!(await isEmbedEnabledInStorage())) return;
    uiApi = mountUi(edge);
    window.__OA_PAGE_EMBED_INIT__ = true;
  })();

  try {
    await initPageEmbedPromise;
  } finally {
    initPageEmbedPromise = null;
  }
}

function teardownPageEmbed() {
  if (uiApi?.host?.isConnected) {
    uiApi.host.remove();
  }
  uiApi = null;
  window.__OA_PAGE_EMBED_INIT__ = false;
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes[STORAGE_EMBED_ENABLED]) {
    const next = changes[STORAGE_EMBED_ENABLED].newValue !== false;
    if (!next) {
      teardownPageEmbed();
      return;
    }
    if (next && isAiChatHostPage() && window.top === window) {
      void initPageEmbed();
    }
  }
  if (changes[STORAGE_EMBED_EDGE] && uiApi?.host?.isConnected) {
    teardownPageEmbed();
    void initPageEmbed();
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== "OA_PAGE_EMBED_OPEN_SWITCHER") return false;
  void (async () => {
    if (!isAiChatHostPage() || !(await isEmbedEnabledInStorage())) {
      sendResponse({ ok: false, reason: "no-embed" });
      return;
    }
    if (!uiApi) {
      window.__OA_PAGE_EMBED_INIT__ = false;
      await initPageEmbed();
    }
    if (uiApi?.setOpen) {
      uiApi.setOpen(true);
      sendResponse({ ok: true });
    } else {
      sendResponse({ ok: false, reason: "mount-failed" });
    }
  })();
  return true;
});

void initPageEmbed();
