"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");

const repoRoot = path.resolve(__dirname, "..");
const extensionRoot = path.join(repoRoot, "Side-by-Side AI");
const bridgeBackgroundPath = path.join(extensionRoot, "background", "bg-agent-bridge.js");
const exchangeBackgroundPath = path.join(extensionRoot, "background", "bg-agent-exchange.js");
const backgroundPath = path.join(extensionRoot, "background", "background.js");

function waitFor(predicate, { timeoutMs = 2000, intervalMs = 10, label = "condition" } = {}) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      let value;
      try {
        value = predicate();
      } catch (error) {
        clearInterval(timer);
        reject(error);
        return;
      }
      if (value) {
        clearInterval(timer);
        resolve(value);
        return;
      }
      if (Date.now() - startedAt > timeoutMs) {
        clearInterval(timer);
        reject(new Error(`timed out waiting for ${label}`));
      }
    }, intervalMs);
  });
}

(async () => {
  const sessionStore = {};
  let scenario = {};
  let sendCalls = [];
  let newChatCalls = [];
  let openCalls = [];
  let probeCalls = [];
  let nudgeCalls = [];

  const context = vm.createContext({
    console,
    Date,
    Math,
    JSON,
    Object,
    Promise,
    Array,
    Number,
    String,
    Boolean,
    Error,
    Map,
    Set,
    URL,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    globalThis: {},
    BUILTIN_SITE_URLS: {
      chatgpt: "https://chatgpt.com/",
      grok: "https://grok.com/",
      gemini: "https://gemini.google.com/",
      claude: "https://claude.ai/"
    },
    SITE_BUSY_SELECTORS: {
      chatgpt: ['button[data-testid="stop-button"]'],
      claude: ['[data-is-streaming="true"]'],
      gemini: ['button[aria-label*="Stop" i]'],
      grok: ['button[aria-label*="Stop" i]']
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
      tabs: {
        async get(tabId) {
          return { id: tabId, url: scenario.tabUrls?.[tabId] || "" };
        },
        async update(tabId, properties) {
          nudgeCalls.push({ kind: "tab", tabId, properties });
          return { id: tabId };
        }
      },
      windows: {
        async update(windowId, properties) {
          nudgeCalls.push({ kind: "window", windowId, properties });
          return { id: windowId };
        }
      },
      scripting: {
        async executeScript(details) {
          probeCalls.push({ tabId: details?.target?.tabId, args: details?.args });
          const queueKey = String(details?.target?.tabId);
          const queue = scenario.probeQueues?.[queueKey];
          if (!Array.isArray(queue) || !queue.length) {
            return [{ result: { ok: true, busy: false, signal: "", extracted: true, text: "", textLength: 0 } }];
          }
          const item = queue.length > 1 ? queue.shift() : queue[0];
          if (item?.throw) throw new Error(item.reason || "unit-probe-failed");
          const text = String(item?.text || "");
          return [{
            result: {
              ok: true,
              busy: item?.busy === true,
              signal: item?.signal || "",
              extracted: item?.extracted !== false,
              text,
              textLength: text.length
            }
          }];
        }
      },
      storage: {
        local: {
          async get() {
            return { oa_selected_sites: ["chatgpt", "gemini", "claude", "grok"] };
          }
        },
        session: {
          async get(key) {
            if (typeof key === "string") return { [key]: sessionStore[key] };
            return {};
          },
          async set(values) {
            Object.assign(sessionStore, JSON.parse(JSON.stringify(values || {})));
          }
        }
      }
    },
    async loadTargets() {
      return scenario.targets || {};
    },
    async getCapabilitiesForTargets(siteIds) {
      return {
        ok: true,
        capabilities: siteIds.map((siteId) => ({ siteId, supportsAttachments: false, attachmentMode: "unsupported" }))
      };
    },
    async openOrReuseWindows(sites) {
      openCalls.push(Array.from(sites, (site) => site.siteId));
      return { ok: true, targets: scenario.targets || {} };
    },
    async enqueueNewChatForSite(_siteId, job) {
      return job();
    },
    async navigateTargetToNewChat(siteId) {
      newChatCalls.push(siteId);
      const configured = scenario.newChat?.[siteId];
      if (configured?.throw) throw new Error(configured.reason || "unit-new-chat-failed");
      if (configured?.ok === false) {
        return { ok: false, status: configured.status || "new-chat-failed", reason: configured.reason || "" };
      }
      return { ok: true, status: "response-found", providerId: siteId, siteId, navigatedUrl: `https://unit/${siteId}` };
    },
    async sendPromptToTargets(siteIds, message, requestId, _sites, _files, _origin, _hints, actionContext) {
      sendCalls.push({ siteIds: Array.from(siteIds), message, requestId, source: actionContext?.source });
      assert.equal(actionContext.historyMode, "metadata-only");
      const failedIds = scenario.sendFailedIds || [];
      return {
        ok: !siteIds.every((siteId) => failedIds.includes(siteId)),
        status: "response-found",
        outcomes: siteIds.map((siteId) => ({
          ok: !failedIds.includes(siteId),
          status: failedIds.includes(siteId) ? "input-injection-failed" : "send-submitted",
          providerId: siteId,
          reason: failedIds.includes(siteId) ? "unit-send-failed" : ""
        }))
      };
    },
    async collectLastFromTargets(siteIds) {
      return {
        ok: true,
        sections: siteIds.map((siteId) => {
          const text = String(scenario.baselineTexts?.[siteId] || "");
          return { siteId, text, status: text ? "response-found" : "response-empty", reason: "" };
        })
      };
    },
    async recoverCompatibilityContentRuntime() {
      return true;
    }
  });
  context.globalThis = context;

  vm.runInContext(fs.readFileSync(bridgeBackgroundPath, "utf8"), context, { filename: bridgeBackgroundPath });
  vm.runInContext(fs.readFileSync(exchangeBackgroundPath, "utf8"), context, { filename: exchangeBackgroundPath });
  const bridge = context.AskAiTogetherAgentBridgeBackground;
  const exchangeModule = context.AskAiTogetherAgentExchange;
  assert.ok(exchangeModule, "exchange module should register on globalThis");

  function resetAll(nextScenario) {
    bridge._test.resetAgentBridgeStateForTest();
    exchangeModule._test.resetAgentExchangeStateForTest();
    for (const key of Object.keys(sessionStore)) delete sessionStore[key];
    sendCalls = [];
    newChatCalls = [];
    openCalls = [];
    probeCalls = [];
    nudgeCalls = [];
    scenario = nextScenario;
  }

  const boundTargets = {
    chatgpt: { siteId: "chatgpt", windowId: 1, tabId: 11, transport: "window" },
    gemini: { siteId: "gemini", windowId: 2, tabId: 12, transport: "window" }
  };

  /* ---------- 校验层 ---------- */
  resetAll({ targets: boundTargets });
  assert.equal((await bridge.handleAgentBridgeRequest({ action: "startExchange", providerIds: ["chatgpt"] })).reason, "prompt-required");
  assert.equal((await bridge.handleAgentBridgeRequest({ action: "getExchangeStatus" })).reason, "exchangeId-required");
  assert.equal((await bridge.handleAgentBridgeRequest({ action: "cancelExchange" })).reason, "exchangeId-required");
  assert.equal(
    (await bridge.handleAgentBridgeRequest({
      action: "startExchange",
      providerIds: ["chatgpt"],
      prompt: "q",
      providerOptions: { deepseek: { newChatBeforeSend: false } }
    })).reason,
    "unknown-provider"
  );
  assert.equal(
    (await bridge.handleAgentBridgeRequest({
      action: "startExchange",
      providerIds: ["chatgpt"],
      prompt: "q",
      providerOptions: { chatgpt: { surprise: true } }
    })).reason,
    "unknown-option-field"
  );
  assert.equal(
    (await bridge.handleAgentBridgeRequest({
      action: "startExchange",
      providerIds: ["chatgpt"],
      prompt: "q",
      options: { collectTimeoutMs: -1 }
    })).reason,
    "invalid-option-field"
  );
  assert.equal(
    (await bridge.handleAgentBridgeRequest({ action: "getExchangeStatus", exchangeId: "missing" })).reason,
    "exchange-not-found"
  );

  /* ---------- 主路径：两家并行，busy 信号快路径 + 文本稳定慢路径 ---------- */
  resetAll({
    targets: boundTargets,
    baselineTexts: {},
    probeQueues: {
      11: [
        { busy: true, signal: 'button[data-testid="stop-button"]' },
        { busy: false, text: "chatgpt final answer" }
      ],
      12: [
        { busy: false, text: "" },
        { busy: false, text: "gemini partial" },
        { busy: false, text: "gemini final answer" },
        { busy: false, text: "gemini final answer" }
      ]
    }
  });

  const started = await bridge.handleAgentBridgeRequest({
    action: "startExchange",
    requestId: "req-exchange-1",
    idempotencyKey: "idem-exchange-1",
    providerIds: ["chatgpt", "gemini"],
    prompt: "parallel question",
    options: { newChatSettleMs: 0 }
  });
  assert.equal(started.ok, true);
  assert.equal(started.status, "running");
  assert.ok(started.exchangeId);
  assert.equal(started.providers.length, 2);
  assert.deepEqual(openCalls, [["chatgpt", "gemini"]]);

  // 等两条 chain 都送达（sent），发送应并行发生且互不阻塞
  await waitFor(() => sendCalls.length === 2, { label: "both provider sends" });
  assert.deepEqual(new Set(sendCalls.map((call) => call.siteIds[0])), new Set(["chatgpt", "gemini"]));
  assert.deepEqual(new Set(newChatCalls), new Set(["chatgpt", "gemini"]));
  assert.equal(sendCalls.every((call) => call.source === "agent-bridge-exchange"), true);

  await waitFor(async () => {
    const snapshot = await bridge.handleAgentBridgeRequest({
      action: "getExchangeStatus",
      exchangeId: started.exchangeId
    });
    return snapshot.providers.every((provider) => ["sent", "generating", "stabilizing"].includes(provider.phase));
  }, { label: "providers reach sent" });

  // pump 1：chatgpt busy → generating；gemini 空文本 → 还在 sent
  let snapshot = await bridge.handleAgentBridgeRequest({ action: "getExchangeStatus", exchangeId: started.exchangeId });
  const byId = (snap, id) => snap.providers.find((provider) => provider.providerId === id);
  assert.equal(byId(snapshot, "chatgpt").phase, "generating");
  assert.equal(byId(snapshot, "chatgpt").generation.state, "generating");
  assert.equal(byId(snapshot, "chatgpt").generation.signal, 'button[data-testid="stop-button"]');
  assert.equal(byId(snapshot, "gemini").phase, "sent");

  // 采样间隔：立刻再 pump 不应推进（<1s）
  const immediate = await bridge.handleAgentBridgeRequest({ action: "getExchangeStatus", exchangeId: started.exchangeId });
  assert.equal(byId(immediate, "chatgpt").phase, "generating");

  const advanceSampleClocks = () => {
    for (const provider of exchangeModule._test.agentExchanges.get(started.exchangeId).providerIds) {
      const record = exchangeModule._test.agentExchanges.get(started.exchangeId).providers[provider];
      if (record.sample.sampledAtMs) record.sample.sampledAtMs -= 5000;
    }
  };

  // pump 2：chatgpt busy 消失 + 有新文本 → 快路径直接 completed；
  // gemini 首次出现候选文本 → stabilizing（第一次稳定采样）
  advanceSampleClocks();
  snapshot = await bridge.handleAgentBridgeRequest({ action: "getExchangeStatus", exchangeId: started.exchangeId });
  assert.equal(byId(snapshot, "chatgpt").phase, "completed");
  assert.equal(byId(snapshot, "chatgpt").text, "chatgpt final answer");
  assert.equal(byId(snapshot, "gemini").phase, "stabilizing");

  // pump 3：gemini 候选文本变化（还在长）→ 稳定计数重置，仍 stabilizing、无最终文本
  advanceSampleClocks();
  snapshot = await bridge.handleAgentBridgeRequest({ action: "getExchangeStatus", exchangeId: started.exchangeId });
  assert.equal(byId(snapshot, "gemini").phase, "stabilizing");
  assert.equal(byId(snapshot, "gemini").text, "");

  // pump 4：连续两次相同 → completed；exchange 收敛 completed
  advanceSampleClocks();
  snapshot = await bridge.handleAgentBridgeRequest({ action: "getExchangeStatus", exchangeId: started.exchangeId });
  assert.equal(byId(snapshot, "gemini").phase, "completed");
  assert.equal(byId(snapshot, "gemini").text, "gemini final answer");
  assert.equal(snapshot.status, "completed");
  assert.ok(snapshot.timestamps.completedAt);
  assert.equal(byId(snapshot, "chatgpt").timestamps.submittedAt !== "", true);
  assert.ok(Array.isArray(sessionStore.oa_agent_bridge_exchanges_v1));
  assert.equal(sessionStore.oa_agent_bridge_exchanges_v1[0].exchangeId, started.exchangeId);

  // 幂等：同 idempotencyKey 再 start → duplicateBlocked，不重发
  const duplicate = await bridge.handleAgentBridgeRequest({
    action: "startExchange",
    requestId: "req-exchange-1b",
    idempotencyKey: "idem-exchange-1",
    providerIds: ["chatgpt", "gemini"],
    prompt: "parallel question",
    options: { newChatSettleMs: 0 }
  });
  assert.equal(duplicate.duplicateBlocked, true);
  assert.equal(duplicate.exchangeId, started.exchangeId);
  assert.equal(sendCalls.length, 2, "duplicate startExchange must not resend");

  // health 摘要
  const health = await bridge.handleAgentBridgeRequest({ action: "health" });
  assert.equal(health.lastExchange.exchangeId, started.exchangeId);
  assert.equal(health.lastExchange.status, "completed");

  /* ---------- 旧答案拒收 + 超时 ---------- */
  resetAll({
    targets: boundTargets,
    baselineTexts: { chatgpt: "stale old answer" },
    probeQueues: {
      11: [{ busy: false, text: "stale old answer" }]
    }
  });
  const staleStarted = await bridge.handleAgentBridgeRequest({
    action: "startExchange",
    requestId: "req-exchange-stale",
    providerIds: ["chatgpt"],
    prompt: "stale question",
    options: { newChatSettleMs: 0, collectTimeoutMs: 60 }
  });
  await waitFor(() => sendCalls.length === 1, { label: "stale send" });
  await waitFor(async () => {
    const snap = await bridge.handleAgentBridgeRequest({ action: "getExchangeStatus", exchangeId: staleStarted.exchangeId });
    return ["sent", "generating", "stabilizing"].includes(snap.providers[0].phase);
  }, { label: "stale provider sent" });
  let staleSnap = await bridge.handleAgentBridgeRequest({ action: "getExchangeStatus", exchangeId: staleStarted.exchangeId });
  assert.notEqual(staleSnap.providers[0].phase, "completed", "baseline-matching text must not complete the provider");
  await new Promise((resolve) => setTimeout(resolve, 80));
  staleSnap = await bridge.handleAgentBridgeRequest({ action: "getExchangeStatus", exchangeId: staleStarted.exchangeId });
  assert.equal(staleSnap.providers[0].phase, "failed");
  assert.equal(staleSnap.providers[0].errorCode, "response-timeout");
  assert.equal(staleSnap.status, "completed");

  /* ---------- send 失败 ---------- */
  resetAll({
    targets: boundTargets,
    baselineTexts: {},
    sendFailedIds: ["chatgpt"],
    probeQueues: {}
  });
  const failStarted = await bridge.handleAgentBridgeRequest({
    action: "startExchange",
    requestId: "req-exchange-fail",
    providerIds: ["chatgpt"],
    prompt: "failing question",
    options: { newChatSettleMs: 0 }
  });
  await waitFor(async () => {
    const snap = await bridge.handleAgentBridgeRequest({ action: "getExchangeStatus", exchangeId: failStarted.exchangeId });
    return snap.providers[0].phase === "failed";
  }, { label: "send failure surfaces" });
  const failSnap = await bridge.handleAgentBridgeRequest({ action: "getExchangeStatus", exchangeId: failStarted.exchangeId });
  assert.equal(failSnap.providers[0].errorCode, "input-injection-failed");
  assert.equal(failSnap.status, "completed");

  /* ---------- 未绑定 tab ---------- */
  resetAll({ targets: {}, baselineTexts: {}, probeQueues: {} });
  const unboundStarted = await bridge.handleAgentBridgeRequest({
    action: "startExchange",
    requestId: "req-exchange-unbound",
    providerIds: ["chatgpt"],
    prompt: "unbound question",
    options: { newChatSettleMs: 0 }
  });
  await waitFor(async () => {
    const snap = await bridge.handleAgentBridgeRequest({ action: "getExchangeStatus", exchangeId: unboundStarted.exchangeId });
    return snap.providers[0].phase === "failed";
  }, { label: "unbound provider fails" });
  const unboundSnap = await bridge.handleAgentBridgeRequest({ action: "getExchangeStatus", exchangeId: unboundStarted.exchangeId });
  assert.equal(unboundSnap.providers[0].errorCode, "missing-tab");
  assert.equal(unboundSnap.providers[0].retryable, true);

  /* ---------- cancel ---------- */
  resetAll({
    targets: boundTargets,
    baselineTexts: {},
    probeQueues: { 11: [{ busy: true, signal: "unit" }] }
  });
  const cancelStarted = await bridge.handleAgentBridgeRequest({
    action: "startExchange",
    requestId: "req-exchange-cancel",
    providerIds: ["chatgpt"],
    prompt: "cancel question",
    options: { newChatSettleMs: 0 }
  });
  await waitFor(() => sendCalls.length === 1, { label: "cancel target send" });
  const cancelled = await bridge.handleAgentBridgeRequest({ action: "cancelExchange", exchangeId: cancelStarted.exchangeId });
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.providers[0].phase, "cancelled");
  const cancelledAgain = await bridge.handleAgentBridgeRequest({ action: "getExchangeStatus", exchangeId: cancelStarted.exchangeId });
  assert.equal(cancelledAgain.status, "cancelled");

  /* ---------- SW 重启语义：pre-send 停滞 + chain 不在 → chain-stalled ---------- */
  resetAll({ targets: boundTargets, baselineTexts: {}, probeQueues: {} });
  const stallStarted = await bridge.handleAgentBridgeRequest({
    action: "startExchange",
    requestId: "req-exchange-stall",
    providerIds: ["chatgpt"],
    prompt: "stall question",
    options: { newChatSettleMs: 0 }
  });
  await waitFor(() => sendCalls.length === 1, { label: "stall send" });
  {
    const record = exchangeModule._test.agentExchanges.get(stallStarted.exchangeId);
    const provider = record.providers.chatgpt;
    // 人为退回 pre-send 阶段并抹掉 chain（模拟 SW 重启后 hydrate 的状态）
    provider.phase = "sending";
    provider.phaseUpdatedAtMs = Date.now() - 60000;
    exchangeModule._test.agentExchangeChains.clear();
  }
  const stalledSnap = await bridge.handleAgentBridgeRequest({ action: "getExchangeStatus", exchangeId: stallStarted.exchangeId });
  assert.equal(stalledSnap.providers[0].phase, "failed");
  assert.equal(stalledSnap.providers[0].errorCode, "chain-stalled");
  assert.equal(stalledSnap.providers[0].retryable, true);

  /* ---------- 可见性 nudge：发送后久无候选文本 → 把 tab 带前台一次 ---------- */
  resetAll({
    targets: boundTargets,
    baselineTexts: {},
    probeQueues: { 11: [{ busy: true, signal: "unit-busy" }] }
  });
  const nudgeStarted = await bridge.handleAgentBridgeRequest({
    action: "startExchange",
    requestId: "req-exchange-nudge",
    providerIds: ["chatgpt"],
    prompt: "nudge question",
    options: { newChatSettleMs: 0 }
  });
  await waitFor(() => sendCalls.length === 1, { label: "nudge send" });
  await waitFor(async () => {
    const snap = await bridge.handleAgentBridgeRequest({ action: "getExchangeStatus", exchangeId: nudgeStarted.exchangeId });
    return ["sent", "generating", "stabilizing"].includes(snap.providers[0].phase);
  }, { label: "nudge provider sent" });
  assert.equal(nudgeCalls.length, 0, "no nudge before threshold");
  {
    const record = exchangeModule._test.agentExchanges.get(nudgeStarted.exchangeId);
    record.providers.chatgpt.submittedAtMs -= 40000;
    record.providers.chatgpt.sample.sampledAtMs = 0;
  }
  await bridge.handleAgentBridgeRequest({ action: "getExchangeStatus", exchangeId: nudgeStarted.exchangeId });
  assert.deepEqual(nudgeCalls.map((c) => c.kind), ["tab", "window"], "stuck provider should get one visibility nudge");
  assert.equal(nudgeCalls[0].tabId, 11);
  assert.equal(nudgeCalls[0].properties.active, true);
  {
    const record = exchangeModule._test.agentExchanges.get(nudgeStarted.exchangeId);
    record.providers.chatgpt.sample.sampledAtMs = 0;
  }
  await bridge.handleAgentBridgeRequest({ action: "getExchangeStatus", exchangeId: nudgeStarted.exchangeId });
  assert.equal(nudgeCalls.length, 2, "nudge fires at most once per provider per exchange");

  /* ---------- providerOptions：单家跳过 fresh ---------- */
  resetAll({
    targets: boundTargets,
    baselineTexts: {},
    probeQueues: {}
  });
  await bridge.handleAgentBridgeRequest({
    action: "startExchange",
    requestId: "req-exchange-provider-options",
    providerIds: ["chatgpt", "gemini"],
    prompt: "provider options question",
    options: { newChatSettleMs: 0 },
    providerOptions: { chatgpt: { newChatBeforeSend: false } }
  });
  await waitFor(() => sendCalls.length === 2, { label: "provider-options sends" });
  assert.deepEqual(newChatCalls, ["gemini"], "chatgpt should skip fresh conversation via providerOptions");

  /* ---------- background 装载检查 ---------- */
  const backgroundSource = fs.readFileSync(backgroundPath, "utf8");
  assert.match(backgroundSource, /"bg-agent-exchange\.js"/);

  console.log("agent-exchange validation passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
