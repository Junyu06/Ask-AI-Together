"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");

const repoRoot = path.resolve(__dirname, "..");
const extensionRoot = path.join(repoRoot, "Side-by-Side AI");
const bridgePagePath = path.join(extensionRoot, "shared", "agent-bridge.js");
const bridgeBackgroundPath = path.join(extensionRoot, "background", "bg-agent-bridge.js");
const backgroundPath = path.join(extensionRoot, "background", "background.js");
const optionsPath = path.join(extensionRoot, "ui", "options", "options.html");
const legacyPath = path.join(extensionRoot, "legacy", "index.html");
const manifestPath = path.join(extensionRoot, "manifest.json");

(async () => {
  const sentMessages = [];
  const pageContext = vm.createContext({
    chrome: {
      runtime: {
        async sendMessage(message) {
          sentMessages.push(message);
          return { ok: true, echoed: message.payload };
        }
      }
    },
    Error,
    Object,
    globalThis: {}
  });
  pageContext.globalThis = pageContext;
  vm.runInContext(fs.readFileSync(bridgePagePath, "utf8"), pageContext, { filename: bridgePagePath });
  assert.equal(pageContext.AskAiTogetherAgentBridge.version, "agent-bridge-mvp-v1");
  assert.equal(typeof pageContext.AskAiTogetherAgentBridge.request, "function");
  const response = await vm.runInContext(
    "AskAiTogetherAgentBridge.request({ action: 'health', requestId: 'req-page' })",
    pageContext
  );
  assert.equal(response.echoed.action, "health");
  assert.equal(sentMessages[0].type, "OA_AGENT_BRIDGE");

  let sendCount = 0;
  let collectCount = 0;
  let scenario = {
    baseline: { status: "response-found", text: "old answer" },
    collect: { status: "response-found", text: "new answer" },
    send: {}
  };
  function sectionFor(siteId, config, fallbackText) {
    const text = "text" in (config || {}) ? String(config.text || "") : fallbackText;
    return {
      siteId,
      status: config?.status || (text ? "response-found" : "response-empty"),
      reason: config?.reason || "",
      text
    };
  }
  const context = vm.createContext({
    console,
    Date,
    Math,
    JSON,
    Object,
    Promise,
    setTimeout,
    globalThis: {},
    BUILTIN_SITE_URLS: {
      chatgpt: "https://chatgpt.com/",
      grok: "https://grok.com/",
      gemini: "https://gemini.google.com/",
      claude: "https://claude.ai/"
    },
    chrome: {
      runtime: {
        id: "unit-extension-id",
        getURL(pathname = "") {
          return `chrome-extension://unit-extension-id/${pathname}`;
        },
        getManifest() {
          return { name: "Side-by-Side AI", version: "0.3.1" };
        }
      }
    },
    async loadTargets() {
      return {
        chatgpt: { siteId: "chatgpt", windowId: 1, tabId: 11, transport: "window" }
      };
    },
    async getCapabilitiesForTargets(siteIds) {
      return {
        ok: true,
        capabilities: siteIds.map((siteId) => ({
          siteId,
          supportsAttachments: false,
          attachmentMode: "unsupported"
        }))
      };
    },
    async openOrReuseWindows(sites) {
      return {
        ok: true,
        targets: Object.fromEntries(sites.map((site, index) => [
          site.siteId,
          { siteId: site.siteId, windowId: index + 1, tabId: index + 11, transport: "window" }
        ]))
      };
    },
    async sendPromptToTargets(siteIds, message, requestId, sites, files, origin, targetHints, actionContext) {
      sendCount += 1;
      assert.equal(actionContext.historyMode, "metadata-only");
      const failed = scenario.send?.failed === true;
      return {
        ok: !failed,
        status: failed ? "transport-failed" : "response-found",
        outcomes: siteIds.map((siteId) => ({
          ok: !failed,
          status: failed ? "transport-failed" : "send-submitted",
          providerId: siteId,
          requestId,
          messageLength: message.length,
          reason: failed ? "unit-send-failed" : ""
        }))
      };
    },
    async collectLastFromTargets(siteIds) {
      collectCount += 1;
      const config = collectCount === 1 ? scenario.baseline : scenario.collect;
      if (config?.throw) throw new Error(config.reason || "unit-baseline-failed");
      return {
        ok: config?.ok !== false,
        reason: config?.reason || "",
        sections: siteIds.map((siteId) => sectionFor(siteId, config, collectCount === 1 ? "old answer" : "new answer"))
      };
    }
  });
  context.globalThis = context;

  vm.runInContext(fs.readFileSync(bridgeBackgroundPath, "utf8"), context, { filename: bridgeBackgroundPath });
  const bridge = context.AskAiTogetherAgentBridgeBackground;
  assert.equal(bridge.version, "agent-bridge-mvp-v1");

  assert.equal((await bridge.handleAgentBridgeRequest({ action: "unknown" })).ok, false);
  assert.equal((await bridge.handleAgentBridgeRequest({ action: "health", unexpected: true })).reason, "unknown-field");
  assert.equal((await bridge.handleAgentBridgeRequest({ action: "health", providerIds: ["deepseek"] })).reason, "unknown-provider");
  assert.match((await bridge.handleAgentBridgeRequest({ action: "health", options: { selector: "x" } })).reason, /forbidden-field/);
  assert.equal((await bridge.handleAgentBridgeRequest({ action: "sendAll", providerIds: ["chatgpt"], prompt: "x", files: [] })).reason, "unknown-field");
  assert.equal(
    (await bridge.handleAgentBridgeRequest(
      { action: "health" },
      { sender: { id: "unit-extension-id", url: "https://chatgpt.com/", tab: { id: 123 } } }
    )).reason,
    "unauthorized-sender"
  );
  assert.equal(
    (await bridge.handleAgentBridgeRequest(
      { action: "health" },
      { sender: { id: "unit-extension-id", url: "chrome-extension://unit-extension-id/ui/options/options.html" } }
    )).ok,
    true
  );
  assert.equal(
    (await bridge.handleAgentBridgeRequest(
      { action: "health" },
      { sender: { id: "unit-extension-id", url: "chrome-extension://unit-extension-id/legacy/index.html", tab: { id: 456 } } }
    )).ok,
    true
  );

  const health = await bridge.handleAgentBridgeRequest({ action: "health", requestId: "req-health" });
  assert.equal(health.ok, true);
  assert.deepEqual(Array.from(health.providerAllowlist), ["chatgpt", "grok", "gemini", "claude"]);

  const capabilities = await bridge.handleAgentBridgeRequest({ action: "getCapabilities", providerIds: ["chatgpt", "claude"] });
  assert.equal(capabilities.ok, true);
  assert.equal(capabilities.capabilities.length, 2);

  bridge._test.resetAgentBridgeStateForTest();
  sendCount = 0;
  collectCount = 0;
  scenario = {
    baseline: { status: "response-found", text: "old answer" },
    collect: { status: "response-found", text: "new answer" },
    send: {}
  };
  const firstConcurrent = bridge.handleAgentBridgeRequest({
    action: "sendAll",
    requestId: "req-concurrent-1",
    runId: "run-concurrent",
    idempotencyKey: "idem-concurrent",
    providerIds: ["chatgpt"],
    prompt: "question"
  });
  const secondConcurrent = bridge.handleAgentBridgeRequest({
    action: "sendAll",
    requestId: "req-concurrent-2",
    runId: "run-concurrent",
    idempotencyKey: "idem-concurrent",
    providerIds: ["chatgpt"],
    prompt: "question"
  });
  const concurrentResults = await Promise.all([firstConcurrent, secondConcurrent]);
  assert.equal(sendCount, 1, "concurrent duplicate sendAll must not resend");
  assert.equal(
    concurrentResults.filter((item) => item.status === "duplicate-blocked").length,
    1,
    "one concurrent duplicate should be blocked while the first send is in flight"
  );

  bridge._test.resetAgentBridgeStateForTest();
  sendCount = 0;
  collectCount = 0;
  scenario = {
    baseline: { status: "response-found", text: "old answer" },
    collect: { status: "response-found", text: "new answer" },
    send: {}
  };
  const send = await bridge.handleAgentBridgeRequest({
    action: "sendAll",
    requestId: "req-send",
    runId: "run-1",
    idempotencyKey: "idem-1",
    providerIds: ["chatgpt"],
    prompt: "question"
  });
  assert.equal(send.ok, true);
  assert.equal(send.run.providerResults[0].sendPhase, "send-submitted");
  assert.equal(send.run.providerResults[0].audit.promptHash.startsWith("fnv1a32:"), true);
  assert.equal(send.run.providerResults[0].audit.preSendLatestHash.startsWith("fnv1a32:"), true);
  assert.equal(send.run.audit.historyMode, "metadata-only");

  const duplicate = await bridge.handleAgentBridgeRequest({
    action: "sendAll",
    requestId: "req-send-2",
    runId: "run-1",
    idempotencyKey: "idem-1",
    providerIds: ["chatgpt"],
    prompt: "question"
  });
  assert.equal(duplicate.status, "duplicate-blocked");
  assert.equal(sendCount, 1, "duplicate sendAll must not resend");

  async function collectProviderForFreshnessCase(name, overrides) {
    bridge._test.resetAgentBridgeStateForTest();
    sendCount = 0;
    collectCount = 0;
    scenario = {
      baseline: overrides.baseline,
      collect: overrides.collect,
      send: overrides.send || {}
    };
    await bridge.handleAgentBridgeRequest({
      action: "sendAll",
      requestId: `req-send-${name}`,
      runId: `run-${name}`,
      idempotencyKey: `idem-${name}`,
      providerIds: ["chatgpt"],
      prompt: "question"
    });
    const collected = await bridge.handleAgentBridgeRequest({
      action: "collectAll",
      requestId: `req-collect-${name}`,
      runId: `run-${name}`,
      idempotencyKey: `idem-${name}`
    });
    return collected.run.providerResults[0];
  }

  {
    const provider = await collectProviderForFreshnessCase("baseline-failed", {
      baseline: { ok: false, status: "transport-failed", reason: "baseline-failed", text: "" },
      collect: { status: "response-found", text: "new answer" }
    });
    assert.equal(provider.collectPhase, "response-found");
    assert.equal(provider.freshness, "unknown");
    assert.equal(provider.counted, false);
    assert.equal(provider.reason, "baseline-failed");
  }

  {
    const provider = await collectProviderForFreshnessCase("send-failed", {
      baseline: { status: "response-found", text: "old answer" },
      collect: { status: "response-found", text: "new answer" },
      send: { failed: true }
    });
    assert.equal(provider.sendPhase, "send-failed");
    assert.equal(provider.collectPhase, "response-found");
    assert.equal(provider.freshness, "unknown");
    assert.equal(provider.counted, false);
    assert.equal(provider.reason, "provider-not-submitted");
  }

  {
    const provider = await collectProviderForFreshnessCase("old-answer", {
      baseline: { status: "response-found", text: "old answer" },
      collect: { status: "response-found", text: "old answer" }
    });
    assert.equal(provider.collectPhase, "old-answer-suspected");
    assert.equal(provider.freshness, "stale");
    assert.equal(provider.counted, false);
  }

  {
    const provider = await collectProviderForFreshnessCase("fresh-answer", {
      baseline: { status: "response-found", text: "old answer" },
      collect: { status: "response-found", text: "new answer" }
    });
    assert.equal(provider.collectPhase, "response-found");
    assert.equal(provider.freshness, "fresh");
    assert.equal(provider.counted, true);
    assert.equal(provider.audit.answerLength, "new answer".length);
    assert.equal(provider.audit.answerHash.startsWith("fnv1a32:"), true);
  }

  const state = await bridge.handleAgentBridgeRequest({ action: "getRunState", runId: "run-fresh-answer" });
  assert.equal(state.run.runId, "run-fresh-answer");

  const cancelled = await bridge.handleAgentBridgeRequest({ action: "cancelRun", runId: "run-fresh-answer" });
  assert.equal(cancelled.status, "cancelled");

  const backgroundSource = fs.readFileSync(backgroundPath, "utf8");
  assert.match(backgroundSource, /"bg-agent-bridge\.js"/);
  assert.match(backgroundSource, /msg\.type === "OA_AGENT_BRIDGE"/);
  assert.match(fs.readFileSync(optionsPath, "utf8"), /shared\/agent-bridge\.js/);
  assert.match(fs.readFileSync(legacyPath, "utf8"), /shared\/agent-bridge\.js/);
  assert.ok(JSON.parse(fs.readFileSync(manifestPath, "utf8")).web_accessible_resources[0].resources.includes("shared/agent-bridge.js"));

  console.log("agent-bridge validation passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
