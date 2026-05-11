(function initAskAiTogetherRuntime(global) {
  "use strict";

  var RUNTIME_KEY = "__ASK_AI_TOGETHER_RUNTIME__";
  var VERSION = "slice1-runtime-contract";
  var VALID_MODES = ["legacy", "compatibility", "legacy-content", "compatibility-content", "background", "unknown"];
  var VALID_FRAME_ROLES = ["top", "iframe", "background", "extension-page", "unknown"];
  var VALID_ATTACHMENT_MODES = ["legacy-only", "unsupported"];
  var OUTCOME_STATUSES = [
    "provider-not-found",
    "runtime-not-ready",
	    "input-injection-failed",
	    "send-failed",
	    "send-ack-timeout",
	    "send-submitted",
	    "extraction-timeout",
    "response-found",
    "response-empty",
    "iframe-disconnected",
    "transport-failed",
    "new-chat-failed",
    "history-update-failed",
    "capability-unsupported"
  ];
  var FILE_PAYLOAD_KEYS = ["file", "files", "blob", "blobs", "attachment", "attachments", "image", "images"];
  var FORBIDDEN_HISTORY_KEYS = ["schemaVersion", "files", "file", "attachments", "debugTrace", "debugTraces"];

  /**
   * ProviderDefinition: { id, displayName, matchHosts, homeUrl, newChatUrl,
   * inputSelectors, sendSelectors, newChatSelectors, responseSelectors, capabilities }.
   * RuntimeOutcome: { ok, status, action?, requestId?, providerId?, text?, capabilities?, error? }.
   * RuntimeMessageEnvelope: { requestId, sourceMode, targetMode, frameRole, providerId,
   * tabId?, frameId?, origin, timeoutMs?, payload }.
   * RuntimeHistoryContext is transient only and must never be persisted by this contract.
   */

  function isObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function toCleanString(value) {
    return String(value || "").trim();
  }

  function asStringArray(value) {
    if (!Array.isArray(value)) return [];
    return value.map((item) => toCleanString(item)).filter(Boolean);
  }

  function normalizeMode(mode) {
    var clean = toCleanString(mode);
    return VALID_MODES.indexOf(clean) >= 0 ? clean : "unknown";
  }

  function detectFrameRole() {
    try {
      if (typeof chrome !== "undefined" && chrome.runtime && !global.document) return "background";
    } catch (_error) {
      return "unknown";
    }
    try {
      if (!global.window || !global.document) return "unknown";
      if (global.window !== global.window.top) return "iframe";
      if (global.location && String(global.location.protocol || "") === "chrome-extension:") return "extension-page";
      return "top";
    } catch (_error) {
      return "unknown";
    }
  }

  function normalizeFrameRole(frameRole) {
    var clean = toCleanString(frameRole);
    return VALID_FRAME_ROLES.indexOf(clean) >= 0 ? clean : detectFrameRole();
  }

  function normalizeAttachmentMode(value, fallback) {
    var clean = toCleanString(value);
    if (VALID_ATTACHMENT_MODES.indexOf(clean) >= 0) return clean;
    return fallback || "unsupported";
  }

  function defaultCapabilities(mode) {
    if (mode === "legacy" || mode === "legacy-content") {
      return {
        supportsAttachments: true,
        attachmentMode: "legacy-only"
      };
    }
    return {
      supportsAttachments: false,
      attachmentMode: "unsupported"
    };
  }

  function normalizeCapabilities(value, mode) {
    var defaults = defaultCapabilities(mode);
    var source = isObject(value) ? value : {};
    var attachmentMode = normalizeAttachmentMode(source.attachmentMode, defaults.attachmentMode);
    var supportsAttachments = source.supportsAttachments === true && attachmentMode === "legacy-only";
    if (attachmentMode === "unsupported") supportsAttachments = false;
    return {
      supportsAttachments: supportsAttachments,
      attachmentMode: attachmentMode
    };
  }

  function normalizeProviderDefinition(input, mode) {
    if (!isObject(input)) return null;
    var id = toCleanString(input.id);
    if (!id) return null;
    var cleanMode = normalizeMode(mode);
    return {
      id: id,
      displayName: toCleanString(input.displayName || input.name || id),
      matchHosts: asStringArray(input.matchHosts),
      homeUrl: toCleanString(input.homeUrl || input.url),
      newChatUrl: toCleanString(input.newChatUrl || input.homeUrl || input.url),
      inputSelectors: asStringArray(input.inputSelectors),
      sendSelectors: asStringArray(input.sendSelectors),
      newChatSelectors: asStringArray(input.newChatSelectors),
      responseSelectors: asStringArray(input.responseSelectors),
      capabilities: normalizeCapabilities(input.capabilities, cleanMode)
    };
  }

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function payloadContainsFilePayload(value, seen) {
    if (!value || typeof value !== "object") return false;
    var visited = seen || [];
    if (visited.indexOf(value) >= 0) return false;
    visited.push(value);

    if (typeof File !== "undefined" && value instanceof File) return true;
    if (typeof Blob !== "undefined" && value instanceof Blob) return true;

    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i += 1) {
        if (payloadContainsFilePayload(value[i], visited)) return true;
      }
      return false;
    }

    for (var j = 0; j < FILE_PAYLOAD_KEYS.length; j += 1) {
      if (hasOwn(value, FILE_PAYLOAD_KEYS[j])) {
        var payloadValue = value[FILE_PAYLOAD_KEYS[j]];
        if (payloadValue != null && !(Array.isArray(payloadValue) && payloadValue.length === 0)) return true;
      }
    }
    return false;
  }

  function makeOutcome(status, fields) {
    var cleanStatus = OUTCOME_STATUSES.indexOf(status) >= 0 ? status : "transport-failed";
    var outcome = Object.assign({}, isObject(fields) ? fields : {}, {
      ok: cleanStatus !== "provider-not-found" &&
        cleanStatus !== "runtime-not-ready" &&
        cleanStatus !== "input-injection-failed" &&
        cleanStatus !== "send-failed" &&
        cleanStatus !== "send-ack-timeout" &&
        cleanStatus !== "extraction-timeout" &&
        cleanStatus !== "iframe-disconnected" &&
        cleanStatus !== "transport-failed" &&
        cleanStatus !== "new-chat-failed" &&
        cleanStatus !== "history-update-failed" &&
        cleanStatus !== "capability-unsupported",
      status: cleanStatus
    });
    if (!outcome.timestamp) outcome.timestamp = Date.now();
    return outcome;
  }

  function validateRuntimeMessageEnvelope(envelope, options) {
    var errors = [];
    var opts = isObject(options) ? options : {};
    if (!isObject(envelope)) {
      return { ok: false, errors: ["envelope-not-object"], envelope: null };
    }

    var value = Object.assign({}, envelope);
    value.requestId = toCleanString(value.requestId);
    value.sourceMode = normalizeMode(value.sourceMode);
    value.targetMode = normalizeMode(value.targetMode);
    value.frameRole = normalizeFrameRole(value.frameRole);
    value.providerId = toCleanString(value.providerId);
    value.origin = toCleanString(value.origin);
    value.payload = isObject(value.payload) ? value.payload : {};

    if (!value.requestId && opts.requireRequestId !== false) errors.push("requestId-required");
    if (!value.sourceMode || value.sourceMode === "unknown") errors.push("sourceMode-required");
    if (!value.targetMode || value.targetMode === "unknown") errors.push("targetMode-required");
    if (value.tabId != null && !Number.isInteger(value.tabId)) errors.push("tabId-invalid");
    if (value.frameId != null && !Number.isInteger(value.frameId)) errors.push("frameId-invalid");
    if (value.timeoutMs != null && !(Number(value.timeoutMs) >= 0)) errors.push("timeoutMs-invalid");
    if (opts.disallowFilePayload && payloadContainsFilePayload(value.payload)) errors.push("file-payload-unsupported");

    return {
      ok: errors.length === 0,
      errors: errors,
      envelope: value
    };
  }

  function createRuntimeHistoryContext(input) {
    var source = isObject(input) ? input : {};
    var context = {
      transient: true,
      requestId: toCleanString(source.requestId),
      sourceMode: normalizeMode(source.sourceMode),
      providerId: toCleanString(source.providerId),
      frameRole: normalizeFrameRole(source.frameRole),
      conversationKey: toCleanString(source.conversationKey || source.entryId),
      initialUrl: toCleanString(source.initialUrl),
      resolvedConversationUrl: toCleanString(source.resolvedConversationUrl),
      urlPatchIntent: toCleanString(source.urlPatchIntent),
      titlePatchIntent: toCleanString(source.titlePatchIntent),
      outcomeType: toCleanString(source.outcomeType),
      createdAt: Number(source.createdAt) || Date.now()
    };
    return context;
  }

  function validateRuntimeHistoryContext(context) {
    if (!isObject(context)) return { ok: false, errors: ["history-context-not-object"] };
    var errors = [];
    for (var i = 0; i < FORBIDDEN_HISTORY_KEYS.length; i += 1) {
      if (hasOwn(context, FORBIDDEN_HISTORY_KEYS[i])) errors.push("forbidden-history-key:" + FORBIDDEN_HISTORY_KEYS[i]);
    }
    if (context.transient !== true) errors.push("history-context-must-be-transient");
    if (payloadContainsFilePayload(context)) errors.push("history-context-file-payload-unsupported");
    return { ok: errors.length === 0, errors: errors };
  }

  function normalizeOrigin(value) {
    return toCleanString(value).replace(/\/$/, "");
  }

  function originFromUrl(value) {
    try {
      return normalizeOrigin(new URL(String(value || "")).origin);
    } catch (_error) {
      return "";
    }
  }

  function providerMatchesHost(provider, host) {
    var cleanHost = toCleanString(host).toLowerCase();
    if (!provider || !cleanHost) return false;
    return asStringArray(provider.matchHosts).some(function (matchHost) {
      var cleanMatchHost = toCleanString(matchHost).toLowerCase();
      return cleanMatchHost && (cleanHost === cleanMatchHost || cleanHost.endsWith("." + cleanMatchHost));
    });
  }

  var existing = global[RUNTIME_KEY];
  var runtime = isObject(existing) ? existing : {};
  if (!isObject(runtime.bootstrap)) {
    runtime.bootstrap = {
      state: "initializing",
      loadedAt: Date.now(),
      loads: 0
    };
  }
  runtime.bootstrap.loads = (Number(runtime.bootstrap.loads) || 0) + 1;
  runtime.bootstrap.state = "ready";
  runtime.version = runtime.version || VERSION;
  runtime.mode = runtime.mode || "unknown";
  runtime.frameRole = runtime.frameRole || detectFrameRole();
  runtime.providerRegistry = isObject(runtime.providerRegistry) ? runtime.providerRegistry : {};
  runtime.listenerFlags = isObject(runtime.listenerFlags) ? runtime.listenerFlags : {};
  runtime.transports = isObject(runtime.transports) ? runtime.transports : {};
  runtime.adapters = isObject(runtime.adapters) ? runtime.adapters : {};

  runtime.markBootstrapped = function markBootstrapped(details) {
    var source = isObject(details) ? details : {};
    runtime.mode = normalizeMode(source.mode || runtime.mode);
    runtime.frameRole = normalizeFrameRole(source.frameRole || runtime.frameRole);
    runtime.bootstrap.state = toCleanString(source.state) || "ready";
    runtime.bootstrap.updatedAt = Date.now();
    return runtime;
  };

  runtime.markListenerRegistered = function markListenerRegistered(flag) {
    var clean = toCleanString(flag);
    if (!clean) return false;
    if (runtime.listenerFlags[clean]) return false;
    runtime.listenerFlags[clean] = {
      registeredAt: Date.now(),
      mode: runtime.mode,
      frameRole: runtime.frameRole
    };
    return true;
  };

  runtime.registerProviderDefinitions = function registerProviderDefinitions(definitions, options) {
    var mode = normalizeMode(options && options.mode);
    var list = Array.isArray(definitions) ? definitions : [];
    list.forEach(function (item) {
      var provider = normalizeProviderDefinition(item, mode);
      if (!provider) return;
      var existingProvider = runtime.providerRegistry[provider.id] || {};
      var capabilitiesByMode = isObject(existingProvider.capabilitiesByMode)
        ? existingProvider.capabilitiesByMode
        : {};
      capabilitiesByMode[mode] = provider.capabilities;
      runtime.providerRegistry[provider.id] = Object.assign({}, existingProvider, provider, {
        capabilitiesByMode: capabilitiesByMode
      });
    });
    return runtime.providerRegistry;
  };

  runtime.matchProviderForLocation = function matchProviderForLocation(locationLike) {
    var host = "";
    try {
      host = String(locationLike && locationLike.hostname ? locationLike.hostname : global.location && global.location.hostname);
    } catch (_error) {
      host = "";
    }
    var ids = Object.keys(runtime.providerRegistry);
    for (var i = 0; i < ids.length; i += 1) {
      var provider = runtime.providerRegistry[ids[i]];
      if (providerMatchesHost(provider, host)) return provider;
    }
    return null;
  };

  runtime.getProviderCapabilities = function getProviderCapabilities(siteId, mode) {
    var cleanSiteId = toCleanString(siteId);
    var cleanMode = normalizeMode(mode || runtime.mode);
    var provider = runtime.providerRegistry[cleanSiteId] || null;
    var byMode = provider && isObject(provider.capabilitiesByMode) ? provider.capabilitiesByMode : {};
    var capabilities = byMode[cleanMode] || provider?.capabilities || defaultCapabilities(cleanMode);
    return Object.assign({ siteId: cleanSiteId }, normalizeCapabilities(capabilities, cleanMode));
  };

  runtime.getCapabilities = function getCapabilities(siteIds, mode) {
    var ids = asStringArray(siteIds);
    if (!ids.length) {
      var matched = runtime.matchProviderForLocation();
      if (matched) ids = [matched.id];
    }
    return makeOutcome("response-found", {
      capabilities: ids.map(function (siteId) {
        return runtime.getProviderCapabilities(siteId, mode);
      })
    });
  };

  runtime.registerTransport = function registerTransport(mode, transport) {
    var cleanMode = normalizeMode(mode);
    if (!isObject(transport)) return null;
    runtime.transports[cleanMode] = transport;
    return transport;
  };

  runtime.getTransport = function getTransport(mode) {
    return runtime.transports[normalizeMode(mode)] || null;
  };

  runtime.constants = {
    outcomeStatuses: OUTCOME_STATUSES.slice(),
    attachmentModes: VALID_ATTACHMENT_MODES.slice(),
    runtimeKey: RUNTIME_KEY,
    version: VERSION
  };
  runtime.detectFrameRole = detectFrameRole;
  runtime.defaultCapabilities = defaultCapabilities;
  runtime.normalizeCapabilities = normalizeCapabilities;
  runtime.normalizeProviderDefinition = normalizeProviderDefinition;
  runtime.payloadContainsFilePayload = payloadContainsFilePayload;
  runtime.makeOutcome = makeOutcome;
  runtime.validateRuntimeMessageEnvelope = validateRuntimeMessageEnvelope;
  runtime.createRuntimeHistoryContext = createRuntimeHistoryContext;
  runtime.validateRuntimeHistoryContext = validateRuntimeHistoryContext;
  runtime.normalizeOrigin = normalizeOrigin;
  runtime.originFromUrl = originFromUrl;

  global[RUNTIME_KEY] = runtime;
})(globalThis);
