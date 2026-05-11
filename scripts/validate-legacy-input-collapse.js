"use strict";

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const repoRoot = path.resolve(__dirname, "..");
const extensionRoot = path.join(repoRoot, "Side-by-Side AI");

function read(relPath) {
  return fs.readFileSync(path.join(extensionRoot, relPath), "utf8");
}

const legacyHtmlSource = read("legacy/index.html");
const legacyAppSource = read("legacy/app.js");
const legacyCssSource = read("legacy/styles.css");
const sharedCssSource = read("assets/styles.css");

const toggleIndex = legacyHtmlSource.indexOf('id="input-bubble-toggle"');
const settingsIndex = legacyHtmlSource.indexOf('id="site-settings-btn"');
assert.ok(toggleIndex > -1, "legacy input bubble toggle button is missing");
assert.ok(settingsIndex > -1, "legacy settings button is missing");
assert.ok(toggleIndex < settingsIndex, "input bubble toggle should sit to the left of settings");

assert.match(legacyHtmlSource, /class="icon input-bubble-toggle-minimize"/);
assert.match(legacyHtmlSource, /class="icon input-bubble-toggle-restore hidden"/);
assert.match(legacyHtmlSource, /data-i18n-aria-label="minimize_input"/);

assert.match(legacyAppSource, /let inputBubbleCollapsed = false;/);
assert.match(legacyAppSource, /function setInputBubbleCollapsed\(collapsed\)/);
assert.match(legacyAppSource, /function preserveInputBubbleTogglePosition\(previousToggleRect\)/);
assert.match(legacyAppSource, /const previousToggleRect = inputBubbleToggleEl\?\.getBoundingClientRect\(\);/);
assert.match(legacyAppSource, /inputBubbleEl\?\.classList\.toggle\("is-collapsed", inputBubbleCollapsed\)/);
assert.match(legacyAppSource, /preserveInputBubbleTogglePosition\(previousToggleRect\)/);
assert.match(legacyAppSource, /inputBubbleEl\.style\.transform = "none";/);
assert.match(legacyAppSource, /inputBubbleToggleEl\?\.addEventListener\("click"/);
assert.match(legacyAppSource, /input-bubble-toggle-minimize/);
assert.match(legacyAppSource, /input-bubble-toggle-restore/);
assert.match(legacyAppSource, /minimize_input:\s*"(?:收起输入框|Collapse input)"/);
assert.match(legacyAppSource, /restore_input:\s*"(?:恢复输入框|Restore input)"/);

for (const source of [legacyCssSource, sharedCssSource]) {
  assert.match(source, /\.bubble-input\.is-collapsed\s*\{/);
  assert.match(source, /\.bubble-input\.is-collapsed \.input-row/);
  assert.match(source, /\.bubble-input\.is-collapsed \.left-actions > :not\(#input-bubble-toggle\)/);
  assert.match(source, /\.bubble-input\.is-collapsed \.prompt-wrap/);
  assert.match(source, /body\.pane-focus-mode \.bubble-input\.is-collapsed \.left-actions/);
}

console.log("legacy input collapse validation passed");
