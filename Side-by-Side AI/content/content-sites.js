"use strict";

const providerCatalog = globalThis.AskAiTogetherProviderCatalog;
const SITES = providerCatalog?.getBuiltInProviders?.({ mode: "compatibility-content" }) || [];
const RESPONSE_SELECTORS = providerCatalog?.getResponseSelectorsMap?.() || {};

function currentSite() {
  return providerCatalog?.matchProviderForLocation?.(location, { mode: "compatibility-content" }) || null;
}

const GENERIC_SITE = providerCatalog?.genericSite || {
  id: "generic",
  inputSelectors: ["textarea", 'div[contenteditable="true"]', "input[type='text']"],
  sendSelectors: ['button[type="submit"]', "button.send", "button[aria-label*='Send']"],
  newChatSelectors: []
};
