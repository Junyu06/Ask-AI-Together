const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.join(__dirname, "..");
const attachmentsPath = path.join(repoRoot, "Side-by-Side AI", "content", "content-attachments.js");
const source = fs.readFileSync(attachmentsPath, "utf8");

assert.match(source, /function\s+attachByMainWorld\(items\)/);
assert.match(source, /async\s+function\s+attachFilesGemini\(inputEl,\s*files,\s*items\)/);
assert.match(source, /if\s*\(\s*await\s+attachByMainWorld\(items\)\s*\)\s*return\s+true;/);
assert.match(source, /return\s+attachFilesGemini\(inputEl,\s*files,\s*items\);/);

const geminiFnStart = source.indexOf("async function attachFilesGemini");
assert.ok(geminiFnStart >= 0, "Gemini attachment function should exist");

const nextFunctionStart = source.indexOf("\nasync function ", geminiFnStart + 1);
assert.ok(nextFunctionStart > geminiFnStart, "Gemini attachment function body should be bounded");

const geminiFnBody = source.slice(geminiFnStart, nextFunctionStart);
const mainWorldCall = geminiFnBody.indexOf("await attachByMainWorld(items)");
const fileInputCall = geminiFnBody.indexOf("attachByFileInput(files, inputEl)");

assert.ok(mainWorldCall >= 0, "Gemini should call the main-world attachment hook");
assert.ok(fileInputCall >= 0, "Gemini should keep its isolated-world file input fallback");
assert.ok(fileInputCall > mainWorldCall, "Main-world attachment should run before isolated-world fallbacks");

console.log("gemini attachment main-world validation passed");
