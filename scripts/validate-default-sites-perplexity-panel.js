"use strict";

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const repoRoot = path.resolve(__dirname, "..");
const extensionRoot = path.join(repoRoot, "Side-by-Side AI");

function read(relPath) {
  return fs.readFileSync(path.join(extensionRoot, relPath), "utf8");
}

const providerCatalogSource = read("shared/provider-catalog.js");
const optionsSettingsSource = read("assets/options-settings.js");
const quickFocusSource = read("assets/quick-focus.js");
const bgSwitcherSource = read("background/bg-switcher.js");
const legacyAppSource = read("legacy/app.js");
const optionsI18nSource = read("assets/options-i18n.js");
const legacyHtmlSource = read("legacy/index.html");
const optionsHtmlSource = read("ui/options/options.html");
const embedSource = read("embed/page-embed-options.js");
const featureDocSource = read("feature.md");

const defaultIds = "[\"chatgpt\", \"claude\", \"gemini\"]";
assert.ok(providerCatalogSource.includes(`DEFAULT_BUILTIN_SITE_IDS = ${defaultIds}`));
for (const source of [optionsSettingsSource, quickFocusSource, bgSwitcherSource, legacyAppSource]) {
  assert.ok(source.includes(defaultIds), "fallback defaults should use ChatGPT, Claude, Gemini");
  assert.ok(!source.includes("[\"chatgpt\", \"deepseek\", \"kimi\"]"), "old fallback defaults should not remain");
}

const zhModeHint = "先使用默认模式。Perplexity 默认模式用不了，需要兼容模式。其他 AI 网站如果打不开、空白或不能正常使用，也切换到兼容模式。";
const enModeHint = "Use Default mode first. Perplexity does not work in Default mode, so use Compatibility mode for it. If another AI site does not open, stays blank, or does not work correctly, switch to Compatibility mode too.";
for (const source of [legacyAppSource, optionsI18nSource]) {
  assert.ok(source.includes(`mode_hint: "${zhModeHint}"`), "Chinese mode_hint should say Perplexity does not work in Default mode");
  assert.ok(source.includes(`mode_hint: "${enModeHint}"`), "English mode_hint should say Perplexity does not work in Default mode");
}
for (const source of [legacyHtmlSource, optionsHtmlSource]) {
  assert.ok(source.includes(zhModeHint), "static HTML fallback mode_hint should say Perplexity does not work in Default mode");
}

assert.ok(featureDocSource.includes("默认选中：`chatgpt`、`claude`、`gemini`。"));
assert.ok(featureDocSource.includes("- Perplexity"));

assert.match(embedSource, /#oa-embed-root\.oa-open\.oa-embed-root--history,\s*#oa-embed-root\.oa-open\.oa-embed-root--settings/);
assert.match(embedSource, /right:\s*12px !important;/);
assert.match(embedSource, /left:\s*auto !important;/);
assert.match(embedSource, /bottom:\s*12px !important;/);
assert.match(embedSource, /transform:\s*none !important;/);
assert.match(embedSource, /width:\s*min\(720px, 50vw\) !important;/);
assert.match(embedSource, /max-width:\s*calc\(100vw - 24px\) !important;/);
assert.match(embedSource, /height:\s*calc\(100vh - 24px\) !important;/);
assert.match(embedSource, /@media \(max-width:\s*900px\)/);
assert.match(embedSource, /width:\s*auto !important;/);

console.log("default sites, Perplexity copy, and embed panel validation passed");
