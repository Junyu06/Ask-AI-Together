"use strict";

let compatibilityConfiguredSiteId = "";

function rememberCompatibilityConfiguredSiteId(siteId) {
  const cleanSiteId = String(siteId || "").trim();
  if (cleanSiteId && cleanSiteId !== "generic") {
    compatibilityConfiguredSiteId = cleanSiteId;
    ensureTopLevelRuntimeEventsRegistered();
  }
  return compatibilityConfiguredSiteId;
}

function effectiveCompatibilitySiteId(site, configuredSiteId = "") {
  const detectedSiteId = String(site?.id || "").trim();
  const cleanConfiguredSiteId = String(configuredSiteId || compatibilityConfiguredSiteId || "").trim();
  if ((!detectedSiteId || detectedSiteId === "generic") && cleanConfiguredSiteId) return cleanConfiguredSiteId;
  return detectedSiteId || cleanConfiguredSiteId || "generic";
}

const compatibilityQuoteController = globalThis.AskAiTogetherQuoteUi?.createController?.({
  getPayload(text) {
    return {
      text,
      siteId: effectiveCompatibilitySiteId(currentSite() || GENERIC_SITE),
      url: location.href
    };
  },
  onQuote(payload) {
    notifyExtension({ type: "OA_QUOTE_TEXT", payload });
  }
});

function showQuoteButton() {
  compatibilityQuoteController?.show();
}

function removeQuoteButton() {
  compatibilityQuoteController?.remove();
}

function isTopLevelAiSurface() {
  if (window.parent !== window) return false;
  const siteId = String(currentSite()?.id || "").trim();
  if (siteId && siteId !== "generic") return true;
  return Boolean(String(compatibilityConfiguredSiteId || "").trim());
}

function getRuntimeTransport() {
  return globalThis.__ASK_AI_TOGETHER_RUNTIME__?.getTransport?.("compatibility-content") || null;
}

function makeRuntimeEnvelope(msg, action, payload = {}) {
  const site = currentSite() || GENERIC_SITE;
  const configuredSiteId = rememberCompatibilityConfiguredSiteId(msg?.siteId || msg?.targetSiteId || msg?.providerId);
  return {
    requestId: String(msg?.requestId || ""),
    sourceMode: "compatibility",
    targetMode: "compatibility-content",
    frameRole: "top",
    providerId: effectiveCompatibilitySiteId(site, configuredSiteId),
    origin: location.origin,
    timeoutMs: Number(msg?.timeoutMs || 0),
    payload: {
      action,
      ...payload
    }
  };
}

function validateRuntimeEnvelope(envelope, options = {}) {
  const runtime = globalThis.__ASK_AI_TOGETHER_RUNTIME__;
  if (!runtime?.validateRuntimeMessageEnvelope) return { ok: true, envelope, errors: [] };
  return runtime.validateRuntimeMessageEnvelope(envelope, options);
}

function capabilityUnsupportedResponse(site, requestId = "") {
  const runtime = globalThis.__ASK_AI_TOGETHER_RUNTIME__;
  if (runtime?.makeOutcome) {
    return runtime.makeOutcome("capability-unsupported", {
      action: "attachFiles",
      requestId,
      providerId: site.id,
      capabilities: [
        {
          siteId: site.id,
          supportsAttachments: false,
          attachmentMode: "unsupported"
        }
      ]
    });
  }
  return {
    ok: false,
    status: "capability-unsupported",
    action: "attachFiles",
    requestId,
    providerId: site.id
  };
}

const shouldRegisterRuntimeMessageListener = !globalThis.__ASK_AI_TOGETHER_RUNTIME__ ||
  globalThis.__ASK_AI_TOGETHER_RUNTIME__.markListenerRegistered?.("compatibility-content-runtime-message") !== false;

