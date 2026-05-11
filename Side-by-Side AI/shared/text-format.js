(function initAskAiTogetherTextFormat(global) {
  "use strict";

  var DEFAULT_SEPARATOR = "\n\n---------\n\n";

  function normalizeCollectedResponseText(text) {
    return String(text || "")
      .replaceAll(/\r\n?/g, "\n")
      .replaceAll(/\n{3,}/g, "\n\n")
      .trim();
  }

  function cleanDiagnostic(value) {
    return String(value || "")
      .trim()
      .replaceAll(/\s+/g, " ");
  }

  function diagnosticText(section, options) {
    var source = section && typeof section === "object" ? section : {};
    var status = cleanDiagnostic(source.status);
    var reason = cleanDiagnostic(source.reason || source.error);
    if (!status && !reason) return "";

    var formatter = options && typeof options.formatDiagnostic === "function" ? options.formatDiagnostic : null;
    if (formatter) {
      return cleanDiagnostic(formatter({
        status: status,
        reason: reason,
        section: source
      }));
    }
    if (status && reason) return status + ": " + reason;
    return status || reason;
  }

  function fallbackText(section, options) {
    var unavailableText = String(options?.unavailableText || "Unavailable");
    var diagnostic = diagnosticText(section, options);
    if (!diagnostic) return unavailableText;
    return unavailableText + " (" + diagnostic + ")";
  }

  function formatSection(section, options) {
    var source = section && typeof section === "object" ? section : {};
    var siteName = String(source.siteName || source.displayName || source.siteId || "Unknown");
    var text = normalizeCollectedResponseText(source.text);
    return "[" + siteName + "]\n" + (text || fallbackText(source, options || {}));
  }

  function buildCombinedLatestPrompt(sections, existingPrompt, options) {
    var list = Array.isArray(sections) ? sections : [];
    var opts = options || {};
    var separator = typeof opts.separator === "string" ? opts.separator : DEFAULT_SEPARATOR;
    var body = list.map(function (section) {
      return formatSection(section, opts);
    }).join(separator);
    var footer = String(existingPrompt || "").trim() || String(opts.footerText || "").trim();
    if (!list.length) return footer;
    return body + separator + footer;
  }

  global.AskAiTogetherTextFormat = {
    normalizeCollectedResponseText: normalizeCollectedResponseText,
    buildCombinedLatestPrompt: buildCombinedLatestPrompt,
    formatSection: formatSection
  };
})(globalThis);
