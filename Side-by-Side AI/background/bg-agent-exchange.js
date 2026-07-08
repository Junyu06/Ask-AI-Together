"use strict";

/**
 * Agent bridge exchange：把「fresh → send → 监控生成 → 收文本」整体作为
 * extension 内的持久化状态机。providers 并行推进；调用方 startExchange 一次，
 * 之后 getExchangeStatus 轮询——每次轮询同时推进（pump）监控阶段，因此
 * MV3 service worker 被回收也不影响正确性（状态在 chrome.storage.session，
 * poll 即恢复）。prompt 原文只留在内存（metadata-only 隐私约定不变）。
 */

const AGENT_EXCHANGE_STORAGE = "oa_agent_bridge_exchanges_v1";
const AGENT_EXCHANGE_LIMIT = 20;
const AGENT_EXCHANGE_DEFAULT_COLLECT_TIMEOUT_MS = 180000;
const AGENT_EXCHANGE_MIN_SAMPLE_INTERVAL_MS = 1000;
const AGENT_EXCHANGE_STABLE_SAMPLES_REQUIRED = 2;
const AGENT_EXCHANGE_PRESEND_STALL_MS = 25000;
/* 发送后这么久还没有任何候选文本 → 把 provider tab 带到前台一次。
 * macOS 会把被完全遮挡的窗口打入后台暂停渲染（Gemini 的 A/B 评测实验在
 * hidden tab 上永远加载不出候选回复，实测带到前台立即渲染）。这套 Chrome
 * 是专用自动化实例，抢自己窗口的焦点没有副作用。 */
const AGENT_EXCHANGE_VISIBILITY_NUDGE_AFTER_MS = 30000;

const AGENT_EXCHANGE_TERMINAL_PHASES = new Set(["completed", "failed", "cancelled"]);
const AGENT_EXCHANGE_MONITOR_PHASES = new Set(["sent", "generating", "stabilizing"]);

const agentExchanges = new Map();
const agentExchangeIdempotencyIndex = new Map();
/** `${exchangeId}:${providerId}` -> in-flight chain promise（仅内存；SW 重启即消失） */
const agentExchangeChains = new Map();
let agentExchangesHydrated = false;

function exchangeChainKey(exchangeId, providerId) {
  return `${exchangeId}:${providerId}`;
}

async function hydrateAgentExchanges() {
  if (agentExchangesHydrated) return;
  agentExchangesHydrated = true;
  if (!chrome.storage?.session?.get) return;
  try {
    const data = await chrome.storage.session.get(AGENT_EXCHANGE_STORAGE);
    const stored = data?.[AGENT_EXCHANGE_STORAGE];
    if (!Array.isArray(stored)) return;
    for (const exchange of stored) {
      if (!exchange || typeof exchange !== "object" || !exchange.exchangeId) continue;
      rememberExchangeInMemory(exchange);
    }
  } catch (_error) {
    /* session persistence is best-effort */
  }
}

async function persistAgentExchanges() {
  if (!chrome.storage?.session?.set) return;
  try {
    await chrome.storage.session.set({
      [AGENT_EXCHANGE_STORAGE]: Array.from(agentExchanges.values())
    });
  } catch (_error) {
    /* session persistence is best-effort */
  }
}

function rememberExchangeInMemory(exchange) {
  agentExchanges.set(exchange.exchangeId, exchange);
  if (exchange.idempotencyKey) agentExchangeIdempotencyIndex.set(exchange.idempotencyKey, exchange.exchangeId);
  if (agentExchanges.size > AGENT_EXCHANGE_LIMIT) {
    const firstKey = agentExchanges.keys().next().value;
    const old = agentExchanges.get(firstKey);
    if (old?.idempotencyKey) agentExchangeIdempotencyIndex.delete(old.idempotencyKey);
    agentExchanges.delete(firstKey);
  }
}

