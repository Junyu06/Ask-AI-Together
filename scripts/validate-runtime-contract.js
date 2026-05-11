"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");

const repoRoot = path.resolve(__dirname, "..");
const contractPath = path.join(repoRoot, "Side-by-Side AI", "shared", "runtime-contract.js");
const source = fs.readFileSync(contractPath, "utf8");

const context = vm.createContext({
  console,
  Date,
  URL,
  globalThis: {}
});
context.globalThis = context;

vm.runInContext(source, context, { filename: contractPath });

const runtime = context.__ASK_AI_TOGETHER_RUNTIME__;
assert.ok(runtime, "runtime namespace should exist");
assert.equal(runtime.version, "slice1-runtime-contract");
assert.equal(runtime.bootstrap.state, "ready");

	assert.equal(runtime.markListenerRegistered("unit-listener"), true);
	assert.equal(runtime.markListenerRegistered("unit-listener"), false);
	assert.ok(runtime.constants.outcomeStatuses.includes("send-submitted"));
	assert.equal(runtime.makeOutcome("send-submitted").ok, true);
	assert.equal(runtime.makeOutcome("send-ack-timeout").ok, false);

runtime.registerProviderDefinitions(
  [
    {
      id: "chatgpt",
      displayName: "ChatGPT",
      matchHosts: ["chatgpt.com"],
      homeUrl: "https://chatgpt.com/",
      capabilities: {
        supportsAttachments: true,
        attachmentMode: "legacy-only"
      }
    },
    {
      id: "deepseek",
      displayName: "DeepSeek",
      matchHosts: ["chat.deepseek.com"],
      homeUrl: "https://chat.deepseek.com/",
      capabilities: {
        supportsAttachments: true,
        attachmentMode: "legacy-only"
      }
    }
  ],
  { mode: "legacy" }
);
runtime.registerProviderDefinitions(
  [
    {
      id: "chatgpt",
      displayName: "ChatGPT",
      matchHosts: ["chatgpt.com"],
      homeUrl: "https://chatgpt.com/",
      capabilities: {
        supportsAttachments: false,
        attachmentMode: "unsupported"
      }
    },
    {
      id: "deepseek",
      displayName: "DeepSeek",
      matchHosts: ["chat.deepseek.com"],
      homeUrl: "https://chat.deepseek.com/",
      capabilities: {
        supportsAttachments: false,
        attachmentMode: "unsupported"
      }
    }
  ],
  { mode: "compatibility" }
);

assert.equal(runtime.matchProviderForLocation({ hostname: "chatgpt.com" })?.id, "chatgpt");
assert.equal(runtime.matchProviderForLocation({ hostname: "team.chatgpt.com" })?.id, "chatgpt");
assert.equal(runtime.matchProviderForLocation({ hostname: "chat.deepseek.com" })?.id, "deepseek");
assert.equal(runtime.matchProviderForLocation({ hostname: "lab.chat.deepseek.com" })?.id, "deepseek");
assert.equal(runtime.matchProviderForLocation({ hostname: "evilchatgpt.com" }), null);
assert.equal(runtime.matchProviderForLocation({ hostname: "notchat.deepseek.com" }), null);
assert.equal(runtime.matchProviderForLocation({ hostname: "chat.deepseek.com.evil.test" }), null);

const legacyCapabilities = runtime.getProviderCapabilities("chatgpt", "legacy");
assert.equal(legacyCapabilities.siteId, "chatgpt");
assert.equal(legacyCapabilities.supportsAttachments, true);
assert.equal(legacyCapabilities.attachmentMode, "legacy-only");

const compatibilityCapabilities = runtime.getProviderCapabilities("chatgpt", "compatibility");
assert.equal(compatibilityCapabilities.siteId, "chatgpt");
assert.equal(compatibilityCapabilities.supportsAttachments, false);
assert.equal(compatibilityCapabilities.attachmentMode, "unsupported");

const validEnvelope = runtime.validateRuntimeMessageEnvelope({
  requestId: "req-1",
  sourceMode: "legacy",
  targetMode: "legacy-content",
  frameRole: "iframe",
  providerId: "chatgpt",
  origin: "chrome-extension://example",
  payload: {
    message: "hello"
  }
});
assert.equal(validEnvelope.ok, true);

const fileEnvelope = runtime.validateRuntimeMessageEnvelope(
  {
    requestId: "req-2",
    sourceMode: "compatibility",
    targetMode: "compatibility-content",
    frameRole: "top",
    providerId: "chatgpt",
    payload: {
      files: [{ name: "x.txt" }]
    }
  },
  { disallowFilePayload: true }
);
assert.equal(fileEnvelope.ok, false);
assert.ok(fileEnvelope.errors.includes("file-payload-unsupported"));

const historyContext = runtime.createRuntimeHistoryContext({
  requestId: "req-3",
  sourceMode: "legacy",
  providerId: "chatgpt",
  frameRole: "iframe",
  initialUrl: "https://chatgpt.com/"
});
assert.equal(runtime.validateRuntimeHistoryContext(historyContext).ok, true);

const badHistoryContext = {
  ...historyContext,
  attachments: [{ name: "x.txt" }]
};
const badHistoryValidation = runtime.validateRuntimeHistoryContext(badHistoryContext);
assert.equal(badHistoryValidation.ok, false);
assert.ok(badHistoryValidation.errors.includes("forbidden-history-key:attachments"));

console.log("runtime-contract validation passed");
