"use strict";

const SITE_LABELS = {
  chatgpt: "ChatGPT",
  deepseek: "DeepSeek",
  kimi: "Kimi",
  qwen: "Qwen",
  doubao: "Doubao",
  yuanbao: "Yuanbao",
  grok: "Grok",
  claude: "Claude",
  gemini: "Gemini"
};

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

async function renderQuickFocus() {
  const el = document.getElementById("popup-targets");
  if (!el) return;

  let res;
  try {
    res = await chrome.runtime.sendMessage({ type: "OA_BG_GET_STATE" });
  } catch (_e) {
    el.innerHTML = "<p class=\"popup-hint\">无法连接扩展后台，请重试。</p>";
    return;
  }

  const targets = res?.targets || {};
  const ids = Object.keys(targets);
  if (!ids.length) {
    el.innerHTML =
      "<p class=\"popup-hint\">暂无已绑定的 AI 窗口。请先在「多窗口控制器」里勾选站点并点「打开 / 复用窗口」。</p>";
    return;
  }

  el.innerHTML = ids
    .map((id) => {
      const name = SITE_LABELS[id] || id;
      const safeId = escapeHtml(id);
      const safeName = escapeHtml(name);
      return `<button type="button" class="popup-mini-btn" data-site-id="${safeId}">聚焦 ${safeName}</button>`;
    })
    .join("");

  el.querySelectorAll("button[data-site-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const siteId = btn.getAttribute("data-site-id");
      if (!siteId) return;
      try {
        await chrome.runtime.sendMessage({ type: "OA_BG_FOCUS", siteId });
      } catch (_e) {
        /* ignore */
      }
      window.close();
    });
  });
}

document.getElementById("open-split").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "OA_BG_OPEN_MAIN" });
  window.close();
});

document.getElementById("open-controller").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "OA_BG_OPEN_CONTROLLER" });
  window.close();
});

document.addEventListener("DOMContentLoaded", () => {
  void renderQuickFocus();
});