function exchangeProviderNewChatBeforeSend(normalized, providerId) {
  const providerOption = normalized.providerOptions?.[providerId];
  if (providerOption && typeof providerOption.newChatBeforeSend === "boolean") {
    return providerOption.newChatBeforeSend;
  }
  return shouldNewChatBeforeSend(normalized.options);
}

function createExchangeProvider(providerId, newChatBeforeSend) {
  const createdAt = nowIso();
  return {
    providerId,
    phase: "pending",
    reason: "",
    errorCode: "",
    retryable: false,
    sendStatus: "",
    newChatBeforeSend,
    sawBusySignal: false,
    visibilityNudged: false,
    generation: { state: "unknown", signal: "", sampledAt: "" },
    baseline: { textHash: "", textLength: 0, baselineAt: "" },
    sample: { textHash: "", textLength: 0, stableCount: 0, sampledAt: "", sampledAtMs: 0 },
    text: "",
    textLength: 0,
    conversation: null,
    timestamps: {
      openedAt: "",
      freshAt: "",
      submittedAt: "",
      generatingAt: "",
      completedAt: "",
      failedAt: ""
    },
    submittedAtMs: 0,
    phaseUpdatedAt: createdAt,
    phaseUpdatedAtMs: Date.now()
  };
}

function createExchangeRecord(exchangeId, normalized) {
  const createdAt = nowIso();
  const prompt = String(normalized.prompt || "");
  const providers = {};
  for (const providerId of normalized.providerIds) {
    providers[providerId] = createExchangeProvider(
      providerId,
      exchangeProviderNewChatBeforeSend(normalized, providerId)
    );
  }
  return {
    exchangeId,
    requestId: normalized.requestId,
    idempotencyKey: normalized.idempotencyKey || "",
    status: "running",
    providerIds: normalized.providerIds.slice(),
    options: {
      newChatBeforeSend: shouldNewChatBeforeSend(normalized.options),
      newChatSettleMs: newChatSettleMsForOptions(normalized.options),
      collectTimeoutMs: readExchangeCollectTimeoutMs(normalized.options)
    },
    audit: {
      promptHash: stableHash(prompt),
      promptLength: prompt.length,
      historyMode: "metadata-only"
    },
    timestamps: {
      createdAt,
      updatedAt: createdAt,
      completedAt: "",
      cancelledAt: ""
    },
    providers
  };
}

function readExchangeCollectTimeoutMs(options = {}) {
  const value = Number(options.collectTimeoutMs);
  if (Number.isFinite(value) && value > 0) return Math.floor(value);
  return AGENT_EXCHANGE_DEFAULT_COLLECT_TIMEOUT_MS;
}

function setExchangeProviderPhase(exchange, providerId, phase, patch = {}) {
  const provider = exchange.providers[providerId];
  if (!provider) return null;
  provider.phase = phase;
  provider.phaseUpdatedAt = nowIso();
  provider.phaseUpdatedAtMs = Date.now();
  Object.assign(provider, patch);
  exchange.timestamps.updatedAt = provider.phaseUpdatedAt;
  return provider;
}

function setExchangeProviderFailed(exchange, providerId, errorCode, reason, { retryable = false } = {}) {
  const provider = exchange.providers[providerId];
  if (!provider || AGENT_EXCHANGE_TERMINAL_PHASES.has(provider.phase)) return;
  setExchangeProviderPhase(exchange, providerId, "failed", {
    errorCode: String(errorCode || "exchange-provider-failed"),
    reason: String(reason || errorCode || ""),
    retryable
  });
  provider.timestamps.failedAt = provider.phaseUpdatedAt;
}

function finalizeExchangeIfTerminal(exchange) {
  if (exchange.status !== "running") return false;
  const allTerminal = exchange.providerIds.every((providerId) =>
    AGENT_EXCHANGE_TERMINAL_PHASES.has(exchange.providers[providerId]?.phase));
  if (!allTerminal) return false;
  exchange.status = "completed";
  exchange.timestamps.completedAt = nowIso();
  exchange.timestamps.updatedAt = exchange.timestamps.completedAt;
  return true;
}

