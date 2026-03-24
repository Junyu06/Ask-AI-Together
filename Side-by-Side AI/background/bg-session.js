"use strict";

async function loadTargets() {
  if (targetsCache) return targetsCache;
  const data = await chrome.storage.session.get(STORAGE_WINDOW_TARGETS);
  const raw = data[STORAGE_WINDOW_TARGETS];
  targetsCache = raw && typeof raw === "object" ? { ...raw } : {};
  return targetsCache;
}

async function saveTargets(targets) {
  targetsCache = targets;
  await chrome.storage.session.set({ [STORAGE_WINDOW_TARGETS]: targets });
}

/** minimal = Chrome `popup` window (no tab strip); normal = full browser window */
async function getWindowPrefs() {
  const data = await chrome.storage.local.get(["oa_window_chrome_mode"]);
  const minimal = data.oa_window_chrome_mode !== "normal";
  return {
    type: minimal ? "popup" : "normal",
    width: minimal ? 1180 : 1280,
    height: minimal ? 840 : 800
  };
}
