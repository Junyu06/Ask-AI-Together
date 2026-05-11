"use strict";

const OPTIONS_PAGE = "ui/options/options.html";

const STALE_EXTENSION_UI_PATHS = ["ui/switcher/switcher.html", "ui/popup/popup.html"];

function isStaleExtensionUiUrl(url) {
  if (typeof url !== "string" || !url.startsWith("chrome-extension://")) return false;
  return STALE_EXTENSION_UI_PATHS.some((path) => {
    const full = chrome.runtime.getURL(path);
    return url === full || url.startsWith(`${full}?`);
  });
}

const STORAGE_WINDOW_TARGETS = "oa_window_targets_v1";

/** @type {Record<string, { siteId: string, windowId: number, tabId: number, transport: string }>} */
let targetsCache = null;

const providerCatalog = globalThis.AskAiTogetherProviderCatalog;
const BUILTIN_SITE_URLS = providerCatalog?.getHomeUrlMap?.() || {};
const BUILTIN_SITE_NEW_CHAT_URLS = providerCatalog?.getNewChatUrlMap?.() || BUILTIN_SITE_URLS;
const SITE_DISPLAY_NAMES = providerCatalog?.getDisplayNameMap?.() || {};
const SITE_HOSTS = providerCatalog?.getHostMap?.() || {};
