"use strict";

const STORAGE_HISTORY = "oa_history";
const STORAGE_THEME_MODE = "oa_theme_mode";
const STORAGE_LOCALE_MODE = "oa_locale_mode";
const STORAGE_LAUNCH_MODE = "oa_mode";

/** @type {boolean} */
let promptIsComposing = false;
let pendingPanelCloseTimer = 0;
let sendStatusTimer = 0;

function notifyEmbedMode(mode) {
  if (!document.body.classList.contains("options-embed")) return;
  try {
    window.parent.postMessage(
      {
        type: "OA_EMBED_MODE",
        mode: mode === "history" || mode === "settings" ? mode : "default",
        source: "oa-options-embed"
      },
      "*"
    );
  } catch (_e) {
    /* ignore */
  }
  if (mode !== "history" && mode !== "settings") {
    requestAnimationFrame(() => notifyEmbedHeight());
  }
}

function notifyEmbedHeight() {
  if (!document.body.classList.contains("options-embed")) return;
  const bubbleEl = document.getElementById("input-bubble");
  if (!bubbleEl) return;
  const h = bubbleEl.offsetHeight + 30; // 22px bottom offset + 8px buffer
  try {
    window.parent.postMessage({ type: "OA_EMBED_HEIGHT", height: h, source: "oa-options-embed" }, "*");
  } catch (_e) {
    /* ignore */
  }
}

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

function runPanelOpenAnimation(panelEl) {
  if (!panelEl) return;
  if (pendingPanelCloseTimer) {
    window.clearTimeout(pendingPanelCloseTimer);
    pendingPanelCloseTimer = 0;
  }
  panelEl.classList.remove("hidden", "panel-closing");
  panelEl.classList.add("panel-open-initial");
  requestAnimationFrame(() => {
    panelEl.classList.remove("panel-open-initial");
  });
}

function openSettingsPanel(tab = "sites") {
  document.getElementById("history-panel")?.classList.add("hidden");
  switchSettingsTab(tab);
  notifyEmbedMode("settings");
  const backdropEl = document.getElementById("panel-backdrop");
  if (backdropEl) {
    backdropEl.classList.remove("hidden", "panel-closing");
    backdropEl.classList.add("panel-open-initial");
    requestAnimationFrame(() => backdropEl.classList.remove("panel-open-initial"));
  }
  runPanelOpenAnimation(document.getElementById("right-panel"));
}

function openHistoryPanel() {
  document.getElementById("right-panel")?.classList.add("hidden");
  notifyEmbedMode("history");
  const backdropEl = document.getElementById("panel-backdrop");
  if (backdropEl) {
    backdropEl.classList.remove("hidden", "panel-closing");
    backdropEl.classList.add("panel-open-initial");
    requestAnimationFrame(() => backdropEl.classList.remove("panel-open-initial"));
  }
  runPanelOpenAnimation(document.getElementById("history-panel"));
}

function closePanels() {
  const backdropEl = document.getElementById("panel-backdrop");
  const rightPanelEl = document.getElementById("right-panel");
  const historyPanelEl = document.getElementById("history-panel");

  if (!backdropEl || !rightPanelEl || !historyPanelEl) return;

  rightPanelEl.classList.add("panel-closing");
  historyPanelEl.classList.add("panel-closing");
  backdropEl.classList.add("panel-closing");

  let closed = false;
  const finalizeClose = () => {
    if (closed) return;
    closed = true;
    backdropEl.removeEventListener("transitionend", onClosed);
    rightPanelEl.classList.add("hidden");
    historyPanelEl.classList.add("hidden");
    backdropEl.classList.add("hidden");
    rightPanelEl.classList.remove("panel-closing");
    historyPanelEl.classList.remove("panel-closing");
    backdropEl.classList.remove("panel-closing");
    notifyEmbedMode("default");
  };

  const onClosed = (ev) => {
    if (ev.target !== backdropEl) return;
    finalizeClose();
  };

  backdropEl.addEventListener("transitionend", onClosed);
  if (pendingPanelCloseTimer) window.clearTimeout(pendingPanelCloseTimer);
  pendingPanelCloseTimer = window.setTimeout(() => {
    pendingPanelCloseTimer = 0;
    finalizeClose();
  }, 120);
}

function switchSettingsTab(tab) {
  document.querySelectorAll(".sidebar-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.settingsTab === tab);
  });

  document.querySelectorAll(".settings-tab").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.tab === tab);
  });
}

