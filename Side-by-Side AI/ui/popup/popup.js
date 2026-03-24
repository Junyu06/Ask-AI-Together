"use strict";

const SWITCHER_PAGE = "ui/switcher/switcher.html";

function switcherTabUrlBase() {
  return chrome.runtime.getURL(SWITCHER_PAGE);
}

function isSwitcherTabUrl(url) {
  const base = switcherTabUrlBase();
  return typeof url === "string" && (url === base || url.startsWith(`${base}?`));
}

async function findSwitcherWindowId() {
  try {
    const windows = await chrome.windows.getAll({ populate: true });
    for (const w of windows) {
      for (const tab of w.tabs || []) {
        if (isSwitcherTabUrl(tab.url)) return w.id;
      }
    }
  } catch (_e) {
    /* ignore */
  }
  return null;
}

async function applySwitcherAlwaysOnTop(enabled) {
  const id = await findSwitcherWindowId();
  if (id == null) return;
  const delays = [0, 25, 70, 140];
  for (const ms of delays) {
    if (ms) await new Promise((r) => setTimeout(r, ms));
    try {
      await chrome.windows.update(id, { alwaysOnTop: enabled, focused: true });
    } catch (_e) {
      /* ignore */
    }
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  void renderQuickFocus("popup-targets");

  const data = await chrome.storage.local.get(["oa_switcher_always_on_top", "oa_page_embed_switcher_enabled"]);
  const pinEl = document.getElementById("switcher-keep-on-top");
  const embedEl = document.getElementById("page-embed-switcher");
  if (embedEl) {
    embedEl.checked = data.oa_page_embed_switcher_enabled !== false;
    embedEl.addEventListener("change", async () => {
      await chrome.storage.local.set({ oa_page_embed_switcher_enabled: embedEl.checked });
    });
  }
  if (pinEl) {
    pinEl.checked = Boolean(data.oa_switcher_always_on_top);
    pinEl.addEventListener("change", async () => {
      const v = pinEl.checked;
      await chrome.storage.local.set({ oa_switcher_always_on_top: v });
      await applySwitcherAlwaysOnTop(v);
    });
  }

  document.getElementById("open-controller").addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "OA_BG_OPEN_CONTROLLER" });
    window.close();
  });

  document.getElementById("open-switcher").addEventListener("click", async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id != null) {
        const res = await chrome.tabs.sendMessage(tab.id, { type: "OA_PAGE_EMBED_OPEN_SWITCHER" });
        if (res?.ok) {
          window.close();
          return;
        }
      }
    } catch (_e) {
      /* 非网页标签页或未注入 content script 时走下方回退 */
    }

    const wantTop = pinEl ? pinEl.checked : Boolean(data.oa_switcher_always_on_top);
    if (wantTop && documentPictureInPicture?.requestWindow) {
      try {
        await openSwitcherAsDocumentPictureInPicture();
        window.close();
        return;
      } catch (_e) {
        /* fall through：走 chrome.windows */
      }
    }
    chrome.runtime.sendMessage({ type: "OA_BG_OPEN_SWITCHER" });
    window.close();
  });
});
