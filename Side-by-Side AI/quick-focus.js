"use strict";

const QF_SITE_LABELS = {
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

function qfEscapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * @param {string} containerId
 */
async function renderQuickFocus(containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;

  let res;
  try {
    res = await chrome.runtime.sendMessage({ type: "OA_BG_GET_STATE" });
  } catch (_e) {
    el.innerHTML = "<p class=\"qf-hint\">无法连接扩展后台，请重试。</p>";
    return;
  }

  const targets = res?.targets || {};
  const ids = Object.keys(targets);
  if (!ids.length) {
    el.innerHTML =
      "<p class=\"qf-hint\">暂无已绑定的 AI 窗口。请先在「多窗口控制器」里打开站点。</p>";
    return;
  }

  el.innerHTML = ids
    .map((id) => {
      const name = QF_SITE_LABELS[id] || id;
      const safeId = qfEscapeHtml(id);
      const safeName = qfEscapeHtml(name);
      return `<button type="button" class="qf-btn" data-site-id="${safeId}">聚焦 ${safeName}</button>`;
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
    });
  });
}