function setSendStatus(text) {
  const el = document.getElementById("send-status");
  if (!el) return;
  if (sendStatusTimer) {
    window.clearTimeout(sendStatusTimer);
    sendStatusTimer = 0;
  }
  el.textContent = text || "";
  el.classList.toggle("hidden", !text);
  el.classList.toggle("is-active", !!text);
  if (text) {
    sendStatusTimer = window.setTimeout(() => {
      if (el.textContent !== text) return;
      el.textContent = "";
      el.classList.add("hidden");
      el.classList.remove("is-active");
      sendStatusTimer = 0;
    }, 5000);
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error("file-read-failed"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

async function normalizeClipboardFiles(fileList) {
  const files = Array.from(fileList || []).filter((file) => file && String(file.type || "").startsWith("image/"));
  const normalized = await Promise.all(
    files.map(async (file) => ({
      name: file.name || `image-${Date.now()}.png`,
      type: file.type || "image/png",
      dataUrl: await readFileAsDataUrl(file)
    }))
  );
  return normalized.filter((file) => file.dataUrl);
}

function autoResizePrompt() {
  const promptEl = document.getElementById("prompt");
  if (!promptEl) return;
  promptEl.style.height = "auto";
  const nextHeight = Math.min(Math.max(promptEl.scrollHeight, 40), 240);
  promptEl.style.height = `${nextHeight}px`;
  promptEl.style.overflowY = promptEl.scrollHeight > 240 ? "auto" : "hidden";
  notifyEmbedHeight();
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

async function attachFilesNow(files) {
  const sites = await loadOrderedSelectedSitesPayload();
  const siteIds = sites.map((s) => s.siteId);
  if (!siteIds.length) {
    setSendStatus(t("status_pick_sites"));
    return;
  }
  const res = await chrome.runtime.sendMessage({
    type: "OA_BG_ATTACH_FILES",
    siteIds,
    sites,
    files
  });
  if (!res?.ok) {
    setSendStatus(t("status_attachments_failed"));
    return;
  }
  if (!(res.attachedCount > 0)) {
    setSendStatus(t("status_attachments_failed"));
    return;
  }
  setSendStatus(t("status_attachments_ready", { count: files.length }));
}

async function handleIncomingFiles(fileList) {
  const files = await normalizeClipboardFiles(fileList);
  if (!files.length) return;
  await attachFilesNow(files);
}

async function combineLatestIntoPrompt(promptEl, combineLatestBtnEl) {
  closePanels();
  const sites = await loadOrderedSelectedSitesPayload();
  const siteIds = sites.map((s) => s.siteId);
  if (!siteIds.length) {
    setSendStatus(t("status_pick_sites"));
    return;
  }
  if (combineLatestBtnEl) combineLatestBtnEl.disabled = true;
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
}

async function triggerNewChat() {
  closePanels();
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

async function syncThemeControls() {
  const data = await chrome.storage.local.get([STORAGE_THEME_MODE]);
  const mode = data[STORAGE_THEME_MODE] || "system";
  const radio = document.querySelector(`input[name="theme-mode"][value="${mode}"]`);
  if (radio) radio.checked = true;
}

async function syncLocaleControls() {
  const data = await chrome.storage.local.get([STORAGE_LOCALE_MODE]);
  const mode = data[STORAGE_LOCALE_MODE] || "auto";
  const radio = document.querySelector(`input[name="locale-mode"][value="${mode}"]`);
  if (radio) radio.checked = true;
}

async function syncModeControls() {
  const data = await chrome.storage.local.get([STORAGE_LAUNCH_MODE]);
  const mode = data[STORAGE_LAUNCH_MODE] === "windows" ? "windows" : "legacy";
  const radio = document.querySelector(`input[name="launch-mode"][value="${mode}"]`);
  if (radio) radio.checked = true;
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
  const listEl = document.getElementById("history-list");
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
  await syncThemeControls();
  await syncLocaleControls();
  await syncModeControls();
  await renderHistoryPanel();

  const embedMode = new URLSearchParams(location.search).get("embed") === "1";
  if (embedMode) {
    document.body.classList.add("options-embed");
    window.addEventListener("message", (ev) => {
      if (ev.source !== window.parent) return;
      if (ev.data?.source !== "oa-page-embed") return;
      if (ev.data?.type === "OA_EMBED_VIEW") {
        const view = ev.data.view === "history" ? "history" : "default";
        if (view === "history") openHistoryPanel();
        else closePanels();
        return;
      }
      if (ev.data?.type === "OA_EMBED_INVOKE") {
        const action = ev.data.action;
        if (action === "new-chat") void triggerNewChat();
        if (action === "combine-latest") void combineLatestIntoPrompt(document.getElementById("prompt"), null);
        if (action === "tile") document.getElementById("sw-tile")?.click();
        if (action === "open-settings") {
          openSettingsPanel(ev.data.tab || "sites");
        }
      }
    });

    try {
      window.parent.postMessage({ type: "OA_EMBED_READY", source: "oa-options-embed" }, "*");
      requestAnimationFrame(() => notifyEmbedHeight());
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

  document.getElementById("site-settings-btn")?.addEventListener("click", () => openSettingsPanel("sites"));
  document.getElementById("history-btn")?.addEventListener("click", openHistoryPanel);
  document.getElementById("panel-close")?.addEventListener("click", closePanels);
  document.getElementById("history-close")?.addEventListener("click", closePanels);
  document.getElementById("panel-backdrop")?.addEventListener("click", closePanels);

  document.querySelectorAll(".sidebar-item").forEach((item) => {
    item.addEventListener("click", () => {
      switchSettingsTab(item.dataset.settingsTab || "sites");
    });
  });

  document.getElementById("history-clear-all")?.addEventListener("click", async () => {
    await chrome.storage.local.set({ [STORAGE_HISTORY]: [] });
    await renderHistoryPanel();
  });

  document.querySelectorAll('input[name="theme-mode"]').forEach((input) => {
    input.addEventListener("change", async () => {
      if (!input.checked) return;
      await chrome.storage.local.set({ [STORAGE_THEME_MODE]: input.value });
      await applyOptionsTheme();
    });
  });

  document.querySelectorAll('input[name="locale-mode"]').forEach((input) => {
    input.addEventListener("change", async () => {
      if (!input.checked) return;
      await window.OA_OPTIONS_I18N?.setLocaleMode?.(input.value);
      await syncLocaleControls();
      await renderHistoryPanel();
      window.__oaRefreshOptionsSettings?.();
    });
  });

  document.querySelectorAll('input[name="launch-mode"]').forEach((input) => {
    input.addEventListener("change", async () => {
      if (!input.checked) return;
      await chrome.storage.local.set({ [STORAGE_LAUNCH_MODE]: input.value });
    });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[STORAGE_HISTORY]) void renderHistoryPanel();
    if (changes[STORAGE_THEME_MODE]) void applyOptionsTheme();
  });

  const promptEl = document.getElementById("prompt");
  const combineLatestBtnEl = document.getElementById("combine-latest");

  document.getElementById("combine-latest")?.addEventListener("click", () => void combineLatestIntoPrompt(promptEl, combineLatestBtnEl));

  document.getElementById("new-chat")?.addEventListener("click", () => void triggerNewChat());

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
  promptEl?.addEventListener("paste", (event) => {
    const files = event.clipboardData?.files;
    if (!files?.length) return;
    event.preventDefault();
    void handleIncomingFiles(files).catch(() => {
      setSendStatus(t("status_attachments_failed"));
    });
  });
  promptEl?.addEventListener("drop", (event) => {
    const files = event.dataTransfer?.files;
    if (!files?.length) return;
    event.preventDefault();
    void handleIncomingFiles(files).catch(() => {
      setSendStatus(t("status_attachments_failed"));
    });
  });
  promptEl?.addEventListener("dragover", (event) => {
    if (event.dataTransfer?.files?.length) event.preventDefault();
  });
  promptEl?.addEventListener("input", autoResizePrompt);

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const rightPanelHidden = document.getElementById("right-panel")?.classList.contains("hidden");
    const historyPanelHidden = document.getElementById("history-panel")?.classList.contains("hidden");
    if (!rightPanelHidden || !historyPanelHidden) {
      closePanels();
      return;
    }
    if (!embedMode) return;
    try {
      window.parent.postMessage({ type: "OA_EMBED_CLOSE", source: "oa-options-embed" }, "*");
    } catch (_e) {
      /* ignore */
    }
  });

  autoResizePrompt();
});

window.addEventListener("oa-options-locale-changed", async () => {
  await renderHistoryPanel();
  await syncThemeControls();
  await syncLocaleControls();
  await syncModeControls();
  window.__oaRefreshOptionsSettings?.();
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
