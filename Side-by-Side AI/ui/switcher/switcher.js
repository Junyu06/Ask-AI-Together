"use strict";

const CONTROLLER_URL = chrome.runtime.getURL("ui/controller/controller.html");
const HISTORY_URL = chrome.runtime.getURL("ui/history/history.html");
const STORAGE_HISTORY = "oa_history";

const WIN_H_COLLAPSED = 280;
const WIN_H_EXPANDED = 560;

/** 与旧版 app.js 一致：避免中文输入法 composition 期间 Enter 误触发发送 */
let promptIsComposing = false;

/** @type {Array<object>} */
let historyCache = [];

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function formatTime(ts) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(ts));
}

function setSendStatus(text) {
  const el = document.getElementById("send-status");
  if (!el) return;
  el.textContent = text || "";
  if (text) {
    el.classList.remove("hidden");
  } else {
    el.classList.add("hidden");
  }
}

function autoResizePrompt() {
  const promptEl = document.getElementById("prompt");
  if (!promptEl) return;
  promptEl.style.height = "auto";
  promptEl.style.height = `${Math.min(promptEl.scrollHeight, 200)}px`;
}

function normalizeCollectedResponseText(text) {
  return String(text || "")
    .replaceAll(/\r\n?/g, "\n")
    .replaceAll(/\n{3,}/g, "\n\n")
    .trim();
}

/** 与旧版 buildCombinedLatestPrompt 一致（中文文案） */
function buildCombinedLatestPrompt(sections, existingPrompt = "") {
  const body = sections
    .map(({ siteName, text }) => `[${siteName}]\n${normalizeCollectedResponseText(text) || "[未获取到回复]"}`)
    .join("\n\n---------\n\n");
  const footer = String(existingPrompt || "").trim() || "请在这里写你的要求";
  return `${body}\n\n---------\n\n${footer}`.trim();
}

async function applySwitcherWindowTopPreference() {
  const pipEmbed = new URLSearchParams(location.search).get("pip") === "1";
  const embedMode = new URLSearchParams(location.search).get("embed") === "1";
  if (pipEmbed || embedMode) return;

  const data = await chrome.storage.local.get(["oa_switcher_always_on_top"]);
  const onTop = Boolean(data.oa_switcher_always_on_top);
  try {
    const w = await chrome.windows.getCurrent();
    if (w?.id == null) return;
    const delays = [0, 30, 60, 120, 200, 300];
    for (const ms of delays) {
      if (ms) await new Promise((r) => setTimeout(r, ms));
      try {
        await chrome.windows.update(w.id, { alwaysOnTop: onTop, focused: true });
      } catch (_e) {
        /* ignore */
      }
    }
  } catch (_e) {
    /* ignore */
  }
}

async function applySwitcherTheme() {
  const data = await chrome.storage.local.get(["oa_theme_mode"]);
  let mode = data.oa_theme_mode || "system";
  let effective = mode;
  if (mode === "system") {
    effective = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } else {
    effective = mode === "dark" ? "dark" : "light";
  }
  document.documentElement.setAttribute("data-theme", effective);
}

async function loadHistoryRaw() {
  const data = await chrome.storage.local.get([STORAGE_HISTORY]);
  return Array.isArray(data[STORAGE_HISTORY]) ? data[STORAGE_HISTORY] : [];
}

async function deleteHistoryEntry(entryId) {
  const id = String(entryId || "");
  if (!id) return;
  const history = await loadHistoryRaw();
  const next = history.filter((item) => String(item?.id || "") !== id);
  if (next.length === history.length) return;
  await chrome.storage.local.set({ [STORAGE_HISTORY]: next.slice(0, 200) });
  await renderHistoryPanel();
}

