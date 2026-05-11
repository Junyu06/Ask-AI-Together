"use strict";

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const repoRoot = path.resolve(__dirname, "..");
const extensionRoot = path.join(repoRoot, "Side-by-Side AI");

function read(relPath) {
  return fs.readFileSync(path.join(extensionRoot, relPath), "utf8");
}

const legacyAppSource = read("legacy/app.js");
const optionsI18nSource = read("assets/options-i18n.js");
const legacyIndexSource = read("legacy/index.html");
const optionsHtmlSource = read("ui/options/options.html");

for (const source of [legacyAppSource, optionsI18nSource]) {
  assert.match(source, /mode_legacy:\s*"默认模式（分屏页）"/);
  assert.match(source, /mode_windows:\s*"兼容模式（多窗口平铺）"/);
  assert.match(source, /mode_hint:\s*"先使用默认模式；如果某个 AI 网站打不开、页面空白或不能正常使用，再切换到兼容模式。"/);
  assert.match(source, /mode_legacy:\s*"Default mode \(split page\)"/);
  assert.match(source, /mode_windows:\s*"Compatibility mode \(multi-window\)"/);
  assert.match(
    source,
    /mode_hint:\s*"Use Default mode first\. Switch to Compatibility mode if an AI site does not open, stays blank, or does not work correctly\."/
  );
  assert.doesNotMatch(source, /mode_legacy:\s*"[^"]*Legacy[^"]*"/);
  assert.doesNotMatch(source, /mode_windows:\s*"[^"]*(Windows|Compatible Mode)[^"]*"/);
}

for (const source of [legacyIndexSource, optionsHtmlSource]) {
  assert.ok(source.includes("默认模式（分屏页）"));
  assert.ok(source.includes("兼容模式（多窗口平铺）"));
  assert.ok(source.includes("先使用默认模式；如果某个 AI 网站打不开、页面空白或不能正常使用，再切换到兼容模式。"));
  assert.doesNotMatch(source, /分屏页（Legacy，默认）|多窗口平铺（Windows）/);
}

console.log("options mode copy validation passed");
