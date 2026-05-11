"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");

const repoRoot = path.resolve(__dirname, "..");
const providerCatalogPath = path.join(repoRoot, "Side-by-Side AI", "shared", "provider-catalog.js");
const contentSitesPath = path.join(repoRoot, "Side-by-Side AI", "content", "content-sites.js");
const contentDomPath = path.join(repoRoot, "Side-by-Side AI", "content", "content-dom.js");
const contentResponsePath = path.join(repoRoot, "Side-by-Side AI", "content", "content-response.js");
const responseSource = `${fs.readFileSync(contentResponsePath, "utf8")}
globalThis.__sharedResponseTestApi = {
  extractLatestResponseText,
  setLastSubmittedPromptText(value) {
    rememberSubmittedPromptText(value);
  }
};`;

class FakeElement {
  constructor(tagName, attrs = {}, text = "", rect = {}, children = []) {
    this.tagName = String(tagName || "div").toUpperCase();
    this.localName = this.tagName.toLowerCase();
    this.attrs = { ...attrs };
    this._text = text;
    this.children = [];
    this.parentElement = null;
    this.style = {
      display: "block",
      visibility: "visible",
      opacity: "1"
    };
    this.rect = {
      top: rect.top ?? 0,
      bottom: rect.bottom ?? 20,
      width: rect.width ?? 100,
      height: rect.height ?? 20
    };
    for (const child of children) this.appendChild(child);
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
  }

  get textContent() {
    return [this._text, ...this.children.map((child) => child.textContent)].filter(Boolean).join("\n");
  }

  get innerText() {
    return this.textContent;
  }

  get id() {
    return this.attrs.id || "";
  }

  get classList() {
    return new Set(String(this.attrs.class || "").split(/\s+/).filter(Boolean));
  }

  getAttribute(name) {
    return this.attrs[name] ?? null;
  }

  contains(target) {
    if (target === this) return true;
    return this.children.some((child) => child.contains(target));
  }

  closest(selector) {
    let node = this;
    while (node) {
      if (matchesSelectorList(node, selector)) return node;
      node = node.parentElement;
    }
    return null;
  }

  querySelectorAll(selector) {
    const matches = [];
    const visit = (node) => {
      for (const child of node.children) {
        if (matchesSelectorList(child, selector)) matches.push(child);
        visit(child);
      }
    };
    visit(this);
    return matches;
  }

  getBoundingClientRect() {
    return this.rect;
  }
}

class FakeDocument extends FakeElement {
  constructor(children = []) {
    super("document", {}, "", { width: 100, height: 100 }, children);
    this.documentElement = this;
    this.body = this;
    this.referrer = "";
  }

  addEventListener() {}
}

function el(tagName, attrs, text, rect, children) {
  return new FakeElement(tagName, attrs, text, rect, children);
}

function matchesSelectorList(node, selector) {
  return String(selector || "")
    .split(",")
    .some((part) => matchesSelector(node, part.trim()));
}

function matchesSelector(node, selector) {
  if (!selector) return false;
  const descendantMatch = selector.match(/^(.+)\s+([^\s]+)$/);
  if (descendantMatch) {
    return matchesSelector(node, descendantMatch[2]) && Boolean(node.closest(descendantMatch[1]));
  }
  if (selector.startsWith("#")) return node.id === selector.slice(1);
  if (selector.startsWith(".")) return node.classList.has(selector.slice(1));

  const attrOnly = selector.match(/^\[([^=\]*]+)([*]?=)?["']?([^"'\]]*)["']?\]$/);
  if (attrOnly) return matchesAttribute(node, attrOnly[1], attrOnly[2], attrOnly[3]);

  const tagAttr = selector.match(/^([a-z0-9-]+)(\[.+\])$/i);
  if (tagAttr) return node.localName === tagAttr[1].toLowerCase() && matchesSelector(node, tagAttr[2]);

  return node.localName === selector.toLowerCase();
}

function matchesAttribute(node, name, operator, expected) {
  const value = node.getAttribute(name);
  if (value === null) return false;
  if (!operator) return true;
  if (operator === "=") return String(value) === expected;
  if (operator === "*=") return String(value).includes(expected);
  return false;
}

function makeContext() {
  const context = vm.createContext({
    console,
    Date,
    URL,
    location: {
      hostname: "chatgpt.com",
      href: "https://chatgpt.com/",
      origin: "https://chatgpt.com"
    },
    document: new FakeDocument(),
    window: null,
    globalThis: null
  });
  context.globalThis = context;
  context.window = {
    setTimeout() {},
    clearTimeout() {},
    getComputedStyle(node) {
      return node.style;
    }
  };
  return context;
}

function setPage(context, hostname, root) {
  context.location.hostname = hostname;
  context.location.href = `https://${hostname}/`;
  context.location.origin = `https://${hostname}`;
  context.document = new FakeDocument([root]);
}

const context = makeContext();
vm.runInContext(fs.readFileSync(providerCatalogPath, "utf8"), context, { filename: providerCatalogPath });
vm.runInContext(fs.readFileSync(contentSitesPath, "utf8"), context, { filename: contentSitesPath });
vm.runInContext(fs.readFileSync(contentDomPath, "utf8"), context, { filename: contentDomPath });
vm.runInContext(responseSource, context, { filename: contentResponsePath });
const api = context.__sharedResponseTestApi;

setPage(
  context,
  "chatgpt.com",
  el("main", {}, "", {}, [
    el("div", { id: "prompt-textarea", contenteditable: "true" }, "", { top: 90, bottom: 110 }),
    el("article", {}, "", { top: 10, bottom: 30 }, [
      el("div", { "data-message-author-role": "assistant" }, "OK SHARED", { top: 10, bottom: 30 })
    ])
  ])
);
assert.equal(api.extractLatestResponseText(), "OK SHARED");

