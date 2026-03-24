"use strict";

function openControllerPage() {
  chrome.tabs.create({ url: chrome.runtime.getURL(CONTROLLER_PAGE) });
}

async function openSwitcherWindow() {
  const data = await chrome.storage.local.get(["oa_switcher_always_on_top"]);
  const alwaysOnTop = Boolean(data.oa_switcher_always_on_top);
  const opts = {
    url: chrome.runtime.getURL(SWITCHER_PAGE),
    type: "popup",
    width: 980,
    height: 280,
    focused: true
  };
  if (alwaysOnTop) {
    opts.alwaysOnTop = true;
  }
  let created;
  try {
    created = await chrome.windows.create(opts);
  } catch (_e) {
    delete opts.alwaysOnTop;
    created = await chrome.windows.create(opts);
  }
  if (alwaysOnTop && created?.id != null) {
    void forceSwitcherWindowOnTop(created.id, true);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isSwitcherTabUrl(url) {
  const base = chrome.runtime.getURL(SWITCHER_PAGE);
  return typeof url === "string" && (url === base || url.startsWith(`${base}?`));
}

/**
 * chrome.windows 的 alwaysOnTop 在部分系统上需多次 update 才生效；create 里单独传也可能被忽略。
 */
async function forceSwitcherWindowOnTop(windowId, enabled) {
  if (windowId == null) return;
  const delays = [0, 30, 60, 120, 200, 300];
  for (const ms of delays) {
    if (ms) await delay(ms);
    try {
      await chrome.windows.update(windowId, { alwaysOnTop: enabled, focused: true });
    } catch (_e) {
      /* ignore */
    }
  }
}

/** 常驻切换小窗（若已打开） */
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

/**
 * 依次短暂聚焦每个已打开的 AI 窗口，最后再聚焦切换小窗（若存在），便于用户看清布局。
 * 若无切换小窗，则保持聚焦在最后一个 AI 窗口。
 */
async function focusOpenedTargetsThenSwitcher(siteIdsOrdered) {
  const targets = await loadTargets();
  const ids = Array.isArray(siteIdsOrdered) ? siteIdsOrdered : [];
  const FOCUS_MS = 110;
  let lastWin = null;
  for (const siteId of ids) {
    const rec = targets[siteId];
    if (!rec?.windowId) continue;
    try {
      await chrome.windows.update(rec.windowId, { focused: true });
      lastWin = rec.windowId;
      await delay(FOCUS_MS);
    } catch (_e) {
      /* ignore */
    }
  }
  const swId = await findSwitcherWindowId();
  if (swId != null) {
    try {
      await chrome.windows.update(swId, { focused: true });
    } catch (_e) {
      /* ignore */
    }
  } else if (lastWin != null) {
    try {
      await chrome.windows.update(lastWin, { focused: true });
    } catch (_e) {
      /* ignore */
    }
  }
}
