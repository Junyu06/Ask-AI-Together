"use strict";

const STORAGE_HISTORY = "oa_history";

const BUILTIN_SITES = [
  { id: "chatgpt", name: "ChatGPT", url: "https://chatgpt.com/" },
  { id: "deepseek", name: "DeepSeek", url: "https://chat.deepseek.com/" },
  { id: "kimi", name: "Kimi", url: "https://www.kimi.com/" },
  { id: "qwen", name: "Qwen", url: "https://chat.qwen.ai/" },
  { id: "doubao", name: "Doubao", url: "https://www.doubao.com/" },
  { id: "yuanbao", name: "Yuanbao", url: "https://yuanbao.tencent.com/" },
  { id: "grok", name: "Grok", url: "https://grok.com/" },
  { id: "claude", name: "Claude", url: "https://claude.ai/" },
  { id: "gemini", name: "Gemini", url: "https://gemini.google.com/" }
];

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

async function allSites() {
  const data = await chrome.storage.local.get(["oa_custom_sites"]);
  const custom = Array.isArray(data.oa_custom_sites) ? data.oa_custom_sites : [];
  return [...BUILTIN_SITES, ...custom];
}

function formatTime(ts) {
  const date = new Date(ts);
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(date);
}

async function loadHistory() {
  const data = await chrome.storage.local.get([STORAGE_HISTORY]);
  return Array.isArray(data[STORAGE_HISTORY]) ? data[STORAGE_HISTORY] : [];
}

function buildHistoryLinks(item, nameById) {
  const urls = item.urls && typeof item.urls === "object" ? item.urls : {};
  const parts = [];
  for (const [siteId, url] of Object.entries(urls)) {
    if (typeof url !== "string" || !/^https?:\/\//i.test(url)) continue;
    parts.push({ siteId, url });
  }
  if (!parts.length) return "";
  return `<div class="history-links">${parts
    .map(({ siteId, url }) => {
      const label = nameById.get(siteId) || siteId;
      return `<a class="history-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
    })
    .join("")}</div>`;
}

async function deleteHistoryById(entryId) {
  const id = String(entryId || "");
  if (!id) return;
  const history = await loadHistory();
  const next = history.filter((item) => String(item?.id || "") !== id);
  if (next.length === history.length) return;
  await chrome.storage.local.set({ [STORAGE_HISTORY]: next.slice(0, 200) });
  await renderHistory();
}

async function renderHistory() {
  const history = await loadHistory();
  const sites = await allSites();
  const nameById = new Map(sites.map((s) => [s.id, s.name]));
  const listEl = document.getElementById("history-list");
  if (!listEl) return;
  listEl.innerHTML = "";

  if (!history.length) {
    const empty = document.createElement("li");
    empty.className = "history-item";
    empty.innerHTML = `<div class="meta">暂无历史记录。</div>`;
    listEl.appendChild(empty);
    return;
  }

  for (const item of history) {
    const box = document.createElement("li");
    box.className = "history-item";
    const prompt = escapeHtml(item.prompt || "");
    const aiTag = item.aiSummary ? `<span class="history-ai-tag">(AI 摘要)</span>` : "";
    const meta = `${formatTime(item.ts)} | ${escapeHtml((item.sites || []).join(", "))}`;
    box.innerHTML = `
      <div class="history-item-head">
        <div class="prompt">${prompt}${aiTag}</div>
        <button type="button" class="site-action site-delete history-delete" data-history-id="${escapeHtml(String(item.id || ""))}" aria-label="删除" title="删除">
          <svg class="icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="meta">${meta}</div>
      <div class="history-item-actions">
        <button type="button" class="btn btn-primary history-restore-btn" data-history-id="${escapeHtml(String(item.id || ""))}">恢复到已绑定窗口</button>
      </div>
      ${buildHistoryLinks(item, nameById)}
    `;
    box.querySelector(".history-delete")?.addEventListener("click", (event) => {
      event.stopPropagation();
      void deleteHistoryById(item.id);
    });
    box.querySelector(".history-restore-btn")?.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const urls = item.urls && typeof item.urls === "object" ? item.urls : {};
      const sites = await loadOrderedSelectedSitesPayload();
      const res = await chrome.runtime.sendMessage({
        type: "OA_BG_RESTORE_HISTORY_URLS",
        urls,
        sites
      });
      const st = document.getElementById("history-status");
      if (st) {
        st.textContent = res?.ok
          ? `已尝试导航 ${res.navigated ?? 0} 个已绑定标签页。`
          : `失败：${res?.error || "未知"}`;
      }
    });
    listEl.appendChild(box);
  }
}

document.getElementById("history-back").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("ui/controller/controller.html") });
});

document.getElementById("history-clear").addEventListener("click", async () => {
  await chrome.storage.local.set({ [STORAGE_HISTORY]: [] });
  await renderHistory();
});

document.getElementById("history-refresh").addEventListener("click", () => {
  void renderHistory();
});

void renderHistory();
