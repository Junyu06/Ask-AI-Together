"use strict";

function broadcastToExtensionPages(message) {
  chrome.runtime.sendMessage(message).catch(() => {});
}

function tileRectsHorizontal(n, work) {
  const { left, top, width, height } = work;
  const nClamped = Math.min(Math.max(n, 1), 4);
  const rects = [];
  const w = Math.floor(width / nClamped);
  for (let i = 0; i < nClamped; i++) {
    rects.push({
      left: left + i * w,
      top,
      width: i === nClamped - 1 ? width - i * w : w,
      height
    });
  }
  return rects;
}

function tileRectsVertical(n, work) {
  const { left, top, width, height } = work;
  const nClamped = Math.min(Math.max(n, 1), 4);
  const rects = [];
  const h = Math.floor(height / nClamped);
  for (let i = 0; i < nClamped; i++) {
    rects.push({
      left,
      top: top + i * h,
      width,
      height: i === nClamped - 1 ? height - i * h : h
    });
  }
  return rects;
}

/** Default layouts (former behavior): 3 = two top + one bottom; 4 = 2×2 */
function tileRectsAuto(n, work) {
  const { left, top, width, height } = work;
  const rects = [];
  const nClamped = Math.min(Math.max(n, 1), 4);
  if (nClamped === 1) {
    rects.push({ left, top, width, height });
  } else if (nClamped === 2) {
    const half = Math.floor(width / 2);
    rects.push({ left, top, width: half, height });
    rects.push({ left: left + half, top, width: width - half, height });
  } else if (nClamped === 3) {
    const halfW = Math.floor(width / 2);
    const halfH = Math.floor(height / 2);
    rects.push({ left, top, width: halfW, height: halfH });
    rects.push({ left: left + halfW, top, width: width - halfW, height: halfH });
    rects.push({ left, top: top + halfH, width, height: height - halfH });
  } else {
    const halfW = Math.floor(width / 2);
    const halfH = Math.floor(height / 2);
    rects.push({ left, top, width: halfW, height: halfH });
    rects.push({ left: left + halfW, top, width: width - halfW, height: halfH });
    rects.push({ left, top: top + halfH, width: halfW, height: height - halfH });
    rects.push({ left: left + halfW, top: top + halfH, width: width - halfW, height: height - halfH });
  }
  return rects;
}

function normalizeLayoutPreset(preset, n) {
  const p = preset || "auto";
  const nc = Math.min(Math.max(n, 1), 4);
  if (p === "two-top-one-bottom" && nc !== 3) return "auto";
  if (p === "one-left-two-right" && nc !== 3) return "auto";
  if (p === "grid-2x2" && nc !== 4) return "auto";
  return p;
}

/**
 * @param {string} [preset] auto | horizontal | vertical | two-top-one-bottom | one-left-two-right | grid-2x2
 */
function tileRects(n, work, preset) {
  const { left, top, width, height } = work;
  const nClamped = Math.min(Math.max(n, 1), 4);
  const p = normalizeLayoutPreset(preset, nClamped);

  if (p === "horizontal") {
    return tileRectsHorizontal(nClamped, work);
  }
  if (p === "vertical") {
    return tileRectsVertical(nClamped, work);
  }
  if (p === "two-top-one-bottom" && nClamped === 3) {
    const halfW = Math.floor(width / 2);
    const halfH = Math.floor(height / 2);
    return [
      { left, top, width: halfW, height: halfH },
      { left: left + halfW, top, width: width - halfW, height: halfH },
      { left, top: top + halfH, width, height: height - halfH }
    ];
  }
  if (p === "one-left-two-right" && nClamped === 3) {
    const halfW = Math.floor(width / 2);
    const halfH = Math.floor(height / 2);
    return [
      { left, top, width: halfW, height },
      { left: left + halfW, top, width: width - halfW, height: halfH },
      { left: left + halfW, top: top + halfH, width: width - halfW, height: height - halfH }
    ];
  }
  if (p === "grid-2x2" && nClamped === 4) {
    const halfW = Math.floor(width / 2);
    const halfH = Math.floor(height / 2);
    return [
      { left, top, width: halfW, height: halfH },
      { left: left + halfW, top, width: width - halfW, height: halfH },
      { left, top: top + halfH, width: halfW, height: height - halfH },
      { left: left + halfW, top: top + halfH, width: width - halfW, height: height - halfH }
    ];
  }
  return tileRectsAuto(nClamped, work);
}

