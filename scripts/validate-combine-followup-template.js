"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");

const repoRoot = path.resolve(__dirname, "..");
const extensionRoot = path.join(repoRoot, "Side-by-Side AI");

function read(relPath) {
  return fs.readFileSync(path.join(extensionRoot, relPath), "utf8");
}

const legacyAppSource = read("legacy/app.js");
const legacyHtmlSource = read("legacy/index.html");
const optionsJsSource = read("ui/options/options.js");
const optionsHtmlSource = read("ui/options/options.html");
const optionsI18nSource = read("assets/options-i18n.js");
const textFormatSource = read("shared/text-format.js");

for (const source of [legacyAppSource, optionsJsSource]) {
  assert.match(source, /oa_combine_followup_enabled/);
  assert.match(source, /oa_combine_followup_text/);
  assert.match(source, /combineFollowupFooterText/);
  assert.doesNotMatch(source, /if \(!combineFollowupEnabled\) return "";/);
  assert.match(source, /function combineFollowupFooterText\(existingPrompt = ""\) \{\s*if \(String\(existingPrompt \|\| ""\)\.trim\(\)\) return "";\s*return String\(combineFollowupText \|\| ""\)\.trim\(\);\s*\}/);
  assert.doesNotMatch(source, /footerText:\s*t\(["']combine_(?:latest_prompt_hint|footer)["']\)/);
  assert.doesNotMatch(source, /String\(existingPrompt \|\| ""\)\.trim\(\) \|\| t\(["']combine_(?:latest_prompt_hint|footer)["']\)/);
}

for (const source of [legacyHtmlSource, optionsHtmlSource]) {
  assert.match(source, /data-settings-tab="template"/);
  assert.match(source, /id="settings-tab-template"/);
  assert.match(source, /id="combine-followup-text"/);
  assert.match(source, /id="save-combine-followup"/);
}

for (const source of [legacyAppSource, optionsI18nSource]) {
  assert.match(source, /template_tab:\s*"(?:模板|Template)"/);
  assert.match(source, /combine_template_placeholder:\s*"[^"]+"/);
  assert.match(source, /combine_template_saved:\s*"[^"]+"/);
}

assert.match(textFormatSource, /return body \+ separator \+ footer;/);

const context = { globalThis: {} };
context.globalThis = context;
vm.createContext(context);
vm.runInContext(textFormatSource, context, { filename: "text-format.js" });

const buildCombinedLatestPrompt = context.AskAiTogetherTextFormat.buildCombinedLatestPrompt;
const sections = [{ siteName: "ChatGPT", text: "Answer" }];

assert.equal(
  buildCombinedLatestPrompt(sections, "", { unavailableText: "[Unavailable]", footerText: "" }),
  "[ChatGPT]\nAnswer\n\n---------\n\n"
);
assert.equal(
  buildCombinedLatestPrompt(sections, "", { unavailableText: "[Unavailable]", footerText: "Compare these answers" }),
  "[ChatGPT]\nAnswer\n\n---------\n\nCompare these answers"
);
assert.equal(
  buildCombinedLatestPrompt(sections, "Explain the diff", { unavailableText: "[Unavailable]", footerText: "Compare these answers" }),
  "[ChatGPT]\nAnswer\n\n---------\n\nExplain the diff"
);
assert.equal(
  buildCombinedLatestPrompt(sections, "", { unavailableText: "[Unavailable]" }),
  "[ChatGPT]\nAnswer\n\n---------\n\n"
);

console.log("combine follow-up template validation passed");
