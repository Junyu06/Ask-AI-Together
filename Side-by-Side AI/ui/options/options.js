"use strict";

const STORAGE_HISTORY = "oa_history";

/** @type {boolean} */
let promptIsComposing = false;

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
  if (text) el.classList.remove("hidden");
  else el.classList.add("hidden");
}

function autoResizePrompt() {
  const promptEl = document.getElementById("prompt");
  if (!promptEl) return;
  promptEl.style.height = "auto";
  promptEl.style.height = `${Math.min(promptEl.scrollHeight, 240)}px`;
}

function normalizeCollectedResponseText(text) {
  return String(text || "")
    .replaceAll(/\r\n?/g, "\n")
    .replaceAll(/\n{3,}/g, "\n\n")
    .trim();
}

function buildCombinedLatestPrompt(sections, existingPrompt = "") {
  const body = sections
    .map(({ siteName, text }) => `[${siteName}]\n${normalizeCollectedResponseText(text) || "[未获取到回复]"}`)
    .join("\n\n---------\n\n");
  const footer = String(existingPrompt || "").trim() || "请在这里写你的要求";
  return `${body}\n\n---------\n\n${footer}`.trim();
}

function buildSiteEntriesFromHistoryUrls(urls) {
  const entries = [];
  if (!urls || typeof urls !== "object") return entries;
  for (const [siteId, url] of Object.entries(urls)) {
    const cleanSiteId = String(siteId || "").trim();
    const cleanUrl = String(url || "").trim();
    if (!cleanSiteId || !/^https?:\/\//i.test(cleanUrl)) continue;
    entries.push({ siteId: cleanSiteId, url: cleanUrl });
  }
  return entries;
}

async function applyOptionsTheme() {
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
  const historyCache = await loadHistoryRaw();
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
        const sites = buildSiteEntriesFromHistoryUrls(urls);
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
            ? `已导航 ${n} 个已绑定标签页。未绑定的站点请先在下方勾选并打开对应窗口。`
            : "没有已绑定的标签页可导航，请先勾选目标并打开对应站点。"
        );
      });
    }

    row.appendChild(body);
    row.appendChild(del);
    li.appendChild(row);
    listEl.appendChild(li);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await applyOptionsTheme();

  const embedMode = new URLSearchParams(location.search).get("embed") === "1";
  if (embedMode) {
    document.body.classList.add("options-embed");
    const closeBtn = document.getElementById("opt-embed-close");
    if (closeBtn) {
      closeBtn.hidden = false;
      closeBtn.addEventListener("click", () => {
        try {
          window.parent.postMessage({ type: "OA_EMBED_CLOSE", source: "oa-options-embed" }, "*");
        } catch (_e) {
          /* ignore */
        }
      });
    }

    window.addEventListener("message", (ev) => {
      if (ev.source !== window.parent) return;
      if (ev.data?.source !== "oa-page-embed") return;
      if (ev.data?.type === "OA_EMBED_VIEW") {
        const v = ev.data.view === "history" ? "history" : "default";
        document.body.classList.toggle("options-embed-view-history", v === "history");
        if (v === "history") void renderHistoryPanel();
        return;
      }
      if (ev.data?.type === "OA_EMBED_INVOKE") {
        const action = ev.data.action;
        if (action === "new-chat") document.getElementById("new-chat")?.click();
        else if (action === "combine-latest") document.getElementById("combine-latest")?.click();
      }
    });

    try {
      window.parent.postMessage({ type: "OA_EMBED_READY", source: "oa-options-embed" }, "*");
    } catch (_e) {
      /* ignore */
    }
  }

  const embedToggle = document.getElementById("page-embed-fab-toggle");
  if (embedToggle) {
    const d = await chrome.storage.local.get(["oa_page_embed_switcher_enabled"]);
    embedToggle.checked = d.oa_page_embed_switcher_enabled !== false;
    embedToggle.addEventListener("change", async () => {
      await chrome.storage.local.set({ oa_page_embed_switcher_enabled: embedToggle.checked });
    });
  }

  document.addEventListener("keydown", (e) => {
    if (!embedMode || e.key !== "Escape") return;
    try {
      window.parent.postMessage({ type: "OA_EMBED_CLOSE", source: "oa-options-embed" }, "*");
    } catch (_e) {
      /* ignore */
    }
  });

  void renderQuickFocus("opt-targets");
  void renderHistoryPanel();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[STORAGE_HISTORY]) return;
    void renderHistoryPanel();
  });

  document.getElementById("opt-refresh-focus")?.addEventListener("click", () => {
    void renderQuickFocus("opt-targets");
    window.__oaRefreshOptionsSettings?.();
  });

  document.getElementById("history-clear-all")?.addEventListener("click", async () => {
    await chrome.storage.local.set({ [STORAGE_HISTORY]: [] });
    await renderHistoryPanel();
  });

  const promptEl = document.getElementById("prompt");
  const combineLatestBtnEl = document.getElementById("combine-latest");

  document.getElementById("combine-latest")?.addEventListener("click", async () => {
    const sites = await loadOrderedSelectedSitesPayload();
    const siteIds = sites.map((s) => s.siteId);
    if (!siteIds.length) {
      setSendStatus("请先在下方勾选目标站点。");
      return;
    }
    if (combineLatestBtnEl) {
      combineLatestBtnEl.disabled = true;
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
      if (combineLatestBtnEl) combineLatestBtnEl.disabled = false;
    }
  });

  document.getElementById("new-chat")?.addEventListener("click", async () => {
    const sites = await loadOrderedSelectedSitesPayload();
    const siteIds = sites.map((s) => s.siteId);
    if (!siteIds.length) {
      setSendStatus("请先在下方勾选目标站点。");
      return;
    }
    await chrome.runtime.sendMessage({
      type: "OA_BG_NEW_CHAT",
      siteIds,
      sites
    });
    setSendStatus("已请求各站点新对话。");
  });

  document.getElementById("send")?.addEventListener("click", async () => {
    const sites = await loadOrderedSelectedSitesPayload();
    const siteIds = sites.map((s) => s.siteId);
    if (!siteIds.length) {
      setSendStatus("请先在下方勾选目标站点。");
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
      document.getElementById("send")?.click();
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