function publicExchangeProvider(provider) {
  if (!provider) return null;
  return JSON.parse(JSON.stringify(provider));
}

function exchangeSnapshotResponse(exchange, normalized) {
  return {
    ok: true,
    bridgeVersion: AGENT_BRIDGE_VERSION,
    action: normalized.action,
    requestId: normalized.requestId,
    exchangeId: exchange.exchangeId,
    status: exchange.status,
    providerIds: exchange.providerIds.slice(),
    options: { ...exchange.options },
    audit: { ...exchange.audit },
    timestamps: { ...exchange.timestamps },
    providers: exchange.providerIds.map((providerId) => publicExchangeProvider(exchange.providers[providerId]))
  };
}

function summarizeExchange(exchange) {
  if (!exchange) return null;
  return {
    exchangeId: exchange.exchangeId,
    status: exchange.status,
    providerPhases: exchange.providerIds.map((providerId) => ({
      providerId,
      phase: exchange.providers[providerId]?.phase || "unknown"
    })),
    timestamps: exchange.timestamps
  };
}

async function probeProviderGenerationState(tabId, providerId) {
  if (!Number.isInteger(tabId) || !chrome.scripting?.executeScript) {
    return { ok: false, reason: "scripting-unavailable" };
  }
  const busySelectors = Array.isArray(SITE_BUSY_SELECTORS?.[providerId])
    ? SITE_BUSY_SELECTORS[providerId]
    : [];
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: (selectors) => {
        function isElementVisible(el) {
          if (!el || typeof el.getBoundingClientRect !== "function") return false;
          const rect = el.getBoundingClientRect();
          if (!rect || rect.width <= 0 || rect.height <= 0) return false;
          const win = el.ownerDocument?.defaultView;
          const style = win?.getComputedStyle?.(el);
          return !style || (style.display !== "none" && style.visibility !== "hidden");
        }
        let busy = false;
        let signal = "";
        for (const selector of Array.isArray(selectors) ? selectors : []) {
          let nodes = [];
          try {
            nodes = document.querySelectorAll(selector);
          } catch (_e) {
            continue;
          }
          for (const node of nodes) {
            if (isElementVisible(node)) {
              busy = true;
              signal = selector;
              break;
            }
          }
          if (busy) break;
        }
        let text = "";
        let extracted = false;
        try {
          /* isolated world 与 manifest content scripts 同世界，可直接调其全局函数 */
          if (typeof extractLatestResponseText === "function") {
            text = String(extractLatestResponseText() || "");
            extracted = true;
          }
        } catch (_e) {
          /* extraction best-effort */
        }
        return { ok: true, busy, signal, extracted, text, textLength: text.length };
      },
      args: [busySelectors]
    });
    const value = results?.[0]?.result;
    if (!value || value.ok !== true) return { ok: false, reason: "probe-empty-result" };
    return value;
  } catch (error) {
    return { ok: false, reason: String(error?.message || error || "probe-failed") };
  }
}

async function probeProviderGenerationStateWithRecovery(tabId, providerId) {
  let probe = await probeProviderGenerationState(tabId, providerId);
  if (probe.ok && probe.extracted === false && typeof recoverCompatibilityContentRuntime === "function") {
    const recovered = await recoverCompatibilityContentRuntime(tabId).catch(() => false);
    if (recovered) probe = await probeProviderGenerationState(tabId, providerId);
  }
  return probe;
}

