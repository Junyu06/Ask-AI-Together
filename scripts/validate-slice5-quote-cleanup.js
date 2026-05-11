"use strict";

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const repoRoot = path.resolve(__dirname, "..");
const extensionRoot = path.join(repoRoot, "Side-by-Side AI");
const manifestPath = path.join(extensionRoot, "manifest.json");
const legacyContentPath = path.join(extensionRoot, "legacy", "content.js");
const compatibilityQuotePath = path.join(extensionRoot, "content", "content-quote-ui.js");
const quoteHelperPath = path.join(extensionRoot, "shared", "quote-helper.js");

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const legacySource = fs.readFileSync(legacyContentPath, "utf8");
const compatibilityQuoteSource = fs.readFileSync(compatibilityQuotePath, "utf8");
const quoteHelperSource = fs.readFileSync(quoteHelperPath, "utf8");

function indexOfScript(scripts, scriptPath) {
  const index = scripts.indexOf(scriptPath);
  assert.notEqual(index, -1, `expected manifest content script list to include ${scriptPath}`);
  return index;
}

const allUrlGroups = manifest.content_scripts.filter((entry) => {
  return Array.isArray(entry.matches) && entry.matches.includes("<all_urls>");
});
assert.equal(allUrlGroups.length, 1, "expected one all_urls content script group to avoid duplicate runtime injection");

const scripts = allUrlGroups[0].js;
assert.ok(Array.isArray(scripts), "all_urls content script group must list js files");

const runtimeIndex = indexOfScript(scripts, "shared/runtime-contract.js");
const providerIndex = indexOfScript(scripts, "shared/provider-catalog.js");
const quoteHelperIndex = indexOfScript(scripts, "shared/quote-helper.js");
const sitesIndex = indexOfScript(scripts, "content/content-sites.js");
const domIndex = indexOfScript(scripts, "content/content-dom.js");
const responseIndex = indexOfScript(scripts, "content/content-response.js");
const inputIndex = indexOfScript(scripts, "content/content-input.js");
const attachmentsIndex = indexOfScript(scripts, "content/content-attachments.js");
const sendIndex = indexOfScript(scripts, "content/content-send-runtime.js");
const sharedRuntimeIndex = indexOfScript(scripts, "content/content-shared-runtime.js");
const legacyIndex = indexOfScript(scripts, "legacy/content.js");
const compatibilityQuoteIndex = indexOfScript(scripts, "content/content-quote-ui.js");

assert.ok(runtimeIndex < providerIndex, "runtime contract must load before provider catalog");
assert.ok(providerIndex < quoteHelperIndex, "provider catalog must load before shared quote helper");
assert.ok(quoteHelperIndex < sitesIndex, "shared quote helper must load before mode quote adapters");
assert.ok(sitesIndex < domIndex, "content sites must load before DOM helpers");
assert.ok(domIndex < responseIndex, "DOM helpers must load before response extraction");
assert.ok(responseIndex < inputIndex, "response extraction must load before send snapshots");
assert.ok(inputIndex < attachmentsIndex, "input helpers must load before attachments");
assert.ok(attachmentsIndex < sendIndex, "attachments must load before send runtime");
assert.ok(sendIndex < sharedRuntimeIndex, "send runtime must load before shared content transport");
assert.ok(sharedRuntimeIndex < legacyIndex, "shared content transport must load before Legacy adapter");
assert.ok(legacyIndex < compatibilityQuoteIndex, "Legacy adapter and Compatibility quote adapter must stay separate");

assert.doesNotMatch(
  legacySource,
  /function\s+(setInputValue|extractLatestResponseText|collectReplyNodes|sendPrompt|newChat)\s*\(/,
  "legacy content must not redeclare shared input/response/send/new-chat functions"
);
assert.match(legacySource, /getTransport\?\.\("legacy-content"\)/);
assert.match(legacySource, /transport\.sendPrompt\(/);
assert.match(legacySource, /transport\.collectLatest\(/);
assert.match(legacySource, /transport\.newChat\(/);

assert.match(quoteHelperSource, /createController/);
assert.match(legacySource, /type:\s*"QUOTE_TEXT"/);
assert.match(legacySource, /postToExtensionParent\(/);
assert.match(compatibilityQuoteSource, /type:\s*"OA_QUOTE_TEXT"/);
assert.match(compatibilityQuoteSource, /notifyExtension\(\{\s*type:\s*"OA_QUOTE_TEXT"/);

assert.match(legacySource, /data\.type === "ATTACH_FILES"/);
assert.match(legacySource, /attachFiles\(inputEl/);
assert.match(compatibilityQuoteSource, /capability-unsupported/);
assert.match(compatibilityQuoteSource, /attachmentMode:\s*"unsupported"/);
assert.doesNotMatch(compatibilityQuoteSource, /attachmentMode:\s*"legacy-only"/);

const sharedRuntimeSource = fs.readFileSync(path.join(extensionRoot, "content", "content-shared-runtime.js"), "utf8");
assert.doesNotMatch(sharedRuntimeSource, /restoreHistory/);

console.log("slice 5 quote cleanup validation passed");