async function renderHistoryPanel() {
  const listEl = document.getElementById("history-panel-list");
  if (!listEl) return;
  historyCache = await loadHistoryRaw();
  listEl.innerHTML = "";

  if (!historyCache.length) {
    const li = document.createElement("li");
    li.className = "history-empty";
    li.textContent = "暂无发送记录。成功广播提示词后会出现在这里。";
    listEl.appendChild(li);
    return;
  }

  for (const item of historyCache) {
    const urls = item.urls && typeof item.urls === "object" ? item.urls : {};
    const urlCount = Object.keys(urls).filter((k) => /^https?:\/\//i.test(String(urls[k] || "").trim())).length;
    const li = document.createElement("li");
    const row = document.createElement("div");
    row.className = "history-row";

    const del = document.createElement("button");
    del.type = "button";
    del.className = "history-row-del";
    del.textContent = "删除";
    del.title = "从历史中移除（不关闭网页）";
    del.addEventListener("click", (ev) => {
      ev.stopPropagation();
      void deleteHistoryEntry(item.id);
    });

    const body = document.createElement("div");
    body.className = "history-row-body";
    const promptText = escapeHtml((item.prompt || "").slice(0, 280));
    const meta = `${formatTime(item.ts)} · ${urlCount} 个站点链接 · ${escapeHtml((item.sites || []).join(", "))}`;
    body.innerHTML = `<div class="history-row-prompt">${promptText || "（无正文）"}</div><div class="history-row-meta">${meta}</div>`;

    if (!urlCount) {
      body.style.opacity = "0.55";
      body.title = "该条没有保存各站点 URL 快照，无法恢复页面";
    } else {
      body.classList.add("is-clickable");
      body.title = "点击：已绑定的各站点标签页会打开对应 URL";
      body.addEventListener("click", async () => {
        setSendStatus("正在恢复各站点页面…");
        const sites = await loadOrderedSelectedSitesPayload();
        const res = await chrome.runtime.sendMessage({
          type: "OA_BG_RESTORE_HISTORY_URLS",
          urls,
          sites
        });
        if (!res?.ok) {
          setSendStatus(`恢复失败：${res?.error || "未知错误"}`);
          return;
        }
        const n = typeof res.navigated === "number" ? res.navigated : 0;
        setSendStatus(
          n
            ? `已导航 ${n} 个已绑定标签页。未绑定的站点请先在控制器打开。`
            : "没有已绑定的标签页可导航，请先在控制器打开对应站点。"
        );
      });
    }

    row.appendChild(body);
    row.appendChild(del);
    li.appendChild(row);
    listEl.appendChild(li);
  }
}

async function setHistoryPanelOpen(open) {
  document.body.classList.toggle("history-panel-open", open);
  const panel = document.getElementById("history-panel");
  if (panel) {
    panel.setAttribute("aria-hidden", open ? "false" : "true");
  }
  const hb = document.getElementById("history-btn");
  if (hb) {
    hb.setAttribute("aria-expanded", open ? "true" : "false");
  }
  const pipEmbed = new URLSearchParams(location.search).get("pip") === "1";
  const embedMode = new URLSearchParams(location.search).get("embed") === "1";
  if (pipEmbed || embedMode) return;

  try {
    const w = await chrome.windows.getCurrent();
    if (w?.id != null) {
      await chrome.windows.update(w.id, { height: open ? WIN_H_EXPANDED : WIN_H_COLLAPSED });
    }
  } catch (_e) {
    /* PiP 内嵌 iframe 等场景可能无法改窗口高度 */
  }
}

function toggleHistoryPanel() {
  const open = !document.body.classList.contains("history-panel-open");
  void setHistoryPanelOpen(open);
  if (open) void renderHistoryPanel();
}

document.addEventListener("DOMContentLoaded", async () => {
  await applySwitcherTheme();
  const pipEmbed = new URLSearchParams(location.search).get("pip") === "1";
  const embedMode = new URLSearchParams(location.search).get("embed") === "1";
  const chromeWindowMode = !pipEmbed && !embedMode;

  if (pipEmbed || embedMode) {
    document.getElementById("switcher-pip-top")?.remove();
    document.getElementById("switcher-pip-hint")?.remove();
  } else {
    const data = await chrome.storage.local.get(["oa_switcher_always_on_top"]);
    const hint = document.getElementById("switcher-pip-hint");
    if (hint && data.oa_switcher_always_on_top) {
      hint.hidden = false;
    }
  }

  if (embedMode) {
    const sub = document.querySelector(".switcher-sub");
    if (sub) {
      sub.textContent =
        "已嵌入当前网页侧栏（点「关闭侧栏」或按 Esc 收起）。发送目标仍为控制器里勾选的站点。";
    }
    const closeBtn = document.getElementById("switcher-embed-close");
    if (closeBtn) {
      closeBtn.hidden = false;
      closeBtn.addEventListener("click", () => {
        try {
          window.parent.postMessage({ type: "OA_EMBED_CLOSE", source: "oa-switcher" }, "*");
        } catch (_e) {
          /* ignore */
        }
      });
    }
  }

  if (chromeWindowMode) {
    void applySwitcherWindowTopPreference();
  }
  void renderQuickFocus("switcher-targets");
  void renderHistoryPanel();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[STORAGE_HISTORY]) return;
    void renderHistoryPanel();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (document.body.classList.contains("history-panel-open")) {
      void setHistoryPanelOpen(false);
      return;
    }
    if (embedMode) {
      try {
        window.parent.postMessage({ type: "OA_EMBED_CLOSE", source: "oa-switcher" }, "*");
      } catch (_e) {
        /* ignore */
      }
    }
  });

  const promptEl = document.getElementById("prompt");
  const combineLatestBtnEl = document.getElementById("combine-latest");

  document.getElementById("switcher-pip-top")?.addEventListener("click", async () => {
    try {
      await openSwitcherAsDocumentPictureInPicture();
      window.close();
    } catch (e) {
      setSendStatus(`画中画失败：${e?.message || String(e)}`);
    }
  });

  document.getElementById("history-panel-close")?.addEventListener("click", () => {
    void setHistoryPanelOpen(false);
  });

  document.getElementById("history-open-fullpage")?.addEventListener("click", () => {
    chrome.tabs.create({ url: HISTORY_URL });
  });

  document.getElementById("switcher-refresh").addEventListener("click", () => {
    void renderQuickFocus("switcher-targets");
  });

  document.getElementById("switcher-open-controller").addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "OA_BG_OPEN_CONTROLLER" });
  });

  document.getElementById("site-settings-btn").addEventListener("click", () => {
    chrome.tabs.create({ url: CONTROLLER_URL });
  });

  document.getElementById("history-btn").addEventListener("click", () => {
    toggleHistoryPanel();
  });

  document.getElementById("combine-latest").addEventListener("click", async () => {
    const sites = await loadOrderedSelectedSitesPayload();
    const siteIds = sites.map((s) => s.siteId);
    if (!siteIds.length) {
      setSendStatus("请先在控制器里勾选站点。");
      return;
    }
    if (combineLatestBtnEl) {
      combineLatestBtnEl.disabled = true;
      combineLatestBtnEl.setAttribute("title", "正在汇总…");
    }
    setSendStatus("正在汇总各窗口最新回复…");
    try {
      const res = await chrome.runtime.sendMessage({
        type: "OA_BG_COLLECT_LAST",
        siteIds,
        sites
      });
      if (!res?.ok || !Array.isArray(res.sections)) {
        setSendStatus(`汇总失败：${res?.error || "未知错误"}`);
        return;
      }
      if (promptEl) {
        promptEl.value = buildCombinedLatestPrompt(res.sections, promptEl.value);
        autoResizePrompt();
        promptEl.focus();
        const c = promptEl.value.length;
        promptEl.setSelectionRange(c, c);
      }
      setSendStatus("已汇总到输入框。");
    } finally {
      if (combineLatestBtnEl) {
        combineLatestBtnEl.disabled = false;
        combineLatestBtnEl.setAttribute("title", "汇总最新回复");
      }
    }
  });

  document.getElementById("new-chat").addEventListener("click", async () => {
    const sites = await loadOrderedSelectedSitesPayload();
    const siteIds = sites.map((s) => s.siteId);
    if (!siteIds.length) {
      setSendStatus("请先在控制器里勾选站点。");
      return;
    }
    await chrome.runtime.sendMessage({
      type: "OA_BG_NEW_CHAT",
      siteIds,
      sites
    });
    setSendStatus("已请求各站点新对话。");
  });

  document.getElementById("send").addEventListener("click", async () => {
    const sites = await loadOrderedSelectedSitesPayload();
    const siteIds = sites.map((s) => s.siteId);
    if (!siteIds.length) {
      setSendStatus("请先在控制器里勾选站点。");
      return;
    }
    const message = String(promptEl?.value || "");
    const requestId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    setSendStatus("正在发送…");
    const res = await chrome.runtime.sendMessage({
      type: "OA_BG_SEND_PROMPT",
      siteIds,
      sites,
      message,
      requestId
    });
    if (!res?.ok) {
      setSendStatus(`发送失败：${res?.error || "未知错误"}`);
      return;
    }
    if (promptEl) {
      promptEl.value = "";
      autoResizePrompt();
    }
    setSendStatus("已发送到各窗口。");
    void renderHistoryPanel();
  });

  promptEl?.addEventListener("keydown", (e) => {
    if (e.isComposing || promptIsComposing || e.keyCode === 229) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      document.getElementById("send").click();
    }
  });

  promptEl?.addEventListener("compositionstart", () => {
    promptIsComposing = true;
  });
  promptEl?.addEventListener("compositionend", () => {
    promptIsComposing = false;
  });

  promptEl?.addEventListener("input", () => {
    autoResizePrompt();
  });

  autoResizePrompt();
});

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || !msg.type) return;
  const promptEl = document.getElementById("prompt");
  if (msg.type === "OA_QUOTE_TEXT" && msg.payload?.text && promptEl) {
    const t = String(msg.payload.text || "");
    promptEl.value = promptEl.value ? `${promptEl.value}\n${t}` : t;
    autoResizePrompt();
  }
  if (msg.type === "OA_SEND_PROGRESS" && msg.payload) {
    const { siteId, phase, requestId } = msg.payload;
    setSendStatus(`[${siteId}] ${phase}${requestId ? ` · ${requestId}` : ""}`);
  }
});