async function runExchangeProviderChain(exchange, providerId, prompt, context) {
  const entries = siteEntriesForProviderIds([providerId]);
  const provider = exchange.providers[providerId];
  if (!provider) return;

  setExchangeProviderPhase(exchange, providerId, "opening");
  const targets = await loadTargets();
  const rec = targets[providerId];
  if (!rec?.tabId) {
    setExchangeProviderFailed(exchange, providerId, "missing-tab", "provider tab not bound", { retryable: true });
    return;
  }
  provider.timestamps.openedAt = nowIso();
  if (exchange.status !== "running") return;

  if (provider.newChatBeforeSend) {
    setExchangeProviderPhase(exchange, providerId, "fresh-conversation");
    let outcome = null;
    try {
      outcome = await enqueueNewChatForSite(providerId, () => navigateTargetToNewChat(providerId, rec, entries));
    } catch (error) {
      setExchangeProviderFailed(exchange, providerId, "new-chat-failed", String(error?.message || error || ""), { retryable: true });
      return;
    }
    if (outcome?.ok === false) {
      setExchangeProviderFailed(exchange, providerId, outcome?.status || "new-chat-failed", outcome?.reason || outcome?.error || "", { retryable: true });
      return;
    }
    provider.timestamps.freshAt = nowIso();
    const settleMs = exchange.options.newChatSettleMs;
    if (settleMs > 0) await sleep(settleMs);
  }
  if (exchange.status !== "running") return;

  try {
    const baselineResult = await collectLastFromTargets([providerId], entries, context?.origin, null);
    const section = (baselineResult?.sections || []).find((item) => String(item?.siteId || "") === providerId) || {};
    const baselineText = String(section.text || "");
    provider.baseline = {
      textHash: baselineText ? stableHash(baselineText) : "",
      textLength: baselineText.length,
      baselineAt: nowIso()
    };
  } catch (_error) {
    /* baseline best-effort：拿不到就按空 baseline（fresh 会话本来就该是空） */
  }
  if (exchange.status !== "running") return;

  setExchangeProviderPhase(exchange, providerId, "sending");
  await persistAgentExchanges();
  let result = null;
  try {
    result = await sendPromptToTargets(
      [providerId],
      prompt,
      `${exchange.requestId}:${providerId}:send`,
      entries,
      [],
      context?.origin,
      null,
      { historyMode: "metadata-only", source: "agent-bridge-exchange" }
    );
  } catch (error) {
    setExchangeProviderFailed(exchange, providerId, "send-failed", String(error?.message || error || ""));
    return;
  }
  const outcome = outcomeForProvider(result, providerId) || {};
  if (result?.ok === false || outcome?.ok === false) {
    setExchangeProviderFailed(
      exchange,
      providerId,
      outcome?.status || result?.status || "send-failed",
      outcome?.reason || outcome?.error || result?.reason || result?.error || ""
    );
    return;
  }
  provider.timestamps.submittedAt = nowIso();
  provider.submittedAtMs = Date.now();
  setExchangeProviderPhase(exchange, providerId, "sent", {
    sendStatus: outcome?.status || "send-submitted"
  });
}

function launchExchangeProviderChain(exchange, providerId, prompt, context) {
  const key = exchangeChainKey(exchange.exchangeId, providerId);
  const chain = runExchangeProviderChain(exchange, providerId, prompt, context)
    .catch((error) => {
      setExchangeProviderFailed(exchange, providerId, "chain-error", String(error?.message || error || ""));
    })
    .finally(() => {
      agentExchangeChains.delete(key);
      finalizeExchangeIfTerminal(exchange);
      void persistAgentExchanges();
    });
  agentExchangeChains.set(key, chain);
  return chain;
}

