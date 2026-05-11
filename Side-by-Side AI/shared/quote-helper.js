(function initAskAiTogetherQuoteHelper(global) {
  "use strict";

  function isSelectionInsideEditable(range) {
    const elementNodeType = global.Node?.ELEMENT_NODE || 1;
    const node = range.commonAncestorContainer?.nodeType === elementNodeType
      ? range.commonAncestorContainer
      : range.commonAncestorContainer?.parentElement;
    if (!node) return false;
    return Boolean(node.closest?.("textarea, input, [contenteditable='true']"));
  }

  function quoteBtnLabel() {
    const lang = String(navigator.language || "").toLowerCase();
    return lang.startsWith("zh") ? "引用" : "Quote";
  }

  function debounce(fn, wait) {
    let timer = null;
    return (...args) => {
      if (timer) global.clearTimeout(timer);
      timer = global.setTimeout(() => fn(...args), wait);
    };
  }

  function createQuoteButton(rect, text, options) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = options.buttonClassName;
    button.textContent = quoteBtnLabel();
    Object.assign(button.style, {
      position: "absolute",
      zIndex: "2147483646",
      left: `${rect.left + global.scrollX}px`,
      top: `${rect.bottom + global.scrollY + 8}px`,
      padding: "4px 8px",
      border: "1px solid rgba(255,255,255,0.2)",
      borderRadius: "8px",
      background: "rgba(20,20,20,0.9)",
      color: "#fff",
      fontSize: "12px",
      lineHeight: "16px",
      cursor: "pointer",
      boxShadow: "0 8px 18px rgba(0,0,0,0.35)"
    });

    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const payload = options.getPayload(text);
      options.onQuote(payload);
      options.remove();
      const selection = global.getSelection?.();
      selection?.removeAllRanges?.();
    });

    return button;
  }

  function createController(config = {}) {
    const options = {
      buttonClassName: String(config.buttonClassName || "oa-quote-float-btn"),
      maxLength: Number(config.maxLength || 2500),
      debounceMs: Number(config.debounceMs || 160),
      getPayload: typeof config.getPayload === "function" ? config.getPayload : (text) => ({ text }),
      onQuote: typeof config.onQuote === "function" ? config.onQuote : () => {}
    };

    options.remove = function removeQuoteButton() {
      const old = document.querySelector(`.${options.buttonClassName}`);
      if (old) old.remove();
    };

    const show = debounce(() => {
      try {
        options.remove();
        const selection = global.getSelection?.();
        const text = selection?.toString().trim();
        if (!text || !selection?.rangeCount) return;
        const range = selection.getRangeAt(0);
        if (range.collapsed || isSelectionInsideEditable(range)) return;
        const clipped = text.slice(0, options.maxLength);
        const rect = range.getBoundingClientRect();
        if (!rect.width && !rect.height) return;
        document.body.appendChild(createQuoteButton(rect, clipped, options));
      } catch (_error) {
        // Ignore UI-only errors.
      }
    }, options.debounceMs);

    return {
      show,
      remove: options.remove
    };
  }

  global.AskAiTogetherQuoteUi = {
    createController,
    isSelectionInsideEditable
  };
})(globalThis);
