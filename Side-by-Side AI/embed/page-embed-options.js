"use strict";

/**
 * 右侧停靠栏：默认仅显示圆形触发器（星形+A）；悬停展开新聊天 / 历史 / 总结 / 设置。
 * 主按钮点击打开底部 iframe（与主仓库 .bubble 一致的广播输入）。
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
  "gemini.google.com",
  "www.perplexity.ai",
  "perplexity.ai"
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
    #oa-embed-dock {
      position: fixed;
      right: 0;
      top: 50%;
      transform: translateY(-50%);
      z-index: 2147483647;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      pointer-events: none;
    }
    #oa-embed-dock * {
      pointer-events: auto;
    }
    .oa-embed-dock-inner {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 10px 8px 10px 12px;
      background: #0d0d0d;
      border-radius: 18px 0 0 18px;
      box-shadow: -4px 0 24px rgba(0,0,0,.45);
      border: 1px solid rgba(255,255,255,.06);
      border-right: none;
    }
    /* 主按钮留在原位；工具绝对定位向上下伸出，不挤压主按钮 */
    .oa-embed-dock-tools-above,
    .oa-embed-dock-tools-below {
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.18s ease;
      z-index: 1;
    }
    .oa-embed-dock-tools-above {
      bottom: calc(100% + 8px);
    }
    .oa-embed-dock-tools-below {
      top: calc(100% + 8px);
    }
    #oa-embed-dock:hover .oa-embed-dock-tools-above,
    #oa-embed-dock:hover .oa-embed-dock-tools-below {
      opacity: 1;
      pointer-events: auto;
    }
    .oa-embed-dock-tool {
      width: 40px;
      height: 40px;
      padding: 0;
      margin: 0;
      border: 2px solid #e85a8c;
      border-radius: 50%;
      background: transparent;
      color: #e85a8c;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: background 0.15s ease, color 0.15s ease;
    }
    .oa-embed-dock-tool:hover {
      background: rgba(232, 90, 140, 0.15);
      color: #ff7eb3;
      border-color: #ff7eb3;
    }
    .oa-embed-dock-tool svg {
      width: 20px;
      height: 20px;
      display: block;
    }
    .oa-embed-dock-trigger.oa-embed-dock-trigger--main {
      position: relative;
      z-index: 2;
      width: 46px;
      height: 46px;
      padding: 0;
      margin: 0;
      border: none;
      border-radius: 50%;
      background: linear-gradient(145deg, #9e4d5c 0%, #6d3540 100%);
      color: #f5e6ea;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 14px rgba(0,0,0,.35);
      flex-shrink: 0;
    }
    .oa-embed-dock-trigger.oa-embed-dock-trigger--main:hover {
      filter: brightness(1.08);
    }
    .oa-embed-dock-trigger .oa-embed-trigger-icon {
      width: 26px;
      height: 26px;
      display: block;
    }
    #oa-embed-root {
      position: fixed;
      left: 50%;
      bottom: 0;
      transform: translateX(-50%);
      width: min(960px, calc(100vw - 36px));
      max-width: 100vw;
      height: 90px;
      min-height: 80px;
      z-index: 2147483646;
      display: none;
      flex-direction: column;
      background: transparent;
      border: none;
      box-shadow: none;
      overflow: visible;
    }
    #oa-embed-root.oa-open.oa-embed-root--history {
      height: min(560px, 72vh) !important;
      min-height: 320px !important;
    }
    #oa-embed-root.oa-open.oa-embed-root--settings {
      width: calc(100vw - 8px) !important;
      max-width: calc(100vw - 8px) !important;
      height: calc(100vh - 8px) !important;
      min-height: calc(100vh - 8px) !important;
      bottom: 4px !important;
    }
    #oa-embed-root.oa-open { display: flex; }
    #oa-embed-root iframe {
      flex: 1;
      width: 100%;
      min-height: 0;
      border: none;
      background: transparent;
    }
  `;
  (document.head || document.documentElement).appendChild(style);
}

let rootEl = null;
/** @type {HTMLIFrameElement | null} */
let embedIframe = null;
let dockEl = null;

/** 合并同一 tick 的多条 postMessage；首次 iframe UI ready 前只排队，避免初次点击丢 invoke。 */
let embedMsgPending = [];
let embedMsgFlushScheduled = false;
let embedIframeReady = false;
let embedContextValid = true;
let ensureDockScheduled = false;

function markEmbedContextInvalid() {
  embedContextValid = false;
  try {
    dockEl?.remove();
  } catch (_e) {
    /* ignore */
  }
  try {
    rootEl?.remove();
  } catch (_e) {
    /* ignore */
  }
  dockEl = null;
  rootEl = null;
  embedIframe = null;
  embedIframeReady = false;
  embedMsgPending = [];
}

function isExtensionContextInvalidError(err) {
  return String(err?.message || err || "").includes("Extension context invalidated");
}

function getOptionsEmbedUrl() {
  if (!embedContextValid) return "";
  try {
    return `${chrome.runtime.getURL("ui/options/options.html")}?embed=1`;
  } catch (err) {
    if (isExtensionContextInvalidError(err)) {
      markEmbedContextInvalid();
      return "";
    }
    throw err;
  }
}

function postToEmbed(payload) {
  if (!embedContextValid) return;
  try {
    embedIframe?.contentWindow?.postMessage({ ...payload, source: "oa-page-embed" }, "*");
  } catch (err) {
    if (isExtensionContextInvalidError(err)) {
      markEmbedContextInvalid();
      return;
    }
  }
}

/**
 * iframe 尚未 load 时可能同时排队「新聊天」与「打开历史」；若先 flush 了 new-chat 再 VIEW history，
 * 会误开新对话。若队列里存在「历史」视图，则丢弃「最后一次 VIEW history」之前的 new-chat 调用。
 */
function dedupeEmbedPendingBeforeFlush() {
  const idxList = embedMsgPending
    .map((p, i) => (p?.type === "OA_EMBED_VIEW" && p.view === "history" ? i : -1))
    .filter((i) => i >= 0);
  if (!idxList.length) return;
  const idxLastHistory = idxList[idxList.length - 1];
  embedMsgPending = embedMsgPending.filter((p, i) => {
    if (p?.type === "OA_EMBED_INVOKE" && p.action === "new-chat" && i < idxLastHistory) return false;
    return true;
  });
}

function flushEmbedPendingBatch() {
  embedMsgFlushScheduled = false;
  dedupeEmbedPendingBeforeFlush();
  const batch = embedMsgPending.splice(0, embedMsgPending.length);
  for (const p of batch) postToEmbed(p);
}

function flushEmbedMessage(payload) {
  if (!embedContextValid) return;
  if (!embedIframe) return;
  embedMsgPending.push(payload);
  if (!embedIframeReady) return;
  if (embedMsgFlushScheduled) return;
  embedMsgFlushScheduled = true;
  queueMicrotask(() => flushEmbedPendingBatch());
}

function setHostEmbedMode(mode) {
  if (!rootEl) return;
  rootEl.classList.toggle("oa-embed-root--history", mode === "history");
  rootEl.classList.toggle("oa-embed-root--settings", mode === "settings");
}

function getHostEmbedMode() {
  if (!rootEl?.classList.contains("oa-open")) return "closed";
  if (rootEl.classList.contains("oa-embed-root--settings")) return "settings";
  if (rootEl.classList.contains("oa-embed-root--history")) return "history";
  return "default";
}

function openEmbedPanel() {
  if (!embedContextValid) return;
  injectEmbedStyles();
  if (rootEl && !rootEl.isConnected) {
    rootEl = null;
    embedIframe = null;
    embedIframeReady = false;
  }
  if (!rootEl) {
    embedIframeReady = false;
    rootEl = document.createElement("div");
    rootEl.id = "oa-embed-root";
    rootEl.setAttribute("role", "dialog");
    rootEl.setAttribute("aria-label", "Side-by-Side AI");

    const iframe = document.createElement("iframe");
    const url = getOptionsEmbedUrl();
    if (!url) return;
    iframe.src = url;
    iframe.setAttribute("allow", "clipboard-read; clipboard-write");
    iframe.title = "Side-by-Side AI";
    embedIframe = iframe;
    iframe.addEventListener(
      "load",
      () => {
        /* 仅表示文档已加载；真正可收消息要等 options 页脚本显式发 READY。 */
      },
      { once: true }
    );
    rootEl.appendChild(iframe);
    document.body.appendChild(rootEl);
  }
  rootEl.classList.add("oa-open");
}

function closeEmbedPanel() {
  if (rootEl) rootEl.classList.remove("oa-open");
  setHostEmbedMode("default");
}

function toggleEmbedPanel() {
  if (rootEl?.classList.contains("oa-open")) closeEmbedPanel();
  else {
    openEmbedPanel();
    setHostEmbedMode("default");
    flushEmbedMessage({ type: "OA_EMBED_VIEW", view: "default" });
  }
}

function ensureDock() {
  injectEmbedStyles();
  if (dockEl?.isConnected) return;
  if (dockEl && !dockEl.isConnected) dockEl = null;

  dockEl = document.createElement("div");
  dockEl.id = "oa-embed-dock";

  const inner = document.createElement("div");
  inner.className = "oa-embed-dock-inner";

  const toolsAbove = document.createElement("div");
  toolsAbove.className = "oa-embed-dock-tools-above";
  toolsAbove.setAttribute("role", "toolbar");
  toolsAbove.setAttribute("aria-label", "快捷工具（上）");

  const toolsBelow = document.createElement("div");
  toolsBelow.className = "oa-embed-dock-tools-below";
  toolsBelow.setAttribute("role", "toolbar");
  toolsBelow.setAttribute("aria-label", "快捷工具（下）");

  const iconNewChat = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.85" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>`;
  const iconHistory = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.85" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>`;
  const iconSummary = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.85" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" /></svg>`;
  const iconTile = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.85" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 4.5h6v6h-6zm9 0h6v6h-6zm-9 9h6v6h-6zm9 0h6v6h-6z" /></svg>`;
  const iconCloseAll = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.95" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M5 7h14M9 7V5.8c0-.66.54-1.2 1.2-1.2h3.6c.66 0 1.2.54 1.2 1.2V7M8 10v6m4-6v6m4-6v6M7 7l.7 10.2c.05.69.62 1.23 1.31 1.23h6c.69 0 1.26-.54 1.31-1.23L17 7" /></svg>`;
  const iconSettings = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.85" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.391 1.018.03.22.03.435 0 .655-.047.405.098.778.391 1.02l1.003.827c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.39-1.018a12.694 12.694 0 010-.655c.047-.406-.098-.779-.39-1.019l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>`;

  function mkTool(label, title, svg, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "oa-embed-dock-tool";
    b.title = title;
    b.setAttribute("aria-label", title);
    b.innerHTML = svg;
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      onClick();
    });
    return b;
  }

  toolsAbove.appendChild(
    mkTool("close", "关闭全部窗口", iconCloseAll, () => {
      closeEmbedPanel();
      chrome.runtime.sendMessage({ type: "OA_BG_CLOSE_ALL_TARGETS" }).catch(() => {});
    })
  );
  toolsAbove.appendChild(
    mkTool("hist", "历史", iconHistory, () => {
      if (getHostEmbedMode() === "history") {
        closeEmbedPanel();
        return;
      }
      openEmbedPanel();
      setHostEmbedMode("history");
      embedMsgPending = embedMsgPending.filter(
        (p) => !(p?.type === "OA_EMBED_INVOKE" && p.action === "new-chat")
      );
      flushEmbedMessage({ type: "OA_EMBED_VIEW", view: "history" });
    })
  );
  toolsAbove.appendChild(
    mkTool("new", "新聊天", iconNewChat, () => {
      openEmbedPanel();
      setHostEmbedMode("default");
      flushEmbedMessage({ type: "OA_EMBED_VIEW", view: "default" });
      flushEmbedMessage({ type: "OA_EMBED_INVOKE", action: "new-chat" });
    })
  );

  toolsBelow.appendChild(
    mkTool("tile", "平铺", iconTile, () => {
      openEmbedPanel();
      setHostEmbedMode("default");
      flushEmbedMessage({ type: "OA_EMBED_VIEW", view: "default" });
      flushEmbedMessage({ type: "OA_EMBED_INVOKE", action: "tile" });
    })
  );
  toolsBelow.appendChild(
    mkTool("sum", "总结", iconSummary, () => {
      openEmbedPanel();
      setHostEmbedMode("default");
      flushEmbedMessage({ type: "OA_EMBED_VIEW", view: "default" });
      flushEmbedMessage({ type: "OA_EMBED_INVOKE", action: "combine-latest" });
    })
  );
  toolsBelow.appendChild(
    mkTool("set", "设置", iconSettings, () => {
      if (getHostEmbedMode() === "settings") {
        closeEmbedPanel();
        return;
      }
      openEmbedPanel();
      setHostEmbedMode("settings");
      flushEmbedMessage({ type: "OA_EMBED_VIEW", view: "default" });
      flushEmbedMessage({ type: "OA_EMBED_INVOKE", action: "open-settings", tab: "sites" });
    })
  );

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "oa-embed-dock-trigger oa-embed-dock-trigger--main";
  trigger.title = "Side-by-Side AI";
  trigger.setAttribute("aria-label", "打开广播输入");
  trigger.innerHTML = `<span class="oa-embed-trigger-icon" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none"><path fill="currentColor" d="M10 6.5l1.1 2.4 2.6.4-1.9 1.8.4 2.6-2.3-1.2-2.3 1.2.4-2.6-1.9-1.8 2.6-.4L10 6.5z"/><text x="17" y="22" fill="currentColor" font-size="10" font-family="system-ui,-apple-system,sans-serif" font-weight="700">A</text></svg></span>`;
  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleEmbedPanel();
  });

  inner.appendChild(toolsAbove);
  inner.appendChild(trigger);
  inner.appendChild(toolsBelow);
  dockEl.appendChild(inner);
  document.body.appendChild(dockEl);
}