async function pumpExchangeProvider(exchange, providerId, targets, nowMs) {
  const provider = exchange.providers[providerId];
  if (!provider || AGENT_EXCHANGE_TERMINAL_PHASES.has(provider.phase)) return false;

  if (!AGENT_EXCHANGE_MONITOR_PHASES.has(provider.phase)) {
    /* pre-send 阶段：chain 活着就等；chain 丢了（SW 重启）且停滞 → fail-closed，
     * 不盲目重发（send 不幂等，double-send 比失败更糟）。 */
    const chainAlive = agentExchangeChains.has(exchangeChainKey(exchange.exchangeId, providerId));
    const stalledMs = nowMs - (provider.phaseUpdatedAtMs || nowMs);
    if (!chainAlive && stalledMs > AGENT_EXCHANGE_PRESEND_STALL_MS) {
      setExchangeProviderFailed(
        exchange,
        providerId,
        "chain-stalled",
        "provider chain not running (service worker restarted?)",
        { retryable: true }
      );
      return true;
    }
    return false;
  }

  const collectTimeoutMs = exchange.options.collectTimeoutMs;
  const submittedAtMs = provider.submittedAtMs || provider.phaseUpdatedAtMs || nowMs;
  if (nowMs - submittedAtMs > collectTimeoutMs) {
    setExchangeProviderFailed(exchange, providerId, "response-timeout", `no stable response within ${collectTimeoutMs}ms`);
    return true;
  }

  if (provider.sample.sampledAtMs && nowMs - provider.sample.sampledAtMs < AGENT_EXCHANGE_MIN_SAMPLE_INTERVAL_MS) {
    return false;
  }

  const rec = targets[providerId];
  if (!rec?.tabId) {
    setExchangeProviderFailed(exchange, providerId, "missing-tab", "provider tab lost during exchange");
    return true;
  }

  if (
    !provider.visibilityNudged
    && !provider.text
    && nowMs - submittedAtMs > AGENT_EXCHANGE_VISIBILITY_NUDGE_AFTER_MS
  ) {
    provider.visibilityNudged = true;
    try {
      await chrome.tabs.update(rec.tabId, { active: true });
    } catch (_error) { /* best-effort */ }
    try {
      if (rec.windowId != null) await chrome.windows.update(rec.windowId, { focused: true });
    } catch (_error) { /* best-effort */ }
  }

  const probe = await probeProviderGenerationStateWithRecovery(rec.tabId, providerId);
  const sampledAt = nowIso();
  if (!probe.ok) {
    /* 瞬时探测失败：记录后等下一轮（deadline 兜底） */
    provider.generation = { state: "unknown", signal: "", reason: probe.reason || "probe-failed", sampledAt };
    return true;
  }

  provider.generation = { state: probe.busy ? "generating" : "idle", signal: probe.signal || "", sampledAt };
  provider.sample.sampledAt = sampledAt;
  provider.sample.sampledAtMs = nowMs;
  const text = String(probe.text || "");
  const textHash = text ? stableHash(text) : "";
  provider.sample.textLength = text.length;

  if (probe.busy) {
    provider.sawBusySignal = true;
    provider.sample.textHash = textHash;
    provider.sample.stableCount = 0;
    if (provider.phase !== "generating") {
      setExchangeProviderPhase(exchange, providerId, "generating");
    }
    if (!provider.timestamps.generatingAt) provider.timestamps.generatingAt = sampledAt;
    return true;
  }

  const isCandidate = Boolean(text)
    && textHash !== provider.baseline.textHash
    && !isAgentBridgePlaceholderResponse(text);

  if (!isCandidate) {
    if (textHash !== provider.sample.textHash) {
      provider.sample.textHash = textHash;
      provider.sample.stableCount = 0;
      if (text && provider.phase === "sent") {
        setExchangeProviderPhase(exchange, providerId, "generating");
        if (!provider.timestamps.generatingAt) provider.timestamps.generatingAt = sampledAt;
      }
    }
    return true;
  }

  if (textHash === provider.sample.textHash) {
    provider.sample.stableCount += 1;
  } else {
    provider.sample.textHash = textHash;
    provider.sample.stableCount = 1;
    if (provider.phase !== "stabilizing") {
      setExchangeProviderPhase(exchange, providerId, "stabilizing");
    }
  }

  /* 快路径：这个 exchange 里见过明确 busy 信号（stop 按钮/streaming attr），
   * 信号消失 + 有新内容即可判完成；否则要求连续稳定采样，抗 selector 漂移。 */
  const stableEnough = provider.sawBusySignal
    ? provider.sample.stableCount >= 1
    : provider.sample.stableCount >= AGENT_EXCHANGE_STABLE_SAMPLES_REQUIRED;

  if (stableEnough) {
    provider.text = text;
    provider.textLength = text.length;
    provider.conversation = await conversationForProviderAfterAction(providerId);
    provider.timestamps.completedAt = sampledAt;
    setExchangeProviderPhase(exchange, providerId, "completed");
  }
  return true;
}

