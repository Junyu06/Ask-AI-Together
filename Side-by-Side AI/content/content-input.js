"use strict";

/**
 * ChatGPT 等对前导换行极敏感：textarea / ProseMirror 会显示成「先空一行再正文」。
 * 只剥掉头部的换行类字符与 BOM / 零宽字符，不剥普通行首空格。
 */
function stripLeadingNewlinesForPrompt(text) {
  return String(text || "")
    .replace(/^[\r\n\u2028\u2029\uFEFF]+/g, "")
    .replace(/^[\u200B-\u200D\uFEFF]+/g, "");
}

function setInputValue(el, text, siteId = "") {
  if (!el) return false;

  const payload = siteId === "chatgpt" ? stripLeadingNewlinesForPrompt(text) : text;

  const tag = el.tagName;
  if (tag === "TEXTAREA" || tag === "INPUT") {
    el.focus();
    const proto = tag === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (nativeSetter) {
      nativeSetter.call(el, payload);
    } else {
      el.value = payload;
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  if (el.isContentEditable) {
    return setContentEditableValue(el, payload, siteId);
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

function replaceChatGptContents(el, text) {
  let lines = normalizeEditableText(stripLeadingNewlinesForPrompt(text)).split("\n");
  while (lines.length && lines[0] === "") {
    lines.shift();
  }

  const fragment = document.createDocumentFragment();

  lines.forEach((line) => {
    const p = document.createElement("p");
    if (line) {
      p.textContent = line;
    } else {
      p.appendChild(document.createElement("br"));
    }
    fragment.appendChild(p);
  });

  if (!lines.length) {
    const p = document.createElement("p");
    p.appendChild(document.createElement("br"));
    fragment.appendChild(p);
  }

  el.replaceChildren(fragment);
  placeCaretAtEnd(el);
}

function trimLeadingEmptyBlocks(el) {
  if (!el?.childNodes?.length) return;
  while (el.firstChild) {
    const node = el.firstChild;
    if (node.nodeType === Node.TEXT_NODE) {
      if (String(node.textContent || "").trim()) break;
      node.remove();
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) break;
    const text = normalizeEditableText(node.textContent || "").trim();
    const onlyBreaks = node.childNodes.length > 0 && Array.from(node.childNodes).every((child) => {
      if (child.nodeType === Node.TEXT_NODE) return !String(child.textContent || "").trim();
      return child.nodeType === Node.ELEMENT_NODE && String(child.nodeName || "").toUpperCase() === "BR";
    });
    if (text || !onlyBreaks) break;
    node.remove();
  }
}

function setContentEditableValue(el, text, siteId = "") {
  const t = siteId === "chatgpt" ? stripLeadingNewlinesForPrompt(text) : text;

  el.focus();
  const selection = window.getSelection?.();
  if (selection) {
    const range = document.createRange();
    range.selectNodeContents(el);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  try {
    if (siteId === "chatgpt") {
      let lines = normalizeEditableText(t).split("\n");
      while (lines.length && lines[0] === "") {
        lines.shift();
      }
      const html = lines
        .map((line) => `<p>${line ? line.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;") : "<br>"}</p>`)
        .join("");
      if (html && document.execCommand("insertHTML", false, html)) {
        const actual = readEditableText(el).trimEnd();
        const expected = normalizeEditableText(t).trimEnd();
        if (actual === expected) {
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          return true;
        }
      }
    }

    if (document.execCommand("insertText", false, t)) {
      const actual = readEditableText(el).trimEnd();
      const expected = normalizeEditableText(t).trimEnd();
      if (actual === expected) {
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        return true;
      }
    }
  } catch (_error) {
    // Fall through to DOM-based insertion for editors that ignore execCommand.
  }

  if (siteId === "chatgpt") {
    replaceChatGptContents(el, t);
  } else {
    replaceEditableContents(el, t);
  }
  if (siteId === "chatgpt") {
    trimLeadingEmptyBlocks(el);
  }
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function clickSend(site, inputEl) {
  const btn = findFirst(site.sendSelectors);
  if (btn) {
    const ariaDisabled = String(btn.getAttribute("aria-disabled") || "").toLowerCase() === "true";
    if (!btn.disabled && !ariaDisabled) {
      btn.click();
      return true;
    }
  }

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