async function ensureWindowForSite(siteId, url, targets, focusLast = false) {
  const u = String(url || "").trim() || BUILTIN_SITE_URLS[siteId];
  if (!u) throw new Error("missing-url");

  const existing = targets[siteId];
  if (existing?.windowId) {
    try {
      const w = await chrome.windows.get(existing.windowId, { populate: true });
      const tabId = w.tabs?.[0]?.id;
      if (tabId != null) {
        targets[siteId] = { siteId, windowId: w.id, tabId, transport: "window" };
        if (focusLast) {
          try {
            await chrome.windows.update(w.id, { focused: true });
          } catch (_e) {
            /* ignore */
          }
        }
        return targets[siteId];
      }
    } catch (_e) {
      delete targets[siteId];
    }
  }

  const found = await findTabForAiSite(siteId, u);
  if (found?.windowId != null && found.id != null) {
    targets[siteId] = { siteId, windowId: found.windowId, tabId: found.id, transport: "window" };
    if (focusLast) {
      try {
        await chrome.windows.update(found.windowId, { focused: true });
      } catch (_e) {
        /* ignore */
      }
    }
    return targets[siteId];
  }

  const prefs = await getWindowPrefs();
  const created = await chrome.windows.create({
    url: u,
    focused: focusLast,
    type: prefs.type,
    width: prefs.width,
    height: prefs.height
  });
  const tabId = created.tabs?.[0]?.id;
  if (tabId == null) throw new Error("no-tab");
  targets[siteId] = { siteId, windowId: created.id, tabId, transport: "window" };
  return targets[siteId];
}

/**
 * @param {Array<{ siteId: string, url?: string }>} sites
 * @param {{ skipFocusChain?: boolean }} [options] 为 true 时不做「依次聚焦各 AI 再聚焦切换器」（供工具栏一键打开后直接平铺）。
 */
async function openOrReuseWindows(sites, options) {
  const targets = await loadTargets();
  const list = Array.isArray(sites) ? sites : [];
  const entries = list.filter((e) => String(e?.siteId || ""));
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const siteId = String(entry?.siteId || "");
    const url = String(entry?.url || "").trim() || BUILTIN_SITE_URLS[siteId];
    await ensureWindowForSite(siteId, url, targets, false);
  }
  await saveTargets(targets);
  if (!options?.skipFocusChain) {
    await focusOpenedTargetsThenSwitcher(entries.map((e) => e.siteId));
  }
  return { ok: true, targets: { ...targets } };
}

function siteEntriesFromMessage(msg) {
  if (Array.isArray(msg.sites) && msg.sites.length) {
    return msg.sites;
  }
  const siteIds = Array.isArray(msg.siteIds) ? msg.siteIds : [];
  return siteIds.map((id) => ({ siteId: id, url: BUILTIN_SITE_URLS[id] || "" }));
}

async function applyTile(siteEntries, workArea, layoutPreset) {
  await syncTargetsFromTabsForSites(siteEntries);
  const siteIds = siteEntries.map((e) => e.siteId);
  await ensureSeparateWindowsForTargets(siteIds);
  const targets = await loadTargets();
  const ids = siteIds.filter((id) => targets[id]?.windowId);
  const n = ids.length;
  if (!n) return { ok: false, reason: "no-windows" };

  const work = workArea && Number(workArea.width) > 0 && Number(workArea.height) > 0
    ? {
        left: Math.round(Number(workArea.left) || 0),
        top: Math.round(Number(workArea.top) || 0),
        width: Math.round(Number(workArea.width)),
        height: Math.round(Number(workArea.height))
      }
    : {
        left: 0,
        top: 0,
        width: 1920,
        height: 1080
      };

  const rects = tileRects(Math.min(n, 4), work, layoutPreset || "auto");
  const count = Math.min(n, rects.length);
  let lastTiledWinId = null;
  for (let i = 0; i < count; i++) {
    const siteId = ids[i];
    const winId = targets[siteId].windowId;
    const r = rects[i];
    try {
      await chrome.windows.update(winId, {
        left: r.left,
        top: r.top,
        width: Math.max(320, r.width),
        height: Math.max(240, r.height),
        state: "normal"
      });
      lastTiledWinId = winId;
    } catch (_e) {
      delete targets[siteId];
    }
  }
  if (lastTiledWinId != null) {
    try {
      await chrome.windows.update(lastTiledWinId, { focused: true });
    } catch (_e) {
      /* ignore */
    }
  }
  await saveTargets(targets);
  return { ok: true, targets: { ...targets } };
}