api.setLastSubmittedPromptText("User prompt that should not be collected");
setPage(
  context,
  "grok.com",
  el("main", {}, "", {}, [
    el("textarea", { "aria-label": "Ask" }, "", { top: 90, bottom: 110 }),
    el("div", { class: "prose" }, "User prompt that should not be collected", { top: 10, bottom: 30 }),
    el("div", {}, "", { top: 40, bottom: 60 }, [
      el("div", { class: "prose" }, "OK SHARED", { top: 40, bottom: 60 })
    ])
  ])
);
assert.equal(api.extractLatestResponseText(), "OK SHARED");

api.setLastSubmittedPromptText("");
setPage(
  context,
  "grok.com",
  el("main", {}, "", {}, [
    el("textarea", { "aria-label": "Ask" }, "", { top: 90, bottom: 110 }),
    el("div", { "data-testid": "assistant-message" }, "", { top: 20, bottom: 40 }, [
      el("div", { class: "prose" }, "Thought for 5s\n\nOK COLLECT", { top: 20, bottom: 40 })
    ])
  ])
);
assert.equal(api.extractLatestResponseText(), "OK COLLECT");

api.setLastSubmittedPromptText("Wrapped user prompt should not win");
setPage(
  context,
  "grok.com",
  el("main", {}, "", {}, [
    el("textarea", { "aria-label": "Ask" }, "", { top: 120, bottom: 140 }),
    el("div", { "data-testid": "assistant-message" }, "", { top: 20, bottom: 40 }, [
      el("div", { class: "prose" }, "OK ASSISTANT", { top: 20, bottom: 40 })
    ]),
    el("div", { class: "prose" }, "Wrapped user prompt should not win\nEdit\nCopy\nShare", {
      top: 80,
      bottom: 100
    })
  ])
);
assert.equal(api.extractLatestResponseText(), "OK ASSISTANT");

setPage(
  context,
  "gemini.google.com",
  el("main", {}, "", {}, [
    el("div", { class: "ql-editor", contenteditable: "true" }, "", { top: 90, bottom: 110 }),
    el("message-content", {}, "Gemini 說了\n顯示思路\nOK SHARED", { top: 20, bottom: 40 })
  ])
);
assert.equal(api.extractLatestResponseText(), "OK SHARED");

api.setLastSubmittedPromptText("");
setPage(
  context,
  "claude.ai",
  el("main", {}, "", {}, [
    el("div", { contenteditable: "true", class: "prose" }, "", { top: 180, bottom: 200 }),
    el("div", { "data-testid": "assistant-message" }, "OK CLAUDE ASSISTANT SIGNAL", {
      top: 20,
      bottom: 40
    }),
    el("div", { class: "prose" }, "Help menu text should not win", { top: 270, bottom: 290 })
  ])
);
assert.equal(api.extractLatestResponseText(), "OK CLAUDE ASSISTANT SIGNAL");

setPage(
  context,
  "claude.ai",
  el("main", {}, "", {}, [
    el("div", { contenteditable: "true" }, "", { top: 220, bottom: 240 }),
    el("section", {}, "", { top: 20, bottom: 80 }, [
      el("h2", {}, "Claude responded:", { top: 20, bottom: 30 }),
      el("div", { class: "message-block" }, "OK CLAUDE HEADING RESPONSE", { top: 34, bottom: 70 })
    ]),
    el("div", { class: "prose" }, "Help menu text should not win", { top: 270, bottom: 290 })
  ])
);
assert.equal(api.extractLatestResponseText(), "OK CLAUDE HEADING RESPONSE");

api.setLastSubmittedPromptText("Claude user prompt should not win");
setPage(
  context,
  "claude.ai",
  el("main", {}, "", {}, [
    el("div", { contenteditable: "true", class: "prose" }, "Claude input draft should not win", {
      top: 180,
      bottom: 200
    }),
    el("button", { class: "prose" }, "Retry should not win", { top: 210, bottom: 230 }),
    el("div", { "data-testid": "user-message", class: "prose" }, "Claude user prompt should not win", {
      top: 240,
      bottom: 260
    }),
    el("div", { class: "prose" }, "Help menu text should not win", { top: 270, bottom: 290 }),
    el("div", { "data-is-streaming": "false" }, "", { top: 20, bottom: 40 }, [
      el("div", { class: "font-claude-message" }, "OK CLAUDE", { top: 20, bottom: 40 })
    ])
  ])
);
assert.equal(api.extractLatestResponseText(), "OK CLAUDE");

api.setLastSubmittedPromptText("Claude user prompt should not win");
setPage(
  context,
  "claude.ai",
  el("main", {}, "", {}, [
    el("div", { contenteditable: "true" }, "Claude input draft should not win", {
      top: 220,
      bottom: 240
    }),
    el("div", {}, "", { top: 10, bottom: 160 }, [
      el("h2", {}, "You said: Claude user prompt should not win", { top: 10, bottom: 30 }),
      el("div", {}, "Claude user prompt should not win", { top: 35, bottom: 55 }),
      el(
        "h2",
        {},
        "Claude responded: This heading is an accessible summary, not the full answer",
        { top: 70, bottom: 90 }
      ),
      el("div", {}, "OK CLAUDE ACCESSIBLE HEADING\n\nSecond paragraph survives.", { top: 95, bottom: 140 }),
      el("div", {}, "Message actions\nCopy\nRetry", { top: 145, bottom: 160 })
    ])
  ])
);
assert.equal(api.extractLatestResponseText(), "OK CLAUDE ACCESSIBLE HEADING\n\nSecond paragraph survives.");

console.log("shared content response extraction validation passed");
