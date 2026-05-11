(function initLegacyIframeAdapter() {
  "use strict";

  const providerCatalog = globalThis.AskAiTogetherProviderCatalog;
  const askRuntime = globalThis.__ASK_AI_TOGETHER_RUNTIME__;
  const GENERIC_SITE = providerCatalog?.genericSite || {
    id: "generic",
    inputSelectors: ["textarea", 'div[contenteditable="true"]', "input[type='text']"],
    sendSelectors: ['button[type="submit"]', "button.send", "button[aria-label*='Send']"],
    newChatSelectors: []
  };

  askRuntime?.markBootstrapped?.({
    mode: "legacy-content",
    frameRole: askRuntime?.detectFrameRole?.() || "iframe",
    state: "legacy-content-adapter-ready"
  });

  let legacyConfiguredSiteId = "";
  let lastHref = location.href;

  function currentLegacySite() {
    return providerCatalog?.matchProviderForLocation?.(location, { mode: "legacy-content" }) || GENERIC_SITE;
  }

  function rememberLegacyConfiguredSiteId(siteId) {
    const cleanSiteId = String(siteId || "").trim();
    if (cleanSiteId) legacyConfiguredSiteId = cleanSiteId;
    return legacyConfiguredSiteId;
  }

  function effectiveLegacySiteId(site, configuredSiteId = "") {
    const detectedSiteId = String(site?.id || "").trim();
    const cleanConfiguredSiteId = String(configuredSiteId || legacyConfiguredSiteId || "").trim();
    if ((!detectedSiteId || detectedSiteId === "generic") && cleanConfiguredSiteId) return cleanConfiguredSiteId;
    return detectedSiteId || cleanConfiguredSiteId || "generic";
  }

  function extensionOrigin() {
    try {
      return chrome.runtime.getURL("").replace(/\/$/, "");
    } catch (_error) {
      return "";
    }
  }

  function normalizeOrigin(origin) {
    return String(origin || "").replace(/\/$/, "");
  }

  function directParentOrigin() {
    try {
      const ancestors = location.ancestorOrigins ? Array.from(location.ancestorOrigins) : [];
      if (ancestors.length) return normalizeOrigin(ancestors[0]);
    } catch (_error) {
      // Fall back to referrer below when ancestorOrigins is unavailable.
    }

    const referrer = String(document.referrer || "");
    if (!referrer) return "";
    try {
      return normalizeOrigin(new URL(referrer).origin);
    } catch (_error) {
      return "";
    }
  }

  function postToExtensionParent(message) {
    const targetOrigin = extensionOrigin();
    if (!targetOrigin || window.parent === window) return;

    const parentOrigin = directParentOrigin();
    if (parentOrigin && parentOrigin !== targetOrigin) return;

    try {
      window.parent.postMessage(message, targetOrigin);
    } catch (_error) {
      // Nested provider frames can have an AI-origin parent. Keep the target
      // origin strict and let the direct legacy iframe handle the protocol.
    }
  }

  function makeLegacyContentRuntimeOutcome(status, fields = {}) {
    if (askRuntime?.makeOutcome) return askRuntime.makeOutcome(status, fields);
    return {
      ok: status === "response-found" || status === "response-empty",
      status,
      timestamp: Date.now(),
      ...fields
    };
  }

  function postSendProgress(requestId, siteId, phase, extra = {}) {
    if (!requestId || !siteId || window.parent === window) return;
    postToExtensionParent({
      type: "SEND_PROGRESS",
      payload: {
        requestId,
        siteId,
        phase,
        ...extra
      }
    });
  }

  function isExtensionEmbeddedFrame() {
    if (window.parent === window) return false;
    let extOrigin = "";
    try {
      extOrigin = new URL(chrome.runtime.getURL("")).origin;
    } catch (_error) {
      return false;
    }

    const referrer = String(document.referrer || "");
    if (referrer) {
      try {
        if (new URL(referrer).origin === extOrigin) return true;
      } catch (_error) {
        // Ignore invalid referrer URL.
      }
    }

    try {
      const ancestors = location.ancestorOrigins ? Array.from(location.ancestorOrigins) : [];
      return ancestors.some((origin) => normalizeOrigin(origin) === extOrigin);
    } catch (_error) {
      return false;
    }
  }

  function validateLegacyRuntimeEnvelope(data, action, options = {}) {
    const site = currentLegacySite();
    const envelope = {
      requestId: String(data?.payload?.requestId || ""),
      sourceMode: "legacy",
      targetMode: "legacy-content",
      frameRole: "iframe",
      providerId: String(data?.config?.siteId || site.id),
      origin: extensionOrigin(),
      timeoutMs: Number(data?.payload?.timeoutMs || 0),
      payload: {
        action,
        message: String(data?.message || ""),
        files: data?.payload?.files || data?.payload?.images || []
      }
    };
    if (!askRuntime?.validateRuntimeMessageEnvelope) return { ok: true, envelope, errors: [] };
    return askRuntime.validateRuntimeMessageEnvelope(envelope, options);
  }

  function getLegacyContentRuntimeTransport() {
    return askRuntime?.getTransport?.("legacy-content") || null;
  }

  function reportMissingTransport(action, requestId, providerId) {
    const outcome = makeLegacyContentRuntimeOutcome("runtime-not-ready", {
      action,
      requestId: String(requestId || ""),
      providerId: String(providerId || "")
    });
    if (action === "sendPrompt") {
      postSendProgress(outcome.requestId, outcome.providerId, "failed", { reason: outcome.status });
    }
    return outcome;
  }

  async function attachLegacyFiles(data) {
    const site = currentLegacySite();
    const inputEl = typeof findFirst === "function" ? findFirst(site.inputSelectors) : null;
    if (!inputEl || typeof attachFiles !== "function") return false;
    return attachFiles(inputEl, data.payload?.files || data.payload?.images || [], site.id);
  }

  const quoteController = globalThis.AskAiTogetherQuoteUi?.createController?.({
    getPayload(text) {
      return {
        text,
        siteId: effectiveLegacySiteId(currentLegacySite()),
        url: location.href
      };
    },
    onQuote(payload) {
      postToExtensionParent({
        type: "QUOTE_TEXT",
        payload
      });
    }
  });

  function showQuoteButton() {
    quoteController?.show();
  }

  function removeQuoteButton() {
    quoteController?.remove();
  }

  const shouldRegisterLegacyMessageListener = !askRuntime ||
    askRuntime.markListenerRegistered?.("legacy-iframe-message") !== false;

  if (shouldRegisterLegacyMessageListener) {
    window.addEventListener("message", (event) => {
      if (window.parent === window) return;
      const extOrigin = extensionOrigin();
      if (normalizeOrigin(event.origin) !== extOrigin) return;
      const data = event.data;
      if (!data || !data.type) return;

      if (data.type === "CHAT_MESSAGE") {
        const validation = validateLegacyRuntimeEnvelope(data, "sendPrompt", {
          disallowFilePayload: true,
          requireRequestId: false
        });
        const configuredSiteId = rememberLegacyConfiguredSiteId(data.config?.siteId);
        const providerId = validation.envelope?.providerId || effectiveLegacySiteId(currentLegacySite(), configuredSiteId);
        if (!validation.ok) {
          const status = validation.errors.includes("file-payload-unsupported") ? "capability-unsupported" : "transport-failed";
          postSendProgress(String(data.payload?.requestId || ""), providerId, status, {
            reason: validation.errors.join(",")
          });
          return;
        }
        const transport = getLegacyContentRuntimeTransport();
        if (!transport?.sendPrompt) {
          reportMissingTransport("sendPrompt", validation.envelope.requestId, providerId);
          return;
        }
        void transport.sendPrompt([providerId], data.message || "", {
          requestId: validation.envelope.requestId,
          payload: validation.envelope.payload
        });
      } else if (data.type === "ATTACH_FILES" || data.type === "ATTACH_IMAGES") {
        void attachLegacyFiles(data);
      } else if (data.type === "NEW_CHAT") {
        const validation = validateLegacyRuntimeEnvelope(data, "newChat", { requireRequestId: false });
        const configuredSiteId = rememberLegacyConfiguredSiteId(data.config?.siteId);
        const providerId = validation.envelope?.providerId || effectiveLegacySiteId(currentLegacySite(), configuredSiteId);
        if (!validation.ok) return;
        const transport = getLegacyContentRuntimeTransport();
        if (!transport?.newChat) {
          reportMissingTransport("newChat", validation.envelope.requestId, providerId);
          return;
        }
        void Promise.resolve(transport.newChat([providerId], {
          requestId: validation.envelope.requestId,
          payload: validation.envelope.payload
        })).catch(() => {});
      } else if (data.type === "COLLECT_LAST_RESPONSE") {
        const validation = validateLegacyRuntimeEnvelope(data, "collectLatest", { requireRequestId: true });
        const configuredSiteId = rememberLegacyConfiguredSiteId(data.config?.siteId);
        const site = currentLegacySite();
        const requestId = validation.envelope?.requestId || String(data.payload?.requestId || "");
        const providerId = validation.envelope?.providerId || effectiveLegacySiteId(site, configuredSiteId);
        if (!validation.ok) return;
        const transport = getLegacyContentRuntimeTransport();
        if (!transport?.collectLatest) {
          const outcome = reportMissingTransport("collectLatest", requestId, providerId);
          postToExtensionParent({
            type: "LAST_RESPONSE",
            payload: {
              requestId,
              siteId: providerId,
              text: "",
              status: outcome.status,
              reason: outcome.status
            }
          });
          return;
        }
        void Promise.resolve(transport.collectLatest([providerId], {
          requestId,
          payload: validation.envelope.payload
        }))
          .then((outcome) => {
            postToExtensionParent({
              type: "LAST_RESPONSE",
              payload: {
                requestId,
                siteId: outcome?.providerId || effectiveLegacySiteId(site, configuredSiteId),
                text: outcome?.text || "",
                status: outcome?.status || "",
                reason: outcome?.reason || outcome?.error || ""
              }
            });
          })
          .catch((error) => {
            postToExtensionParent({
              type: "LAST_RESPONSE",
              payload: {
                requestId,
                siteId: effectiveLegacySiteId(site, configuredSiteId),
                text: "",
                status: "transport-failed",
                reason: String(error?.message || error || "")
              }
            });
          });
      }
    });
  }

  const shouldRegisterLegacyEmbeddedEvents = !askRuntime ||
    askRuntime.markListenerRegistered?.("legacy-embedded-events") !== false;

  if (isExtensionEmbeddedFrame() && shouldRegisterLegacyEmbeddedEvents) {
    document.addEventListener("mouseup", showQuoteButton);
    document.addEventListener("touchend", showQuoteButton);
    document.addEventListener(
      "keydown",
      (event) => {
        const isFocusShortcut = (event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "f";
        if (!isFocusShortcut) return;
        postToExtensionParent({ type: "PANE_EXIT_FOCUS" });
      },
      true
    );
    document.addEventListener("click", (event) => {
      if (event.target && event.target.closest(".oa-quote-float-btn")) return;
      removeQuoteButton();
    });
    window.addEventListener("scroll", removeQuoteButton, true);
  }

  function postUrlUpdate() {
    const site = currentLegacySite();
    postToExtensionParent({
      type: "UPDATE_HISTORY",
      payload: {
        siteId: effectiveLegacySiteId(site),
        url: location.href
      }
    });
  }

  const shouldRegisterLegacyUrlUpdates = !askRuntime ||
    askRuntime.markListenerRegistered?.("legacy-url-updates") !== false;

  if (isExtensionEmbeddedFrame() && shouldRegisterLegacyUrlUpdates) {
    postUrlUpdate();
    setInterval(() => {
      if (location.href === lastHref) return;
      lastHref = location.href;
      postUrlUpdate();
    }, 600);
  }
})();
