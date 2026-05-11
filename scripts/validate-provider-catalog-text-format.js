"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");

const repoRoot = path.resolve(__dirname, "..");
const extensionRoot = path.join(repoRoot, "Side-by-Side AI");
const catalogPath = path.join(extensionRoot, "shared", "provider-catalog.js");
const textFormatPath = path.join(extensionRoot, "shared", "text-format.js");
const manifestPath = path.join(extensionRoot, "manifest.json");

function read(relPath) {
  return fs.readFileSync(path.join(extensionRoot, relPath), "utf8");
}

function loadShared() {
  const context = vm.createContext({
    console,
    URL,
    globalThis: {}
  });
  context.globalThis = context;
  vm.runInContext(fs.readFileSync(catalogPath, "utf8"), context, { filename: catalogPath });
  vm.runInContext(fs.readFileSync(textFormatPath, "utf8"), context, { filename: textFormatPath });
  return context;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertInOrder(source, labels, description) {
  let lastIndex = -1;
  for (const label of labels) {
    const index = source.indexOf(label);
    assert.ok(index >= 0, `${description} missing ${label}`);
    assert.ok(index > lastIndex, `${description} should load ${label} in order`);
    lastIndex = index;
  }
}

const context = loadShared();
const catalog = context.AskAiTogetherProviderCatalog;
const textFormat = context.AskAiTogetherTextFormat;
assert.ok(catalog, "provider catalog should load");
assert.ok(textFormat, "text formatter should load");

const providers = catalog.getBuiltInProviders({ mode: "compatibility" });
assert.deepEqual(
  plain(providers.map((provider) => provider.id)),
  ["chatgpt", "deepseek", "kimi", "qwen", "doubao", "yuanbao", "grok", "claude", "gemini", "perplexity"]
);
assert.equal(catalog.getProviderById("chatgpt", { mode: "legacy" }).capabilities.supportsAttachments, true);
assert.equal(catalog.getProviderById("chatgpt", { mode: "compatibility" }).capabilities.supportsAttachments, false);
assert.deepEqual(
  plain(catalog.getBuiltInSiteEntries().map((site) => site.id)),
  plain(providers.map((provider) => provider.id)),
  "extension UI site list should derive from catalog order"
);
assert.equal(
  catalog.matchProviderForLocation({ hostname: "chatgpt.com" }, { mode: "compatibility" }).id,
  "chatgpt",
  "provider catalog should match exact host"
);
assert.equal(
  catalog.matchProviderForLocation({ hostname: "www.chatgpt.com" }, { mode: "compatibility" }).id,
  "chatgpt",
  "provider catalog should match subdomain suffix"
);
assert.equal(
  catalog.matchProviderForLocation({ hostname: "evilchatgpt.com" }, { mode: "compatibility" }),
  null,
  "provider catalog must not match host substrings"
);
assert.equal(
  catalog.matchProviderForLocation({ hostname: "notchat.deepseek.com" }, { mode: "compatibility" }),
  null,
  "provider catalog must not match sibling hosts"
);
assert.equal(
  catalog.matchProviderForLocation({ hostname: "chat.deepseek.com.evil.test" }, { mode: "compatibility" }),
  null,
  "provider catalog must not match suffixes after the provider host"
);

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
for (const pattern of catalog.getManifestHostPatterns()) {
  assert.ok(manifest.host_permissions.includes(pattern), `manifest host_permissions missing ${pattern}`);
}
const webAccessibleResources = manifest.web_accessible_resources.flatMap((entry) => entry.resources || []);
assert.ok(
  webAccessibleResources.includes("shared/history-service.js"),
  "history service should be web accessible for extension pages"
);

const legacyContentScript = manifest.content_scripts.find((entry) => entry.js.includes("legacy/content.js"));
const compatibilityContentScript = manifest.content_scripts.find((entry) => entry.js.includes("content/content-sites.js"));
assert.ok(legacyContentScript, "legacy content script should be present");
assert.ok(compatibilityContentScript, "compatibility content script should be present");
assert.ok(
  legacyContentScript.js.indexOf("shared/provider-catalog.js") < legacyContentScript.js.indexOf("legacy/content.js"),
  "provider catalog should load before legacy content"
);
assert.ok(
  compatibilityContentScript.js.indexOf("shared/provider-catalog.js") < compatibilityContentScript.js.indexOf("content/content-sites.js"),
  "provider catalog should load before compatibility sites"
);

assertInOrder(read("background/background.js"), [
  "../shared/runtime-contract.js",
  "../shared/provider-catalog.js",
  "../shared/history-service.js",
  "bg-constants.js"
], "background importScripts");
assertInOrder(read("legacy/index.html"), [
  "../shared/runtime-contract.js",
  "../shared/provider-catalog.js",
  "../shared/text-format.js",
  "../shared/history-service.js",
  "app.js"
], "legacy index scripts");
assertInOrder(read("ui/options/options.html"), [
  "../../shared/runtime-contract.js",
  "../../shared/provider-catalog.js",
  "../../shared/text-format.js",
  "../../shared/history-service.js",
  "../../assets/options-i18n.js",
  "../../assets/quick-focus.js",
  "../../assets/options-settings.js",
  "options.js"
], "options page scripts");

const filesThatShouldConsumeCatalog = [
  "legacy/content.js",
  "content/content-sites.js",
  "background/bg-constants.js",
  "legacy/app.js",
  "assets/options-settings.js",
  "assets/quick-focus.js"
];
for (const relPath of filesThatShouldConsumeCatalog) {
  const source = read(relPath);
  assert.ok(source.includes("AskAiTogetherProviderCatalog"), `${relPath} should consume the shared provider catalog`);
}
for (const relPath of ["legacy/content.js", "content/content-sites.js"]) {
  const source = read(relPath);
  assert.ok(
    source.includes("matchProviderForLocation"),
    `${relPath} currentSite should route through the shared provider matcher`
  );
  assert.ok(!source.includes("host.includes(h)"), `${relPath} must not use substring host matching`);
}
assert.ok(
  !fs.readFileSync(catalogPath, "utf8").includes("cleanHost.indexOf"),
  "provider catalog must not use substring host matching"
);

const legacyPrompt = textFormat.buildCombinedLatestPrompt(
  [
    { siteName: "ChatGPT", text: " Line 1\r\n\r\n\r\nLine 2 " },
    { siteName: "Claude", text: "", status: "extraction-timeout", reason: "timeout" }
  ],
  "",
  {
    unavailableText: "[Unavailable]",
    footerText: "Write your request here"
  }
);
assert.equal(
  legacyPrompt,
  "[ChatGPT]\nLine 1\n\nLine 2\n\n---------\n\n[Claude]\n[Unavailable] (extraction-timeout: timeout)\n\n---------\n\nWrite your request here"
);

const compatibilityPrompt = textFormat.buildCombinedLatestPrompt(
  [{ siteName: "Grok", text: "", status: "transport-failed", reason: "tab-unreachable" }],
  "Summarize",
  {
    unavailableText: "Unavailable",
    footerText: "Combine"
  }
);
assert.equal(
  compatibilityPrompt,
  "[Grok]\nUnavailable (transport-failed: tab-unreachable)\n\n---------\n\nSummarize"
);
assert.equal(
  textFormat.buildCombinedLatestPrompt([], "Existing prompt", { footerText: "Write your request here" }),
  "Existing prompt",
  "empty sections should preserve an existing prompt without a leading separator"
);
assert.equal(
  textFormat.buildCombinedLatestPrompt([], "", { footerText: "Write your request here" }),
  "Write your request here",
  "empty sections should use footer text without a leading separator"
);
assert.equal(
  textFormat.buildCombinedLatestPrompt(null, "", { footerText: "Write your request here" }),
  "Write your request here",
  "missing sections should be treated as empty sections"
);

console.log("provider catalog and text format validation passed");
