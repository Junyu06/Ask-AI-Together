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
  let newChatCount = 0;
  let openCount = 0;
  let callSequence = [];
  let lastCapabilitySiteIds = null;
  let lastOpenSites = null;
  let lastNewChatSiteIds = null;
  let lastSendArgs = null;
  let lastCollectSiteIds = null;
  let scenario = {
    baseline: { status: "response-found", text: "old answer" },
    collect: { status: "response-found", text: "new answer" },
    newChat: {},
    send: {}
  };
  const nativeSetTimeout = setTimeout;
  const nativeClearTimeout = clearTimeout;
  const sessionStore = {};
  let sessionSetCount = 0;
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
    setTimeout(callback, ms, ...args) {
      return nativeSetTimeout(callback, scenario.fastTimers ? 0 : ms, ...args);
    },
    clearTimeout: nativeClearTimeout,
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
      },
      storage: {
        session: {
          async get(key) {
            if (typeof key === "string") return { [key]: sessionStore[key] };
            return {};
          },
          async set(values) {
            Object.assign(sessionStore, JSON.parse(JSON.stringify(values || {})));
            sessionSetCount += 1;
          }
        }
      }
    },
    async loadTargets() {
      return {
        chatgpt: { siteId: "chatgpt", windowId: 1, tabId: 11, transport: "window" }
      };
    },
    async getCapabilitiesForTargets(siteIds) {
      lastCapabilitySiteIds = Array.from(siteIds);
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
      openCount += 1;
      lastOpenSites = Array.from(sites, (site) => ({ ...site }));
      callSequence.push("open");
      return {
        ok: true,
        targets: Object.fromEntries(sites.map((site, index) => [
          site.siteId,
          { siteId: site.siteId, windowId: index + 1, tabId: index + 11, transport: "window" }
        ]))
      };
    },
    async newChatOnTargets(siteIds) {
      newChatCount += 1;
      lastNewChatSiteIds = Array.from(siteIds);
      callSequence.push("newChat");
      if (scenario.newChat?.throw) throw new Error(scenario.newChat.reason || "unit-new-chat-failed");
      if (scenario.newChat?.hang) return new Promise(() => {});
      const outcomes = siteIds.map((siteId) => {
        const configured = scenario.newChat?.outcomes?.[siteId] || {};
        const ok = configured.ok ?? (scenario.newChat?.ok !== false);
        return {
          ok,
          status: configured.status || scenario.newChat?.status || (ok ? "response-found" : "new-chat-failed"),
          providerId: siteId,
          siteId,
          reason: configured.reason || scenario.newChat?.reason || ""
        };
      });
      const failed = outcomes.filter((outcome) => outcome.ok === false);
      return {
        ok: failed.length === 0,
        status: failed.length ? (failed.length === outcomes.length ? "new-chat-failed" : "partial-failed") : "response-found",
        reason: scenario.newChat?.reason || "",
        outcomes
      };
    },
    async sendPromptToTargets(siteIds, message, requestId, sites, files, origin, targetHints, actionContext) {
      sendCount += 1;
      lastSendArgs = {
        siteIds: Array.from(siteIds),
        message,
        requestId,
        sites: Array.from(sites, (site) => ({ ...site })),
        files: Array.from(files),
        origin,
        targetHints,
        actionContext: { ...actionContext }
      };
      callSequence.push("send");
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
      lastCollectSiteIds = Array.from(siteIds);
      const config = Array.isArray(scenario.collectQueue) && scenario.collectQueue.length
        ? scenario.collectQueue.shift()
        : collectCount === 1 ? scenario.baseline : scenario.collect;
      callSequence.push(config?.label || (collectCount === 1 ? "baseline" : "collect"));
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
  assert.equal((await bridge.handleAgentBridgeRequest({ action: "sendPrompt", providerId: "deepseek", prompt: "x" })).reason, "unknown-provider");
  assert.match((await bridge.handleAgentBridgeRequest({ action: "health", options: { selector: "x" } })).reason, /forbidden-field/);
  assert.equal((await bridge.handleAgentBridgeRequest({ action: "health", options: { surprise: true } })).reason, "unknown-option-field");
  assert.equal((await bridge.handleAgentBridgeRequest({ action: "health", options: { newChatBeforeSend: "false" } })).reason, "invalid-option-field");
  assert.equal((await bridge.handleAgentBridgeRequest({ action: "sendPrompt", prompt: "x" })).reason, "providerId-required");
  assert.equal((await bridge.handleAgentBridgeRequest({ action: "sendPrompt", providerId: "chatgpt" })).reason, "prompt-required");
  assert.match((await bridge.handleAgentBridgeRequest({ action: "sendPrompt", providerId: "chatgpt", prompt: "x", options: { rawTranscript: "nope" } })).reason, /forbidden-field/);
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
  assert.equal(health.connectionLayer, true);
  assert.ok(health.primitiveActions.includes("sendPrompt"));
  assert.ok(health.primitiveActions.includes("collectResponse"));
  assert.ok(health.compatibilityActions.includes("sendAll"));
  assert.ok(health.deprecatedPipelineActions.includes("collectAll"));
  assert.deepEqual(Array.from(health.providerAllowlist), ["chatgpt", "grok", "gemini", "claude"]);

  const capabilities = await bridge.handleAgentBridgeRequest({ action: "getCapabilities", providerIds: ["chatgpt", "claude"] });
  assert.equal(capabilities.ok, true);
  assert.equal(capabilities.connectionLayer, true);
  assert.ok(capabilities.primitiveActions.includes("openProvider"));
  assert.ok(capabilities.deprecatedActions.includes("getRunState"));
  assert.equal(capabilities.capabilities.length, 2);

  bridge._test.resetAgentBridgeStateForTest();
  sendCount = 0;
  collectCount = 0;
  newChatCount = 0;
  openCount = 0;
  callSequence = [];
  lastCapabilitySiteIds = null;
  lastOpenSites = null;
  lastNewChatSiteIds = null;
  lastSendArgs = null;
  lastCollectSiteIds = null;
  scenario = {
    collectQueue: [{ status: "response-found", text: "primitive answer" }],
    baseline: { status: "response-found", text: "old answer" },
    collect: { status: "response-found", text: "primitive answer" },
    newChat: {},
    send: {},
    fastTimers: true
  };
  const primitiveSessionSetCountBefore = sessionSetCount;
  assert.equal(Object.prototype.hasOwnProperty.call(sessionStore, "oa_agent_bridge_runs_v1"), false);

  const providers = await bridge.handleAgentBridgeRequest({ action: "listProviders", providerIds: ["chatgpt", "claude"] });
  assert.equal(providers.ok, true);
  assert.equal(providers.connectionLayer, true);
  assert.deepEqual(lastCapabilitySiteIds, ["chatgpt", "claude"]);
  assert.deepEqual(Array.from(providers.providers, (provider) => provider.providerId), ["chatgpt", "claude"]);
  assert.equal(providers.providers[0].target.bound, true);

  const opened = await bridge.handleAgentBridgeRequest({ action: "openProvider", providerId: "gemini", requestId: "req-open-primitive" });
  assert.equal(opened.ok, true);
  assert.equal(opened.providerId, "gemini");
  assert.equal(opened.target.tabId, 11);
  assert.deepEqual(lastOpenSites, [{ siteId: "gemini", url: "https://gemini.google.com/" }]);

  const fresh = await bridge.handleAgentBridgeRequest({ action: "ensureFreshConversation", providerId: "claude", requestId: "req-fresh-primitive" });
  assert.equal(fresh.ok, true);
  assert.equal(fresh.providerId, "claude");
  assert.equal(fresh.status, "fresh-conversation-ready");
  assert.equal(typeof fresh.evidence.completedAt, "string");
  assert.deepEqual(lastNewChatSiteIds, ["claude"]);

  const sentPrimitive = await bridge.handleAgentBridgeRequest({
    action: "sendPrompt",
    providerId: "chatgpt",
    requestId: "req-send-primitive",
    prompt: "primitive question"
  });
  assert.equal(sentPrimitive.ok, true);
  assert.equal(sentPrimitive.providerId, "chatgpt");
  assert.equal(sentPrimitive.status, "send-submitted");
  assert.equal(sentPrimitive.metadata.historyMode, "metadata-only");
  assert.deepEqual(lastSendArgs.siteIds, ["chatgpt"]);
  assert.equal(lastSendArgs.message, "primitive question");
  assert.equal(lastSendArgs.actionContext.source, "agent-bridge-primitive");
  assert.deepEqual(lastSendArgs.files, []);

  const collectedPrimitive = await bridge.handleAgentBridgeRequest({
    action: "collectResponse",
    providerId: "chatgpt",
    requestId: "req-collect-primitive"
  });
  assert.equal(collectedPrimitive.ok, true);
  assert.equal(collectedPrimitive.providerId, "chatgpt");
  assert.equal(collectedPrimitive.text, "primitive answer");
  assert.equal(collectedPrimitive.metadata.answerLength, "primitive answer".length);
  assert.deepEqual(lastCollectSiteIds, ["chatgpt"]);

  const providerStatus = await bridge.handleAgentBridgeRequest({ action: "getProviderStatus", providerId: "chatgpt" });
  assert.equal(providerStatus.ok, true);
  assert.equal(providerStatus.status, "bound");
  assert.equal(providerStatus.target.tabId, 11);
  assert.equal(providerStatus.generation.status, "unknown");
  assert.equal(sessionSetCount, primitiveSessionSetCountBefore, "primitive actions must not write chrome.storage.session");
  assert.equal(
    Object.prototype.hasOwnProperty.call(sessionStore, "oa_agent_bridge_runs_v1"),
    false,
    "primitive actions must not create legacy run storage"
  );

  bridge._test.resetAgentBridgeStateForTest();
  sendCount = 0;
  collectCount = 0;
  newChatCount = 0;
  openCount = 0;
  callSequence = [];
  scenario = {
    baseline: { status: "response-found", text: "old answer" },
    collect: { status: "response-found", text: "new answer" },
    newChat: {},
    send: {},
    fastTimers: true
  };
  const firstConcurrent = bridge.handleAgentBridgeRequest({
    action: "sendAll",
    requestId: "req-concurrent-1",
    runId: "run-concurrent",
    idempotencyKey: "idem-concurrent",
    providerIds: ["chatgpt"],
    prompt: "question",
    options: { newChatSettleMs: 0 }
  });
  const secondConcurrent = bridge.handleAgentBridgeRequest({
    action: "sendAll",
    requestId: "req-concurrent-2",
    runId: "run-concurrent",
    idempotencyKey: "idem-concurrent",
    providerIds: ["chatgpt"],
    prompt: "question",
    options: { newChatSettleMs: 0 }
  });
  const concurrentResults = await Promise.all([firstConcurrent, secondConcurrent]);
  assert.equal(sendCount, 1, "concurrent duplicate sendAll must not resend");
  assert.equal(openCount, 1, "concurrent duplicate sendAll must not re-open targets");
  assert.equal(newChatCount, 1, "concurrent duplicate sendAll must not start a second new chat");
  assert.equal(
    concurrentResults.filter((item) => item.status === "duplicate-blocked").length,
    1,
    "one concurrent duplicate should be blocked while the first send is in flight"
  );

  bridge._test.resetAgentBridgeStateForTest();
  sendCount = 0;
  collectCount = 0;
  newChatCount = 0;
  openCount = 0;
  callSequence = [];
  scenario = {
    baseline: { status: "response-found", text: "old answer" },
    collect: { status: "response-found", text: "new answer" },
    newChat: {},
    send: {},
    fastTimers: true
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
  assert.equal(send.run.providerResults[0].newChatPhase, "new-chat-submitted");
  assert.equal(send.run.providerResults[0].audit.newChatBeforeSend, true);
  assert.equal(send.run.providerResults[0].audit.newChatStatus, "new-chat-submitted");
  assert.equal(send.run.audit.historyMode, "metadata-only");
  assert.equal(send.run.audit.newChatBeforeSend, true);
  assert.equal(send.run.audit.newChatStatus, "new-chat-submitted");
  assert.equal(openCount, 1);
  assert.equal(newChatCount, 1);
  assert.deepEqual(callSequence, ["open", "newChat", "baseline", "send"]);
  assert.equal(sessionSetCount > 0, true, "sendAll should persist run state to chrome.storage.session");
  assert.equal(
    (sessionStore.oa_agent_bridge_runs_v1 || []).some((run) =>
      run.runId === "run-1" && run.audit?.newChatStatus === "new-chat-submitted"
    ),
    true,
    "persisted run should include newChat audit state"
  );

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
  assert.equal(newChatCount, 1, "duplicate sendAll must not start another new chat");

  bridge._test.resetAgentBridgeStateForTest();
  sendCount = 0;
  collectCount = 0;
  newChatCount = 0;
  openCount = 0;
  callSequence = [];
  scenario = {
    baseline: { status: "response-empty", text: "" },
    collect: { status: "response-found", text: "new answer" },
    newChat: {},
    send: {}
  };
  const sendWithoutNewChat = await bridge.handleAgentBridgeRequest({
    action: "sendAll",
    requestId: "req-send-no-new-chat",
    runId: "run-no-new-chat",
    idempotencyKey: "idem-no-new-chat",
    providerIds: ["chatgpt"],
    prompt: "question",
    options: { newChatBeforeSend: false }
  });
  assert.equal(sendWithoutNewChat.ok, true);
  assert.equal(openCount, 1);
  assert.equal(newChatCount, 0, "explicit newChatBeforeSend false must skip newChatOnTargets");
  assert.equal(sendWithoutNewChat.run.providerResults[0].newChatPhase, "skipped");
  assert.equal(sendWithoutNewChat.run.providerResults[0].audit.newChatBeforeSend, false);
  assert.equal(sendWithoutNewChat.run.providerResults[0].audit.newChatReason, "disabled-by-option");
  assert.deepEqual(callSequence, ["open", "baseline", "send"]);

  bridge._test.resetAgentBridgeStateForTest();
  sendCount = 0;
  collectCount = 0;
  newChatCount = 0;
  openCount = 0;
  callSequence = [];
  scenario = {
    baseline: { status: "response-empty", text: "" },
    collect: { status: "response-found", text: "new answer" },
    newChat: { ok: false, reason: "unit-new-chat-failed" },
    send: {}
  };
  const sendWithNewChatFailure = await bridge.handleAgentBridgeRequest({
    action: "sendAll",
    requestId: "req-send-new-chat-failed",
    runId: "run-new-chat-failed",
    idempotencyKey: "idem-new-chat-failed",
    providerIds: ["chatgpt"],
    prompt: "question",
    options: { newChatSettleMs: 0 }
  });
  assert.equal(sendWithNewChatFailure.ok, false);
  assert.equal(sendWithNewChatFailure.status, "new-chat-failed");
  assert.equal(sendWithNewChatFailure.reason, "unit-new-chat-failed");
  assert.equal(sendCount, 0, "new chat failure must fail closed before send");
  assert.equal(collectCount, 0, "new chat failure must fail closed before baseline");
  assert.deepEqual(callSequence, ["open", "newChat"]);
  assert.equal(sendWithNewChatFailure.run.providerResults[0].sendPhase, "blocked-before-send");
  assert.equal(sendWithNewChatFailure.run.providerResults[0].newChatPhase, "new-chat-failed");
  assert.equal(sendWithNewChatFailure.run.providerResults[0].reason, "unit-new-chat-failed");
  assert.equal(sendWithNewChatFailure.run.providerResults[0].audit.newChatReason, "unit-new-chat-failed");

  bridge._test.resetAgentBridgeStateForTest();
  sendCount = 0;
  collectCount = 0;
  newChatCount = 0;
  openCount = 0;
  callSequence = [];
  scenario = {
    baseline: { status: "response-empty", text: "" },
    collect: { status: "response-found", text: "new answer" },
    newChat: { hang: true },
    send: {},
    fastTimers: true
  };
  const sendWithNewChatTimeout = await bridge.handleAgentBridgeRequest({
    action: "sendAll",
    requestId: "req-send-new-chat-timeout",
    runId: "run-new-chat-timeout",
    idempotencyKey: "idem-new-chat-timeout",
    providerIds: ["chatgpt"],
    prompt: "question",
    options: { newChatSettleMs: 0 }
  });
  assert.equal(sendWithNewChatTimeout.ok, false);
  assert.equal(sendWithNewChatTimeout.status, "new-chat-timeout");
  assert.equal(sendCount, 0, "new chat timeout must fail closed before send");
  assert.equal(collectCount, 0, "new chat timeout must fail closed before baseline");
  assert.deepEqual(callSequence, ["open", "newChat"]);
  assert.equal(sendWithNewChatTimeout.run.providerResults[0].sendPhase, "blocked-before-send");
  assert.equal(sendWithNewChatTimeout.run.providerResults[0].newChatPhase, "new-chat-timeout");
  assert.equal(sendWithNewChatTimeout.run.providerResults[0].reason, "new-chat-timeout");
  assert.equal(sendWithNewChatTimeout.run.providerResults[0].audit.newChatReason, "new-chat-timeout");

  bridge._test.resetAgentBridgeStateForTest();
  sendCount = 0;
  collectCount = 0;
  newChatCount = 0;
  openCount = 0;
  callSequence = [];
  scenario = {
    baseline: { status: "response-empty", text: "" },
    collect: { status: "response-found", text: "new answer" },
    newChat: {
      outcomes: {
        chatgpt: { ok: true, status: "response-found" },
        gemini: { ok: false, status: "new-chat-failed", reason: "unit-gemini-new-chat-failed" }
      }
    },
    send: {}
  };
  const sendWithPartialNewChatFailure = await bridge.handleAgentBridgeRequest({
    action: "sendAll",
    requestId: "req-send-new-chat-partial",
    runId: "run-new-chat-partial",
    idempotencyKey: "idem-new-chat-partial",
    providerIds: ["chatgpt", "gemini"],
    prompt: "question",
    options: { newChatSettleMs: 0 }
  });
  assert.equal(sendWithPartialNewChatFailure.ok, false);
  assert.equal(sendWithPartialNewChatFailure.status, "new-chat-failed");
  assert.equal(sendCount, 0, "partial new chat failure must fail closed before send");
  assert.equal(collectCount, 0, "partial new chat failure must fail closed before baseline");
  assert.deepEqual(callSequence, ["open", "newChat"]);
  const partialProviders = Object.fromEntries(sendWithPartialNewChatFailure.run.providerResults.map((provider) => [provider.providerId, provider]));
  assert.equal(partialProviders.chatgpt.newChatPhase, "new-chat-submitted");
  assert.equal(partialProviders.chatgpt.sendPhase, "blocked-before-send");
  assert.equal(partialProviders.gemini.newChatPhase, "new-chat-failed");
  assert.equal(partialProviders.gemini.reason, "unit-gemini-new-chat-failed");
  assert.equal(partialProviders.gemini.sendPhase, "blocked-before-send");

  bridge._test.resetAgentBridgeStateForTest();
  sendCount = 0;
  collectCount = 0;
  newChatCount = 0;
  openCount = 0;
  callSequence = [];
  scenario = {
    collectQueue: [
      { label: "baseline-a", status: "response-empty", text: "" },
      { label: "baseline-b", status: "response-empty", text: "" }
    ],
    baseline: { status: "response-empty", text: "" },
    collect: { status: "response-found", text: "new answer" },
    newChat: {},
    send: {}
  };
  const consecutiveA = await bridge.handleAgentBridgeRequest({
    action: "sendAll",
    requestId: "req-consecutive-a",
    runId: "run-consecutive-a",
    idempotencyKey: "idem-consecutive-a",
    providerIds: ["chatgpt"],
    prompt: "question a",
    options: { newChatSettleMs: 0 }
  });
  const consecutiveB = await bridge.handleAgentBridgeRequest({
    action: "sendAll",
    requestId: "req-consecutive-b",
    runId: "run-consecutive-b",
    idempotencyKey: "idem-consecutive-b",
    providerIds: ["chatgpt"],
    prompt: "question b",
    options: { newChatSettleMs: 0 }
  });
  assert.equal(consecutiveA.run.providerResults[0].providerRunId, "run-consecutive-a:chatgpt");
  assert.equal(consecutiveB.run.providerResults[0].providerRunId, "run-consecutive-b:chatgpt");
  assert.equal(sendCount, 2);
  assert.equal(newChatCount, 2, "separate runs should each start a fresh conversation");
  assert.deepEqual(callSequence, ["open", "newChat", "baseline-a", "send", "open", "newChat", "baseline-b", "send"]);

  async function collectProviderForFreshnessCase(name, overrides) {
    bridge._test.resetAgentBridgeStateForTest();
    sendCount = 0;
    collectCount = 0;
    newChatCount = 0;
    openCount = 0;
    callSequence = [];
    scenario = {
      baseline: overrides.baseline,
      collect: overrides.collect,
      newChat: overrides.newChat || {},
      send: overrides.send || {}
    };
    await bridge.handleAgentBridgeRequest({
      action: "sendAll",
      requestId: `req-send-${name}`,
      runId: `run-${name}`,
      idempotencyKey: `idem-${name}`,
      providerIds: ["chatgpt"],
      prompt: "question",
      options: { newChatSettleMs: 0 }
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