async function pumpExchange(exchange, _context) {
  if (exchange.status !== "running") return;
  const nowMs = Date.now();
  const targets = await loadTargets();
  const changes = await Promise.all(
    exchange.providerIds.map((providerId) =>
      pumpExchangeProvider(exchange, providerId, targets, nowMs).catch(() => false))
  );
  let changed = changes.some(Boolean);
  if (finalizeExchangeIfTerminal(exchange)) changed = true;
  if (changed) {
    exchange.timestamps.updatedAt = nowIso();
    await persistAgentExchanges();
  }
}

async function bridgeStartExchange(normalized, context) {
  await hydrateAgentExchanges();

  if (normalized.idempotencyKey && agentExchangeIdempotencyIndex.has(normalized.idempotencyKey)) {
    const existing = agentExchanges.get(agentExchangeIdempotencyIndex.get(normalized.idempotencyKey));
    if (existing) {
      return {
        ...exchangeSnapshotResponse(existing, normalized),
        duplicateBlocked: true,
        reason: "duplicate-exchange-blocked"
      };
    }
  }

  const exchangeId = `exchange-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const exchange = createExchangeRecord(exchangeId, normalized);
  rememberExchangeInMemory(exchange);
  await persistAgentExchanges();

  try {
    await openOrReuseWindows(siteEntriesForProviderIds(exchange.providerIds), {
      origin: context?.origin,
      skipFocusChain: true
    });
  } catch (_error) {
    /* per-provider chain 会各自判定 missing-tab */
  }

  for (const providerId of exchange.providerIds) {
    launchExchangeProviderChain(exchange, providerId, normalized.prompt, context);
  }

  return exchangeSnapshotResponse(exchange, normalized);
}

async function bridgeGetExchangeStatus(normalized, context) {
  await hydrateAgentExchanges();
  const exchange = agentExchanges.get(normalized.exchangeId);
  if (!exchange) {
    return failClosed("exchange-not-found", {
      action: normalized.action,
      requestId: normalized.requestId,
      exchangeId: normalized.exchangeId
    });
  }
  await pumpExchange(exchange, context);
  return exchangeSnapshotResponse(exchange, normalized);
}

async function bridgeCancelExchange(normalized) {
  await hydrateAgentExchanges();
  const exchange = agentExchanges.get(normalized.exchangeId);
  if (!exchange) {
    return failClosed("exchange-not-found", {
      action: normalized.action,
      requestId: normalized.requestId,
      exchangeId: normalized.exchangeId
    });
  }
  if (exchange.status === "running") {
    exchange.status = "cancelled";
    exchange.timestamps.cancelledAt = nowIso();
    exchange.timestamps.updatedAt = exchange.timestamps.cancelledAt;
    for (const providerId of exchange.providerIds) {
      const provider = exchange.providers[providerId];
      if (!provider || AGENT_EXCHANGE_TERMINAL_PHASES.has(provider.phase)) continue;
      setExchangeProviderPhase(exchange, providerId, "cancelled", {
        reason: "exchange-cancelled",
        retryable: false
      });
    }
    await persistAgentExchanges();
  }
  return exchangeSnapshotResponse(exchange, normalized);
}

function lastAgentExchangeSummary() {
  const last = Array.from(agentExchanges.values()).at(-1) || null;
  return summarizeExchange(last);
}

function resetAgentExchangeStateForTest() {
  agentExchanges.clear();
  agentExchangeIdempotencyIndex.clear();
  agentExchangeChains.clear();
  agentExchangesHydrated = false;
}

globalThis.AskAiTogetherAgentExchange = {
  bridgeStartExchange,
  bridgeGetExchangeStatus,
  bridgeCancelExchange,
  lastAgentExchangeSummary,
  probeProviderGenerationState,
  _test: {
    resetAgentExchangeStateForTest,
    pumpExchange,
    agentExchanges,
    agentExchangeChains
  }
};
