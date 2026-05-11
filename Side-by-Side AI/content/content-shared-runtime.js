(function registerAskAiTogetherContentRuntime(global) {
  "use strict";

  var runtime = global.__ASK_AI_TOGETHER_RUNTIME__;
  if (!runtime) return;

  var frameRole = runtime.detectFrameRole ? runtime.detectFrameRole() : (global.top === global ? "top" : "iframe");
  runtime.markBootstrapped?.({
    mode: "compatibility-content",
    frameRole: frameRole,
    state: "content-runtime-ready"
  });

  function providerDefinitions() {
    var sites = typeof SITES !== "undefined" && Array.isArray(SITES) ? SITES : [];
    var responses = typeof RESPONSE_SELECTORS !== "undefined" && RESPONSE_SELECTORS ? RESPONSE_SELECTORS : {};
    return sites.map(function (site) {
      return Object.assign({}, site, {
        responseSelectors: responses[site.id] || []
      });
    });
  }

  function providerDefinitionsForMode(mode) {
    return providerDefinitions().map(function (site) {
      return Object.assign({}, site, {
        capabilities: mode === "legacy-content"
          ? {
              supportsAttachments: true,
              attachmentMode: "legacy-only"
            }
          : {
              supportsAttachments: false,
              attachmentMode: "unsupported"
            }
      });
    });
  }

  runtime.registerProviderDefinitions(providerDefinitionsForMode("compatibility-content"), { mode: "compatibility-content" });
  runtime.registerProviderDefinitions(providerDefinitionsForMode("legacy-content"), { mode: "legacy-content" });

  function currentRuntimeSite() {
    if (typeof currentSite === "function") return currentSite() || (typeof GENERIC_SITE !== "undefined" ? GENERIC_SITE : null);
    return runtime.matchProviderForLocation?.(global.location) || null;
  }

  function siteMatchesTarget(site, siteIds) {
    var ids = Array.isArray(siteIds) ? siteIds.map(function (id) { return String(id || ""); }).filter(Boolean) : [];
    if (!ids.length) return true;
    if (!site?.id) return false;
    return ids.indexOf(site.id) >= 0 || site.id === "generic";
  }

  function effectiveTargetSiteId(site, siteIds) {
    var detectedSiteId = String(site?.id || "");
    var ids = Array.isArray(siteIds) ? siteIds.map(function (id) { return String(id || ""); }).filter(Boolean) : [];
    if ((!detectedSiteId || detectedSiteId === "generic") && ids.length) return ids[0];
    return detectedSiteId || ids[0] || "generic";
  }

  function makeOutcome(status, fields) {
    if (typeof runtime.makeOutcome === "function") return runtime.makeOutcome(status, fields);
    return Object.assign({ ok: status === "response-found", status: status }, fields || {});
  }

  function unsupportedAttachmentOutcome(site, requestId) {
    return makeOutcome("capability-unsupported", {
      action: "sendPrompt",
      requestId: String(requestId || ""),
      providerId: site?.id || "",
      capabilities: [
        {
          siteId: site?.id || "",
          supportsAttachments: false,
          attachmentMode: "unsupported"
        }
      ]
    });
  }

  async function sharedSendPromptForMode(mode, siteIds, message, context) {
    var site = currentRuntimeSite();
    var requestId = String(context?.requestId || "");
    var providerId = effectiveTargetSiteId(site, siteIds);
    if (!site || !siteMatchesTarget(site, siteIds)) {
      return makeOutcome("provider-not-found", { action: "sendPrompt", requestId: requestId });
    }
    if (runtime.payloadContainsFilePayload?.(context?.payload || {}) || runtime.payloadContainsFilePayload?.(context || {})) {
      return unsupportedAttachmentOutcome(site, requestId);
    }
    if (typeof sendPrompt !== "function") {
      return makeOutcome("runtime-not-ready", { action: "sendPrompt", requestId: requestId, providerId: providerId });
    }
    try {
      var result = await sendPrompt({
        message: String(message || ""),
        requestId: requestId,
        siteId: providerId
      });
      return result || makeOutcome("response-found", {
        action: "sendPrompt",
        requestId: requestId,
        providerId: providerId
      });
    } catch (error) {
      return makeOutcome("send-failed", {
        action: "sendPrompt",
        requestId: requestId,
        providerId: providerId,
        error: String(error?.message || error || "")
      });
    }
  }

  async function sharedCollectLatestForMode(_mode, siteIds, context) {
    var site = currentRuntimeSite();
    var providerId = effectiveTargetSiteId(site, siteIds);
    if (!site || !siteMatchesTarget(site, siteIds)) {
      return makeOutcome("provider-not-found", {
        action: "collectLatest",
        requestId: String(context?.requestId || "")
      });
    }
    if (typeof extractLatestResponseText !== "function") {
      return makeOutcome("runtime-not-ready", {
        action: "collectLatest",
        requestId: String(context?.requestId || ""),
        providerId: providerId
      });
    }
    var text = String(extractLatestResponseText() || "");
    return makeOutcome(text ? "response-found" : "response-empty", {
      action: "collectLatest",
      requestId: String(context?.requestId || ""),
      providerId: providerId,
      text: text
    });
  }

  async function sharedNewChatForMode(_mode, siteIds, context) {
    var site = currentRuntimeSite();
    var providerId = effectiveTargetSiteId(site, siteIds);
    if (!site || !siteMatchesTarget(site, siteIds)) {
      return makeOutcome("provider-not-found", {
        action: "newChat",
        requestId: String(context?.requestId || "")
      });
    }
    if (typeof newChat !== "function") {
      return makeOutcome("runtime-not-ready", {
        action: "newChat",
        requestId: String(context?.requestId || ""),
        providerId: providerId
      });
    }
    try {
      var result = newChat();
      if (result && typeof result.then === "function") await result;
      return makeOutcome("response-found", {
        action: "newChat",
        requestId: String(context?.requestId || ""),
        providerId: providerId
      });
    } catch (error) {
      return makeOutcome("new-chat-failed", {
        action: "newChat",
        requestId: String(context?.requestId || ""),
        providerId: providerId,
        error: String(error?.message || error || "")
      });
    }
  }

  function registerSharedTransport(mode) {
    runtime.registerTransport(mode, {
      runtimeKind: "shared-content",
      sendPrompt: function sendPromptForRegisteredMode(siteIds, message, context) {
        return sharedSendPromptForMode(mode, siteIds, message, context);
      },
      collectLatest: function collectLatestForRegisteredMode(siteIds, context) {
        return sharedCollectLatestForMode(mode, siteIds, context);
      },
      newChat: function newChatForRegisteredMode(siteIds, context) {
        return sharedNewChatForMode(mode, siteIds, context);
      },
      getCapabilities: function getCapabilitiesForRegisteredMode(siteIds) {
        return runtime.getCapabilities(siteIds, mode);
      }
    });
  }

  registerSharedTransport("compatibility-content");
  registerSharedTransport("legacy-content");
})(globalThis);
