"use strict";

const STORAGE_HISTORY = "oa_history";
const STORAGE_THEME_MODE = "oa_theme_mode";

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

function t(key, vars = {}) {
  const i18n = window.OA_OPTIONS_I18N;
  if (i18n?.format) return i18n.format(key, vars);
  return key;
}

function formatTime(ts) {
  const locale = window.OA_OPTIONS_I18N?.getLocale?.() === "zh" ? "zh-CN" : "en-US";
  return new Intl.DateTimeFormat(locale, {
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
    .map(({ siteName, text }) => `[${siteName}]\n${normalizeCollectedResponseText(text) || t("combine_unavailable")}`)
    .join("\n\n---------\n\n");
  const footer = String(existingPrompt || "").trim() || t("combine_footer");
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
  const data = await chrome.storage.local.get([STORAGE_THEME_MODE]);
  let mode = data[STORAGE_THEME_MODE] || "system";
  let effective = mode;
  if (mode === "system") {
    effective = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } else {
    effective = mode === "dark" ? "dark" : "light";
  }
  document.documentElement.setAttribute("data-theme", effective);
}

async function syncPreferenceControls() {
  const data = await chrome.storage.local.get([STORAGE_THEME_MODE]);
  const themeEl = document.getElementById("options-theme-mode");
  if (themeEl) themeEl.value = data[STORAGE_THEME_MODE] || "system";
  const localeEl = document.getElementById("options-locale-mode");
  if (localeEl && window.OA_OPTIONS_I18N?.getLocaleMode) {
    localeEl.value = window.OA_OPTIONS_I18N.getLocaleMode();
  }
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
    li.textContent = t("history_empty");
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
    del.textContent = t("history_deleted");
    del.addEventListener("click", (ev) => {
      ev.stopPropagation();
      void deleteHistoryEntry(item.id);
    });

    const body = document.createElement("div");
    body.className = "history-row-body";
    const promptText = escapeHtml((item.prompt || "").slice(0, 280));
    const meta = t("history_meta_links", {
      time: formatTime(item.ts),
      count: urlCount,
      sites: (item.sites || []).join(", ")
    });
    body.innerHTML = `<div class="history-row-prompt">${promptText || t("history_body_empty")}</div><div class="history-row-meta">${escapeHtml(meta)}</div>`;

    if (!urlCount) {
      body.style.opacity = "0.55";
      body.title = t("history_restore_missing");
    } else {
      body.classList.add("is-clickable");
      body.title = t("history_restore_title");
      body.addEventListener("click", async () => {
        setSendStatus(t("status_restore_running"));
        const sites = buildSiteEntriesFromHistoryUrls(urls);
        const res = await chrome.runtime.sendMessage({
          type: "OA_BG_RESTORE_HISTORY_URLS",
          urls,
          sites
        });
        if (!res?.ok) {
          setSendStatus(t("status_restore_failed", { reason: res?.error || "unknown" }));
          return;
        }
        const n = typeof res.navigated === "number" ? res.navigated : 0;
        setSendStatus(n ? t("status_restore_done", { count: n }) : t("status_restore_none"));
      });
    }

    row.appendChild(body);
    row.appendChild(del);
    li.appendChild(row);
    listEl.appendChild(li);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await window.OA_OPTIONS_I18N?.ready?.();
  await applyOptionsTheme();
  await syncPreferenceControls();

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

  document.getElementById("hero-open-tile")?.addEventListener("click", () => {
    window.__oaOptionsOpenAndTile?.();
  });
  document.getElementById("hero-retile")?.addEventListener("click", () => {
    window.__oaOptionsRetile?.();
  });
  document.getElementById("hero-close-targets")?.addEventListener("click", () => {
    window.__oaOptionsCloseTargets?.();
  });

  document.getElementById("history-clear-all")?.addEventListener("click", async () => {
    await chrome.storage.local.set({ [STORAGE_HISTORY]: [] });
    await renderHistoryPanel();
  });

  document.getElementById("options-theme-mode")?.addEventListener("change", async (event) => {
    const value = event.target?.value;
    const mode = value === "light" || value === "dark" ? value : "system";
    await chrome.storage.local.set({ [STORAGE_THEME_MODE]: mode });
    await applyOptionsTheme();
  });

  document.getElementById("options-locale-mode")?.addEventListener("change", async (event) => {
    const value = event.target?.value;
    const mode = value === "zh" || value === "en" ? value : "auto";
    await window.OA_OPTIONS_I18N?.setLocaleMode?.(mode);
    await syncPreferenceControls();
    await renderHistoryPanel();
    void renderQuickFocus("opt-targets");
    window.__oaRefreshOptionsSettings?.();
  });

  const promptEl = document.getElementById("prompt");
  const combineLatestBtnEl = document.getElementById("combine-latest");

  document.getElementById("combine-latest")?.addEventListener("click", async () => {
    const sites = await loadOrderedSelectedSitesPayload();
    const siteIds = sites.map((s) => s.siteId);
    if (!siteIds.length) {
      setSendStatus(t("status_pick_sites"));
      return;
    }
    if (combineLatestBtnEl) {
      combineLatestBtnEl.disabled = true;
    }
    setSendStatus(t("status_combining"));
    try {
      const res = await chrome.runtime.sendMessage({
        type: "OA_BG_COLLECT_LAST",
        siteIds,
        sites
      });
      if (!res?.ok || !Array.isArray(res.sections)) {
        setSendStatus(`Collect failed: ${res?.error || "unknown"}`);
        return;
      }
      if (promptEl) {
        promptEl.value = buildCombinedLatestPrompt(res.sections, promptEl.value);
        autoResizePrompt();
        promptEl.focus();
        const c = promptEl.value.length;
        promptEl.setSelectionRange(c, c);
      }
      setSendStatus(t("status_combined"));
    } finally {
      if (combineLatestBtnEl) combineLatestBtnEl.disabled = false;
    }
  });

  document.getElementById("new-chat")?.addEventListener("click", async () => {
    const sites = await loadOrderedSelectedSitesPayload();
    const siteIds = sites.map((s) => s.siteId);
    if (!siteIds.length) {
      setSendStatus(t("status_pick_sites"));
      return;
    }
    await chrome.runtime.sendMessage({
      type: "OA_BG_NEW_CHAT",
      siteIds,
      sites
    });
    setSendStatus(t("status_new_chat_sent"));
  });

  document.getElementById("send")?.addEventListener("click", async () => {
    const sites = await loadOrderedSelectedSitesPayload();
    const siteIds = sites.map((s) => s.siteId);
    if (!siteIds.length) {
      setSendStatus(t("status_pick_sites"));
      return;
    }
    const message = String(promptEl?.value || "");
    const requestId = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    setSendStatus(t("status_sending"));
    const res = await chrome.runtime.sendMessage({
      type: "OA_BG_SEND_PROMPT",
      siteIds,
      sites,
      message,
      requestId
    });
    if (!res?.ok) {
      setSendStatus(`Send failed: ${res?.error || "unknown"}`);
      return;
    }
    if (promptEl) {
      promptEl.value = "";
      autoResizePrompt();
    }
    setSendStatus(t("status_sent"));
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

window.addEventListener("oa-options-locale-changed", () => {
  void renderHistoryPanel();
  void renderQuickFocus("opt-targets");
});

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || !msg.type) return;
  const promptEl = document.getElementById("prompt");
  if (msg.type === "OA_QUOTE_TEXT" && msg.payload?.text && promptEl) {
    const quoted = String(msg.payload.text || "");
    promptEl.value = promptEl.value ? `${promptEl.value}\n${quoted}` : quoted;
    autoResizePrompt();
  }
  if (msg.type === "OA_SEND_PROGRESS" && msg.payload) {
    const { siteId, phase, requestId } = msg.payload;
    setSendStatus(`[${siteId}] ${phase}${requestId ? ` · ${requestId}` : ""}`);
  }
});
