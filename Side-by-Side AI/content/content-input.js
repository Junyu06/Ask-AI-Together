"use strict";

function setInputValue(el, text, siteId = "") {
  if (!el) return false;

  const tag = el.tagName;
  if (tag === "TEXTAREA" || tag === "INPUT") {
    el.focus();
    const proto = tag === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (nativeSetter) {
      nativeSetter.call(el, text);
    } else {
      el.value = text;
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  if (el.isContentEditable) {
    return setContentEditableValue(el, text, siteId);
  }

  return false;
}

function normalizeEditableText(text) {
  return String(text || "")
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .replace(/\u00a0/g, " ");
}

function readEditableText(el) {
  return normalizeEditableText(el?.innerText || el?.textContent || "");
}

function readInputValue(el) {
  if (!el) return "";
  const tag = String(el.tagName || "").toUpperCase();
  if (tag === "TEXTAREA" || tag === "INPUT") {
    return normalizeEditableText(el.value || "");
  }
  if (el.isContentEditable) {
    return readEditableText(el);
  }
  return normalizeEditableText(el.textContent || "");
}

function placeCaretAtEnd(el) {
  const selection = window.getSelection?.();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function replaceEditableContents(el, text) {
  const lines = normalizeEditableText(text).split("\n");
  const fragment = document.createDocumentFragment();

  lines.forEach((line, index) => {
    if (line) {
      fragment.appendChild(document.createTextNode(line));
    }
    if (index < lines.length - 1) {
      fragment.appendChild(document.createElement("br"));
    }
  });

  el.replaceChildren(fragment);
  placeCaretAtEnd(el);
}

function setContentEditableValue(el, text, siteId = "") {
  el.focus();
  const selection = window.getSelection?.();
  if (selection) {
    const range = document.createRange();
    range.selectNodeContents(el);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  try {
    if (document.execCommand("insertText", false, text)) {
      const actual = readEditableText(el).trimEnd();
      const expected = normalizeEditableText(text).trimEnd();
      if (actual === expected) {
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
    }
  } catch (_error) {
    // Fall through to DOM-based insertion for editors that ignore execCommand.
  }

  replaceEditableContents(el, text);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function isEnabledSendControl(el) {
  if (!el || !isVisible(el)) return false;
  const ariaDisabled = String(el.getAttribute?.("aria-disabled") || "").toLowerCase() === "true";
  const disabledAttr = typeof el.getAttribute === "function" && el.getAttribute("disabled") !== null;
  return !el.disabled && !ariaDisabled && !disabledAttr;
}

function findSendControl(site) {
  const selectors = Array.isArray(site?.sendSelectors) ? site.sendSelectors : [];
  return queryDeepAll(selectors).find(isEnabledSendControl) || null;
}

function clickSendControl(el) {
  if (!el) return false;
  el.focus?.();
  if (typeof MouseEvent === "function") {
    ["pointerdown", "mousedown", "pointerup", "mouseup"].forEach((eventType) => {
      el.dispatchEvent(new MouseEvent(eventType, { bubbles: true, cancelable: true, view: window }));
    });
  }
  el.click();
  return true;
}

function clickSend(site, inputEl) {
  const btn = findSendControl(site);
  if (clickSendControl(btn)) return true;

  if (!inputEl) return false;
  ["keydown", "keypress", "keyup"].forEach((eventType) => {
    const event = new KeyboardEvent(eventType, {
      bubbles: true,
      cancelable: true,
      key: "Enter",
      code: "Enter",
      keyCode: 13
    });
    inputEl.dispatchEvent(event);
  });
  return true;
}

async function clickSendWithRetry(site, inputEl, options = {}) {
  const attempts = Number(options.attempts) > 0 ? Number(options.attempts) : 1;
  const delayMs = Number(options.delay) >= 0 ? Number(options.delay) : 200;
  for (let i = 0; i < attempts; i += 1) {
    if (clickSend(site, inputEl)) return true;
    if (i < attempts - 1) await sleep(delayMs);
  }
  return false;
}
