"use strict";

const AGENT_BRIDGE_VERSION = "agent-bridge-mvp-v1";
const AGENT_BRIDGE_PROVIDER_ALLOWLIST = Object.freeze(["chatgpt", "grok", "gemini", "claude"]);
const AGENT_BRIDGE_ACTIONS = new Set([
  "health",
  "getCapabilities",
  "openOrBindTargets",
  "sendAll",
  "collectAll",
  "getRunState",
  "cancelRun"
]);
const AGENT_BRIDGE_PAYLOAD_FIELDS = new Set([
  "action",
  "requestId",
  "runId",
  "idempotencyKey",
  "providerIds",
  "prompt",
  "options"
]);
const AGENT_BRIDGE_OPTION_FIELDS = new Set(["timeoutMs", "deadlineMs", "poll", "newChatBeforeSend", "newChatSettleMs"]);
const AGENT_BRIDGE_NEW_CHAT_TIMEOUT_MS = 5000;
const AGENT_BRIDGE_NEW_CHAT_DEFAULT_SETTLE_MS = 2000;
const AGENT_BRIDGE_NEW_CHAT_MAX_SETTLE_MS = 5000;
const AGENT_BRIDGE_FORBIDDEN_KEYS = new Set([
  "attachment",
  "attachments",
  "file",
  "files",
  "blob",
  "blobs",
  "image",
  "images",
  "html",
  "dom",
  "selector",
  "selectors",
  "cookie",
  "cookies",
  "profile",
  "storage",
  "storageExport",
  "rawTranscript",
  "repoPath",
  "vaultPath",
  "memoryDump",
  "hermesMemoryDump"
]);
const AGENT_BRIDGE_RUNS_STORAGE = "oa_agent_bridge_runs_v1";
const AGENT_BRIDGE_RUN_LIMIT = 50;

const agentBridgeRuns = new Map();
const agentBridgeIdempotencyIndex = new Map();
let agentBridgeRunsHydrated = false;

function nowIso() {
  return new Date().toISOString();
}