function scheduleEnsureDock() {
  if (ensureDockScheduled || !embedContextValid) return;
  ensureDockScheduled = true;
  window.setTimeout(async () => {
    ensureDockScheduled = false;
    if (!embedContextValid || window.self !== window.top) return;
    if (!hostMatchesEmbed(location.hostname)) return;
    if (!(await isEmbedEnabledInStorage())) return;
    ensureDock();
  }, 120);
}

async function isEmbedEnabledInStorage() {
  if (!embedContextValid) return false;
  try {
    const data = await chrome.storage.local.get([STORAGE_EMBED_ENABLED]);
    return data[STORAGE_EMBED_ENABLED] !== false;
  } catch (err) {
    if (isExtensionContextInvalidError(err)) {
      markEmbedContextInvalid();
      return false;
    }
    throw err;
  }
}

async function boot() {
  if (!embedContextValid) return;
  if (window.self !== window.top) return;
  if (!hostMatchesEmbed(location.hostname)) return;
  if (!(await isEmbedEnabledInStorage())) return;
  ensureDock();
}

function installDockSelfHealing() {
  const observer = new MutationObserver(() => {
    if (dockEl?.isConnected) return;
    scheduleEnsureDock();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  const notifyRouteChange = () => scheduleEnsureDock();
  window.addEventListener("pageshow", notifyRouteChange);
  window.addEventListener("popstate", notifyRouteChange);
  window.addEventListener("hashchange", notifyRouteChange);

  const wrapHistoryMethod = (name) => {
    const original = history[name];
    if (typeof original !== "function") return;
    history[name] = function wrappedHistoryMethod(...args) {
      const result = original.apply(this, args);
      scheduleEnsureDock();
      return result;
    };
  };
  wrapHistoryMethod("pushState");
  wrapHistoryMethod("replaceState");
}

window.addEventListener("message", (ev) => {
  if (ev.source === embedIframe?.contentWindow && ev.data?.type === "OA_EMBED_READY" && ev.data?.source === "oa-options-embed") {
    embedIframeReady = true;
    flushEmbedPendingBatch();
    return;
  }
  if (ev.source === embedIframe?.contentWindow && ev.data?.type === "OA_EMBED_MODE" && ev.data?.source === "oa-options-embed") {
    setHostEmbedMode(ev.data.mode === "history" || ev.data.mode === "settings" ? ev.data.mode : "default");
    return;
  }
  if (ev.source === embedIframe?.contentWindow && ev.data?.type === "OA_EMBED_HEIGHT" && ev.data?.source === "oa-options-embed") {
    if (rootEl && !rootEl.classList.contains("oa-embed-root--history") && !rootEl.classList.contains("oa-embed-root--settings")) {
      const h = Number(ev.data.height);
      if (h > 0) {
        rootEl.style.height = `${h}px`;
        rootEl.style.minHeight = `${h}px`;
      }
    }
    return;
  }
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
  if (!embedContextValid) {
    sendResponse?.({ ok: false, reason: "context-invalidated" });
    return false;
  }
  if (!msg || msg.type !== "OA_PAGE_EMBED_OPEN_SWITCHER") return false;
  void (async () => {
    if (!hostMatchesEmbed(location.hostname) || !(await isEmbedEnabledInStorage())) {
      sendResponse({ ok: false, reason: "disabled-or-host" });
      return;
    }
    ensureDock();
    openEmbedPanel();
    setHostEmbedMode("default");
    flushEmbedMessage({ type: "OA_EMBED_VIEW", view: "default" });
    sendResponse({ ok: true });
  })();
  return true;
});

installDockSelfHealing();
void boot();