if (shouldRegisterRuntimeMessageListener) {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !msg.type) return false;
    if (
      msg.type === "OA_RUNTIME_CHAT" ||
      msg.type === "OA_RUNTIME_ATTACH_FILES" ||
      msg.type === "OA_RUNTIME_NEW_CHAT" ||
      msg.type === "OA_RUNTIME_COLLECT_LAST"
    ) {
      if (window !== window.top) return false;
    }
    if (msg.type === "OA_RUNTIME_CHAT") {
      const envelope = makeRuntimeEnvelope(msg, "sendPrompt", {
        message: String(msg.message || ""),
        files: msg.files || []
      });
      const validation = validateRuntimeEnvelope(envelope, {
        disallowFilePayload: true,
        requireRequestId: false
      });
      if (!validation.ok) {
        const site = currentSite() || GENERIC_SITE;
        const status = validation.errors.includes("file-payload-unsupported") ? "capability-unsupported" : "transport-failed";
        postSendProgress(String(msg.requestId || ""), effectiveCompatibilitySiteId(site, msg.siteId), status, {
          reason: validation.errors.join(",")
        });
        sendResponse({
          ok: false,
          status,
          errors: validation.errors
        });
        return false;
      }
      const transport = getRuntimeTransport();
      if (!transport?.sendPrompt) {
        sendResponse({ ok: false, status: "runtime-not-ready" });
        return false;
      }
      void transport.sendPrompt([validation.envelope.providerId], msg.message || "", {
        requestId: validation.envelope.requestId,
        payload: validation.envelope.payload
      })
        .then((outcome) => {
          sendResponse(outcome || { ok: false, status: "transport-failed" });
        })
        .catch((error) => {
          sendResponse({
            ok: false,
            status: "transport-failed",
            error: String(error?.message || error || "")
          });
        });
      return true;
    }
    if (msg.type === "OA_RUNTIME_ATTACH_FILES") {
      const site = currentSite() || GENERIC_SITE;
      const configuredSiteId = rememberCompatibilityConfiguredSiteId(msg?.siteId || msg?.targetSiteId || msg?.providerId);
      const effectiveSite = {
        ...site,
        id: effectiveCompatibilitySiteId(site, configuredSiteId)
      };
      const outcome = capabilityUnsupportedResponse(effectiveSite, String(msg.requestId || ""));
      sendResponse(outcome);
      return false;
    }
    if (msg.type === "OA_RUNTIME_NEW_CHAT") {
      const envelope = makeRuntimeEnvelope(msg, "newChat");
      const validation = validateRuntimeEnvelope(envelope, { requireRequestId: false });
      if (!validation.ok) {
        sendResponse({ ok: false, status: "transport-failed", errors: validation.errors });
        return false;
      }
      const transport = getRuntimeTransport();
      if (!transport?.newChat) {
        sendResponse({ ok: false, status: "runtime-not-ready" });
        return false;
      }
      void transport.newChat([validation.envelope.providerId], {
        requestId: validation.envelope.requestId
      }).catch(() => {});
      sendResponse({ ok: true, status: "response-found" });
      return false;
    }
    if (msg.type === "OA_RUNTIME_COLLECT_LAST") {
      const envelope = makeRuntimeEnvelope(msg, "collectLatest");
      const validation = validateRuntimeEnvelope(envelope, { requireRequestId: false });
      if (!validation.ok) {
        sendResponse({ ok: false, status: "transport-failed", errors: validation.errors });
        return false;
      }
      const site = currentSite() || GENERIC_SITE;
      const transport = getRuntimeTransport();
      if (!transport?.collectLatest) {
        sendResponse({ ok: false, status: "runtime-not-ready", siteId: validation.envelope.providerId, text: "" });
        return false;
      }
      void transport.collectLatest([validation.envelope.providerId], {
        requestId: validation.envelope.requestId
      })
        .then((outcome) => {
          sendResponse({
            ok: outcome.ok !== false,
            status: outcome.status,
            siteId: validation.envelope.providerId,
            text: outcome.text || ""
          });
        })
        .catch(() => sendResponse({ ok: false, status: "transport-failed", siteId: validation.envelope.providerId, text: "" }));
      return true;
    }
    return false;
  });
}

let lastHref = location.href;
function postUrlUpdate() {
  const site = currentSite() || GENERIC_SITE;
  const payload = {
    siteId: effectiveCompatibilitySiteId(site),
    url: location.href
  };
  notifyExtension({ type: "OA_UPDATE_HISTORY", payload });
}

let topLevelRuntimeEventsRegistered = false;

function shouldRegisterTopLevelRuntimeEvents() {
  const runtime = globalThis.__ASK_AI_TOGETHER_RUNTIME__;
  return !runtime || runtime.markListenerRegistered?.("compatibility-content-top-level-events") !== false;
}

function ensureTopLevelRuntimeEventsRegistered() {
  if (topLevelRuntimeEventsRegistered || !isTopLevelAiSurface()) return;
  if (!shouldRegisterTopLevelRuntimeEvents()) return;
  topLevelRuntimeEventsRegistered = true;
  document.addEventListener("mouseup", showQuoteButton);
  document.addEventListener("touchend", showQuoteButton);
  document.addEventListener("click", (event) => {
    if (event.target && event.target.closest(".oa-quote-float-btn")) return;
    removeQuoteButton();
  });
  window.addEventListener("scroll", removeQuoteButton, true);
  postUrlUpdate();
  setInterval(() => {
    if (location.href === lastHref) return;
    lastHref = location.href;
    postUrlUpdate();
  }, 600);
}

ensureTopLevelRuntimeEventsRegistered();