function stableHash(value) {
  const text = String(value || "");
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32:${hash.toString(16).padStart(8, "0")}`;
}

function isPlainObject(value) {
  if (!value || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function looksLikeFilePayload(value) {
  if (!value || typeof value !== "object") return false;
  const tag = Object.prototype.toString.call(value);
  if (/\[(File|Blob|FileList)\]/.test(tag)) return true;
  return typeof value.arrayBuffer === "function" && typeof value.type === "string";
}

function containsForbiddenPayload(value, path = []) {
  if (looksLikeFilePayload(value)) return `forbidden-file-payload:${path.join(".") || "payload"}`;
  if (!value || typeof value !== "object") return "";
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const nested = containsForbiddenPayload(value[i], path.concat(String(i)));
      if (nested) return nested;
    }
    return "";
  }
  for (const key of Object.keys(value)) {
    if (AGENT_BRIDGE_FORBIDDEN_KEYS.has(key)) return `forbidden-field:${path.concat(key).join(".")}`;
    const nested = containsForbiddenPayload(value[key], path.concat(key));
    if (nested) return nested;
  }
  return "";
}

function normalizeProviderIds(providerIds) {
  const ids = Array.isArray(providerIds) && providerIds.length
    ? providerIds.map((id) => String(id || "").trim()).filter(Boolean)
    : AGENT_BRIDGE_PROVIDER_ALLOWLIST.slice();
  return [...new Set(ids)];
}

function siteEntriesForProviderIds(providerIds) {
  return providerIds.map((providerId) => ({
    siteId: providerId,
    url: BUILTIN_SITE_URLS[providerId] || ""
  }));
}

function failClosed(reason, fields = {}) {
  return {
    ok: false,
    status: "rejected",
    bridgeVersion: AGENT_BRIDGE_VERSION,
    reason,
    ...fields
  };
}

function isAuthorizedAgentBridgeSender(context = {}) {
  const sender = context.sender;
  if (!sender) return true;
  if (sender.id && chrome.runtime.id && sender.id !== chrome.runtime.id) return false;
  const senderUrl = String(sender.url || sender.origin || "");
  const extensionUrl = chrome.runtime.getURL("");
  if (senderUrl && senderUrl.startsWith(extensionUrl)) return true;
  if (sender.tab) return false;
  if (!senderUrl) return true;
  return false;
}

function validateAgentBridgePayload(rawPayload) {
  if (!isPlainObject(rawPayload)) return failClosed("payload-must-be-object");
  for (const key of Object.keys(rawPayload)) {
    if (!AGENT_BRIDGE_PAYLOAD_FIELDS.has(key)) return failClosed("unknown-field", { field: key });
  }
  const forbidden = containsForbiddenPayload(rawPayload);
  if (forbidden) return failClosed(forbidden);

  const action = String(rawPayload.action || "").trim();
  if (!AGENT_BRIDGE_ACTIONS.has(action)) return failClosed("unknown-action", { action });

  const options = rawPayload.options;
  if (options != null) {
    if (!isPlainObject(options)) return failClosed("options-must-be-object");
    for (const key of Object.keys(options)) {
      if (!AGENT_BRIDGE_OPTION_FIELDS.has(key)) return failClosed("unknown-option-field", { field: `options.${key}` });
    }
    if (options.newChatBeforeSend != null && typeof options.newChatBeforeSend !== "boolean") {
      return failClosed("invalid-option-field", { field: "options.newChatBeforeSend" });
    }
    if (options.newChatSettleMs != null) {
      const settleMs = Number(options.newChatSettleMs);
      if (!Number.isFinite(settleMs) || settleMs < 0) {
        return failClosed("invalid-option-field", { field: "options.newChatSettleMs" });
      }
    }
  }

  const providerIds = normalizeProviderIds(rawPayload.providerIds);
  const unknownProvider = providerIds.find((providerId) => !AGENT_BRIDGE_PROVIDER_ALLOWLIST.includes(providerId));
  if (unknownProvider) return failClosed("unknown-provider", { providerId: unknownProvider });

  if (action === "sendAll") {
    const prompt = String(rawPayload.prompt || "");
    if (!prompt.trim()) return failClosed("prompt-required");
  }

  return {
    ok: true,
    action,
    requestId: String(rawPayload.requestId || `agent-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`),
    runId: String(rawPayload.runId || rawPayload.requestId || `run-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`),
    idempotencyKey: String(rawPayload.idempotencyKey || ""),
    providerIds,
    prompt: String(rawPayload.prompt || ""),
    options: options || {}
  };
}

function createProviderEnvelope(run, providerId, patch = {}) {
  const baseline = run.baselines?.[providerId] || {};
  const text = typeof patch.text === "string" ? patch.text : "";
  const answerHash = text ? stableHash(text) : "";
  return {
    providerId,
    requestId: run.requestId,
    runId: run.runId,
    providerRunId: `${run.runId}:${providerId}`,
    idempotencyKey: run.idempotencyKey,
    sendPhase: "not-started",
    visibilityPhase: "visibility-unknown",
    collectPhase: "not-collected",
    freshness: "unknown",
    counted: false,
    retryable: true,
    text,
    reason: "",
    timestamps: {
      newChatStartedAt: "",
      newChatCompletedAt: "",
      baselineAt: baseline.baselineAt || "",
      submittedAt: "",
      visibleAt: "",
      collectedAt: ""
    },
    audit: {
      promptHash: run.audit.promptHash,
      newChatBeforeSend: null,
      newChatStatus: "",
      newChatReason: "",
      preSendLatestHash: baseline.preSendLatestHash || "",
      answerHash,
      answerLength: text.length,
      errorCategory: null
    },
    ...patch
  };
}

function createRunEnvelope(fields) {
  const createdAt = nowIso();
  const prompt = String(fields.prompt || "");
  const providerResults = fields.providerIds.map((providerId) => createProviderEnvelope({
    requestId: fields.requestId,
    runId: fields.runId,
    idempotencyKey: fields.idempotencyKey,
    audit: {
      promptHash: stableHash(prompt),
      promptLength: prompt.length
    },
    baselines: {}
  }, providerId));
  return {
    ok: true,
    bridgeVersion: AGENT_BRIDGE_VERSION,
    status: "created",
    requestId: fields.requestId,
    runId: fields.runId,
    idempotencyKey: fields.idempotencyKey,
    providerIds: fields.providerIds.slice(),
    providerResults,
    timestamps: {
      createdAt,
      updatedAt: createdAt,
      submittedAt: "",
      collectedAt: "",
      cancelledAt: ""
    },
    audit: {
      promptHash: stableHash(prompt),
      promptLength: prompt.length,
      historyMode: "metadata-only"
    },
    baselines: {}
  };
}

function cloneRunEnvelope(run) {
  return JSON.parse(JSON.stringify(run));
}

function summarizeRun(run) {
  if (!run) return null;
  return {
    runId: run.runId,
    idempotencyKey: run.idempotencyKey,
    status: run.status,
    providerIds: run.providerIds,
    timestamps: run.timestamps,
    countedCount: run.providerResults.filter((provider) => provider.counted).length
  };
}

function setProviderResult(run, providerId, patch) {
  const index = run.providerResults.findIndex((provider) => provider.providerId === providerId);
  const current = index >= 0 ? run.providerResults[index] : createProviderEnvelope(run, providerId);
  const next = {
    ...current,
    ...patch,
    timestamps: {
      ...current.timestamps,
      ...(patch.timestamps || {})
    },
    audit: {
      ...current.audit,
      ...(patch.audit || {})
    }
  };
  if (index >= 0) run.providerResults[index] = next;
  else run.providerResults.push(next);
  run.timestamps.updatedAt = nowIso();
  return next;
}

function outcomeForProvider(outcome, providerId) {
  if (Array.isArray(outcome?.outcomes)) {
    return outcome.outcomes.find((item) => String(item?.providerId || item?.siteId || "") === providerId) || null;
  }
  return outcome || null;
}

function sendPhaseFromOutcome(outcome) {
  const status = String(outcome?.status || "");
  if (status === "send-ack-timeout") return "send-ack-timeout";
  if (outcome?.ok === false) return "send-failed";
  if (status === "send-submitted" || status === "response-found" || status === "partial-success" || !status) {
    return "send-submitted";
  }
  return status.startsWith("send-") ? status : "send-submitted";
}

function collectPhaseFromSection(section) {
  const status = String(section?.status || "");
  if (status === "response-found") return "response-found";
  if (status === "response-empty") return "response-empty";
  if (status === "transport-failed") return "transport-failed";
  if (status === "extraction-timeout") return "extraction-timeout";
  return section?.text ? "response-found" : "response-empty";
}

function agentBridgeDelay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function shouldNewChatBeforeSend(options = {}) {
  return options.newChatBeforeSend !== false;
}

function newChatSettleMsForOptions(options = {}) {
  if (options.newChatSettleMs == null) return AGENT_BRIDGE_NEW_CHAT_DEFAULT_SETTLE_MS;
  return Math.min(Math.floor(Number(options.newChatSettleMs)), AGENT_BRIDGE_NEW_CHAT_MAX_SETTLE_MS);
}

async function runWithAgentBridgeTimeout(work, timeoutMs, reason) {
  let timeoutId = 0;
  const timeout = new Promise((resolve) => {
    timeoutId = setTimeout(() => resolve({ timedOut: true, reason }), timeoutMs);
  });
  try {
    const result = await Promise.race([
      Promise.resolve().then(work).then((value) => ({ timedOut: false, value })),
      timeout
    ]);
    return result;
  } catch (error) {
    return {
      timedOut: false,
      error,
      reason: String(error?.message || error || reason)
    };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function newChatPhaseFromOutcome(outcome, fallbackPhase) {
  if (!outcome) return fallbackPhase;
  const status = String(outcome.status || "");
  if (outcome.ok === false) return status || "new-chat-failed";
  if (!status || status === "response-found" || status === "response-empty") return "new-chat-submitted";
  return status;
}

function newChatOutcomeSucceeded(outcome) {
  if (!outcome) return false;
  if (outcome.ok === false) return false;
  const status = String(outcome.status || "");
  return ![
    "transport-failed",
    "runtime-not-ready",
    "new-chat-failed",
    "provider-not-found",
    "capability-unsupported"
  ].includes(status);
}

function markNewChatForRun(run, phase, fields = {}) {
  const completedAt = fields.completedAt || "";
  const startedAt = fields.startedAt || "";
  const reason = fields.reason || "";
  run.audit.newChatBeforeSend = fields.beforeSend;
  run.audit.newChatStatus = phase;
  run.audit.newChatReason = reason;
  for (const providerId of run.providerIds) {
    const providerOutcome = outcomeForProvider(fields.result, providerId);
    const providerPhase = newChatPhaseFromOutcome(providerOutcome, phase);
    const providerReason = providerOutcome?.reason || providerOutcome?.error || reason;
    setProviderResult(run, providerId, {
      newChatPhase: providerPhase,
      reason: providerReason || "",
      timestamps: {
        newChatStartedAt: startedAt,
        newChatCompletedAt: completedAt
      },
      audit: {
        newChatBeforeSend: fields.beforeSend,
        newChatStatus: providerPhase,
        newChatReason: providerReason || ""
      }
    });
  }
}

async function newChatBeforeSendForRun(run, normalized, entries, origin) {
  if (!shouldNewChatBeforeSend(normalized.options)) {
    markNewChatForRun(run, "skipped", {
      beforeSend: false,
      reason: "disabled-by-option"
    });
    return { ok: true, status: "skipped", reason: "disabled-by-option" };
  }

  const startedAt = nowIso();
  markNewChatForRun(run, "new-chat-started", {
    beforeSend: true,
    startedAt
  });

  const outcome = await runWithAgentBridgeTimeout(
    () => newChatOnTargets(run.providerIds, entries, origin, null),
    AGENT_BRIDGE_NEW_CHAT_TIMEOUT_MS,
    "new-chat-timeout"
  );
  const completedAt = nowIso();

  if (outcome.timedOut) {
    const reason = outcome.reason || "new-chat-timeout";
    markNewChatForRun(run, "new-chat-timeout", {
      beforeSend: true,
      startedAt,
      completedAt,
      reason
    });
    return { ok: false, status: "new-chat-timeout", reason };
  }

  if (outcome.error) {
    const reason = outcome.reason || "new-chat-failed";
    markNewChatForRun(run, "new-chat-failed", {
      beforeSend: true,
      startedAt,
      completedAt,
      reason
    });
    return { ok: false, status: "new-chat-failed", reason };
  }

  const result = outcome.value || {};
  const hasProviderOutcomes = Array.isArray(result?.outcomes);
  const failedProviderId = run.providerIds.find((providerId) => {
    const providerOutcome = hasProviderOutcomes ? outcomeForProvider(result, providerId) : null;
    return !newChatOutcomeSucceeded(providerOutcome);
  });
  const failedProvider = failedProviderId ? outcomeForProvider(result, failedProviderId) : null;
  const phase = result?.ok === false || !hasProviderOutcomes || failedProvider ? "new-chat-failed" : "new-chat-submitted";
  const reason = result?.reason || result?.error || failedProvider?.reason || failedProvider?.error || (!hasProviderOutcomes ? "new-chat-outcomes-missing" : "");
  markNewChatForRun(run, phase, {
    beforeSend: true,
    startedAt,
    completedAt,
    reason,
    result
  });

  if (phase === "new-chat-failed") {
    return { ok: false, status: "new-chat-failed", reason: reason || "new-chat-failed" };
  }

  const settleMs = newChatSettleMsForOptions(normalized.options);
  if (settleMs > 0) await agentBridgeDelay(settleMs);
  return { ok: true, status: phase, reason: "" };
}

function findRunByRequest(normalized) {
  if (normalized.runId && agentBridgeRuns.has(normalized.runId)) return agentBridgeRuns.get(normalized.runId);
  if (normalized.idempotencyKey && agentBridgeIdempotencyIndex.has(normalized.idempotencyKey)) {
    return agentBridgeRuns.get(agentBridgeIdempotencyIndex.get(normalized.idempotencyKey)) || null;
  }
  return null;
}

function rememberRunInMemory(run) {
  agentBridgeRuns.set(run.runId, run);
  if (run.idempotencyKey) agentBridgeIdempotencyIndex.set(run.idempotencyKey, run.runId);
  if (agentBridgeRuns.size > AGENT_BRIDGE_RUN_LIMIT) {
    const firstKey = agentBridgeRuns.keys().next().value;
    const old = agentBridgeRuns.get(firstKey);
    if (old?.idempotencyKey) agentBridgeIdempotencyIndex.delete(old.idempotencyKey);
    agentBridgeRuns.delete(firstKey);
  }
}

function rememberRun(run) {
  rememberRunInMemory(run);
}

async function hydrateAgentBridgeRuns() {
  if (agentBridgeRunsHydrated) return;
  agentBridgeRunsHydrated = true;
  if (!chrome.storage?.session?.get) return;
  try {
    const data = await chrome.storage.session.get(AGENT_BRIDGE_RUNS_STORAGE);
    const storedRuns = data?.[AGENT_BRIDGE_RUNS_STORAGE];
    if (!Array.isArray(storedRuns)) return;
    for (const run of storedRuns) {
      if (!run || typeof run !== "object" || !run.runId) continue;
      rememberRunInMemory(run);
    }
  } catch (_error) {
    /* session persistence is best-effort; the bridge stays fail-closed per request */
  }
}

async function persistAgentBridgeRuns() {
  if (!chrome.storage?.session?.set) return;
  try {
    await chrome.storage.session.set({
      [AGENT_BRIDGE_RUNS_STORAGE]: Array.from(agentBridgeRuns.values())
    });
  } catch (_error) {
    /* session persistence is best-effort */
  }
}

async function baselineForRun(run, origin) {
  const entries = siteEntriesForProviderIds(run.providerIds);
  let result = null;
  try {
    result = await collectLastFromTargets(run.providerIds, entries, origin, null);
  } catch (error) {
    result = {
      ok: false,
      sections: [],
      reason: String(error?.message || error || "baseline-collection-failed")
    };
  }
  const baselineAt = nowIso();
  for (const providerId of run.providerIds) {
    const section = (result.sections || []).find((item) => String(item?.siteId || "") === providerId) || {};
    const text = String(section.text || "");
    const status = String(section.status || (result.ok === false ? "transport-failed" : ""));
    const baselineConfirmed = status === "response-found" || status === "response-empty";
    run.baselines[providerId] = {
      baselineAt,
      baselineConfirmed,
      baselineStatus: status || "unknown",
      baselineReason: section.reason || result.reason || "",
      preSendLatestHash: text ? stableHash(text) : "",
      preSendReplyCount: text ? 1 : 0,
      preSendLatestLength: text.length,
      conversationKey: providerId
    };
    setProviderResult(run, providerId, {
      reason: baselineConfirmed ? "" : (section.reason || result.reason || "baseline-unconfirmed"),
      timestamps: { baselineAt },
      audit: {
        baselineStatus: status || "unknown",
        preSendLatestHash: run.baselines[providerId].preSendLatestHash
      }
    });
  }
}

async function bridgeHealth(normalized) {
  const targets = await loadTargets();
  const manifest = chrome.runtime.getManifest();
  const lastRun = Array.from(agentBridgeRuns.values()).at(-1) || null;
  return {
    ok: true,
    bridgeVersion: AGENT_BRIDGE_VERSION,
    action: normalized.action,
    requestId: normalized.requestId,
    extension: {
      id: chrome.runtime.id || "",
      version: manifest?.version || "",
      name: manifest?.name || ""
    },
    providerAllowlist: AGENT_BRIDGE_PROVIDER_ALLOWLIST.slice(),
    targetTabs: AGENT_BRIDGE_PROVIDER_ALLOWLIST.map((providerId) => ({
      providerId,
      bound: Boolean(targets[providerId]?.tabId),
      windowId: targets[providerId]?.windowId ?? null,
      tabId: targets[providerId]?.tabId ?? null
    })),
    backgroundRoundtrip: true,
    historyMode: "metadata-only",
    lastRun: summarizeRun(lastRun)
  };
}

async function bridgeGetCapabilities(normalized) {
  const entries = siteEntriesForProviderIds(normalized.providerIds);
  const result = await getCapabilitiesForTargets(normalized.providerIds, entries);
  return {
    ok: result?.ok !== false,
    bridgeVersion: AGENT_BRIDGE_VERSION,
    action: normalized.action,
    requestId: normalized.requestId,
    runId: normalized.runId,
    providerIds: normalized.providerIds,
    capabilities: (result?.capabilities || normalized.providerIds.map((providerId) => ({ siteId: providerId }))).map((item) => ({
      providerId: String(item?.siteId || item?.providerId || ""),
      supportsAttachments: item?.supportsAttachments === true,
      attachmentMode: item?.attachmentMode || "unsupported",
      readiness: item?.readiness || "unknown"
    }))
  };
}

async function bridgeOpenOrBindTargets(normalized, context) {
  const entries = siteEntriesForProviderIds(normalized.providerIds);
  const result = await openOrReuseWindows(entries, {
    origin: context?.origin,
    skipFocusChain: true
  });
  return {
    ok: result?.ok !== false,
    bridgeVersion: AGENT_BRIDGE_VERSION,
    action: normalized.action,
    requestId: normalized.requestId,
    runId: normalized.runId,
    providerIds: normalized.providerIds,
    targets: result?.targets || {}
  };
}

async function bridgeSendAll(normalized, context) {
  const duplicate = findRunByRequest(normalized);
  if (duplicate) {
    return {
      ok: true,
      bridgeVersion: AGENT_BRIDGE_VERSION,
      action: normalized.action,
      status: "duplicate-blocked",
      duplicateBlocked: true,
      reason: "duplicate-send-blocked",
      run: cloneRunEnvelope(duplicate)
    };
  }

  const idempotencyKey = normalized.idempotencyKey || `${normalized.runId}:${stableHash(normalized.prompt)}:${normalized.providerIds.join(",")}`;
  const run = duplicate || createRunEnvelope({
    ...normalized,
    idempotencyKey
  });
  run.status = "send-started";
  rememberRun(run);
  await persistAgentBridgeRuns();

  const entries = siteEntriesForProviderIds(run.providerIds);
  try {
    const targetResult = await openOrReuseWindows(entries, {
      origin: context?.origin,
      skipFocusChain: true
    });
    run.audit.targetBindingStatus = targetResult?.ok === false ? "target-bind-failed" : "target-bound";
    run.audit.targetBindingReason = targetResult?.reason || targetResult?.error || "";
  } catch (error) {
    run.audit.targetBindingStatus = "target-bind-failed";
    run.audit.targetBindingReason = String(error?.message || error || "target-bind-failed");
  }
  const newChatResult = await newChatBeforeSendForRun(run, normalized, entries, context?.origin);
  if (newChatResult?.ok === false) {
    run.status = newChatResult.status || "new-chat-failed";
    run.timestamps.updatedAt = nowIso();
    for (const providerId of run.providerIds) {
      const current = run.providerResults.find((provider) => provider.providerId === providerId) || {};
      setProviderResult(run, providerId, {
        sendPhase: "blocked-before-send",
        retryable: true,
        reason: current.reason || newChatResult.reason || newChatResult.status || "new-chat-failed",
        audit: {
          errorCategory: newChatResult.status || "new-chat-failed"
        }
      });
    }
    await persistAgentBridgeRuns();
    return {
      ok: false,
      bridgeVersion: AGENT_BRIDGE_VERSION,
      action: normalized.action,
      status: run.status,
      reason: newChatResult.reason || run.status,
      run: cloneRunEnvelope(run)
    };
  }
  await persistAgentBridgeRuns();

  await baselineForRun(run, context?.origin);
  const submittedAt = nowIso();
  const result = await sendPromptToTargets(
    run.providerIds,
    normalized.prompt,
    normalized.requestId,
    entries,
    [],
    context?.origin,
    null,
    { historyMode: "metadata-only", source: "agent-bridge" }
  );
  run.timestamps.submittedAt = submittedAt;
  run.status = result?.ok === false ? "send-failed" : "send-submitted";

  for (const providerId of run.providerIds) {
    const outcome = outcomeForProvider(result, providerId);
    const phase = sendPhaseFromOutcome(outcome);
    setProviderResult(run, providerId, {
      sendPhase: phase,
      reason: outcome?.reason || outcome?.error || "",
      retryable: phase !== "send-submitted",
      timestamps: { submittedAt },
      audit: {
        errorCategory: outcome?.ok === false ? (outcome?.status || "send-failed") : null
      }
    });
  }

  await persistAgentBridgeRuns();
  return {
    ok: result?.ok !== false,
    bridgeVersion: AGENT_BRIDGE_VERSION,
    action: normalized.action,
    status: run.status,
    run: cloneRunEnvelope(run)
  };
}

async function bridgeCollectAll(normalized, context) {
  const run = findRunByRequest(normalized);
  if (!run) return failClosed("run-not-found", { action: normalized.action, requestId: normalized.requestId, runId: normalized.runId });
  if (run.status === "cancelled") {
    return {
      ok: true,
      bridgeVersion: AGENT_BRIDGE_VERSION,
      action: normalized.action,
      status: "cancelled",
      run: cloneRunEnvelope(run)
    };
  }

  const entries = siteEntriesForProviderIds(run.providerIds);
  const result = await collectLastFromTargets(run.providerIds, entries, context?.origin, null);
  const collectedAt = nowIso();
  run.timestamps.collectedAt = collectedAt;
  run.status = "collect-polled";

  for (const providerId of run.providerIds) {
    const section = (result.sections || []).find((item) => String(item?.siteId || "") === providerId) || {};
    const text = String(section.text || "");
    const answerHash = text ? stableHash(text) : "";
    const baseline = run.baselines[providerId] || {};
    const providerState = run.providerResults.find((item) => item.providerId === providerId) || {};
    let collectPhase = collectPhaseFromSection(section);
    let freshness = "unknown";
    let counted = false;
    let reason = section.reason || "";

    if (collectPhase === "response-found" && text) {
      if (baseline.baselineConfirmed !== true) {
        reason = reason || baseline.baselineReason || "baseline-unconfirmed";
      } else if (providerState.sendPhase !== "send-submitted") {
        reason = reason || "provider-not-submitted";
      } else if (baseline.preSendLatestHash && answerHash === baseline.preSendLatestHash) {
        collectPhase = "old-answer-suspected";
        freshness = "stale";
        counted = false;
        reason = reason || "latest-response-matches-presend-baseline";
      } else {
        freshness = "fresh";
        counted = true;
      }
    }

    setProviderResult(run, providerId, {
      collectPhase,
      freshness,
      counted,
      text,
      reason,
      retryable: collectPhase === "response-empty" || collectPhase === "transport-failed",
      timestamps: { collectedAt },
      audit: {
        answerHash,
        answerLength: text.length,
        errorCategory: collectPhase === "transport-failed" ? "transport-failed" : null
      }
    });
  }

  await persistAgentBridgeRuns();
  return {
    ok: true,
    bridgeVersion: AGENT_BRIDGE_VERSION,
    action: normalized.action,
    status: run.status,
    run: cloneRunEnvelope(run)
  };
}

async function bridgeGetRunState(normalized) {
  const run = findRunByRequest(normalized);
  if (!run) return failClosed("run-not-found", { action: normalized.action, requestId: normalized.requestId, runId: normalized.runId });
  return {
    ok: true,
    bridgeVersion: AGENT_BRIDGE_VERSION,
    action: normalized.action,
    status: run.status,
    run: cloneRunEnvelope(run)
  };
}

async function bridgeCancelRun(normalized) {
  const run = findRunByRequest(normalized);
  if (!run) return failClosed("run-not-found", { action: normalized.action, requestId: normalized.requestId, runId: normalized.runId });
  const cancelledAt = nowIso();
  run.status = "cancelled";
  run.timestamps.cancelledAt = cancelledAt;
  run.timestamps.updatedAt = cancelledAt;
  for (const providerId of run.providerIds) {
    setProviderResult(run, providerId, {
      reason: "run-cancelled",
      retryable: false
    });
  }
  await persistAgentBridgeRuns();
  return {
    ok: true,
    bridgeVersion: AGENT_BRIDGE_VERSION,
    action: normalized.action,
    status: "cancelled",
    run: cloneRunEnvelope(run)
  };
}

async function handleAgentBridgeRequest(rawPayload, context = {}) {
  if (!isAuthorizedAgentBridgeSender(context)) {
    return failClosed("unauthorized-sender");
  }
  const normalized = validateAgentBridgePayload(rawPayload);
  if (!normalized.ok) return normalized;
  await hydrateAgentBridgeRuns();
  if (normalized.action === "health") return bridgeHealth(normalized);
  if (normalized.action === "getCapabilities") return bridgeGetCapabilities(normalized);
  if (normalized.action === "openOrBindTargets") return bridgeOpenOrBindTargets(normalized, context);
  if (normalized.action === "sendAll") return bridgeSendAll(normalized, context);
  if (normalized.action === "collectAll") return bridgeCollectAll(normalized, context);
  if (normalized.action === "getRunState") return bridgeGetRunState(normalized);
  if (normalized.action === "cancelRun") return bridgeCancelRun(normalized);
  return failClosed("unknown-action", { action: normalized.action });
}

function resetAgentBridgeStateForTest() {
  agentBridgeRuns.clear();
  agentBridgeIdempotencyIndex.clear();
}

globalThis.AskAiTogetherAgentBridgeBackground = {
  version: AGENT_BRIDGE_VERSION,
  providerAllowlist: AGENT_BRIDGE_PROVIDER_ALLOWLIST,
  handleAgentBridgeRequest,
  _test: {
    resetAgentBridgeStateForTest,
    validateAgentBridgePayload,
    stableHash
  }
};
