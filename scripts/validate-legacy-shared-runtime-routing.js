"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");

const repoRoot = path.resolve(__dirname, "..");
const extensionRoot = path.join(repoRoot, "Side-by-Side AI");
const runtimeContractPath = path.join(extensionRoot, "shared", "runtime-contract.js");
const providerCatalogPath = path.join(extensionRoot, "shared", "provider-catalog.js");
const quoteHelperPath = path.join(extensionRoot, "shared", "quote-helper.js");
const legacyContentPath = path.join(extensionRoot, "legacy", "content.js");
const contentRuntimePaths = [
  path.join(extensionRoot, "content", "content-sites.js"),
  path.join(extensionRoot, "content", "content-dom.js"),
  path.join(extensionRoot, "content", "content-response.js"),
  path.join(extensionRoot, "content", "content-input.js"),
  path.join(extensionRoot, "content", "content-attachments.js"),
  path.join(extensionRoot, "content", "content-send-runtime.js"),
  path.join(extensionRoot, "content", "content-shared-runtime.js")
];

const EXTENSION_ORIGIN = "chrome-extension://ask-ai-together";

class FakeElement {
  constructor(ownerDocument, tagName, attrs = {}, text = "", rect = {}, children = []) {
    this.ownerDocument = ownerDocument || null;
    this.tagName = String(tagName || "div").toUpperCase();
    this.localName = this.tagName.toLowerCase();
    this.attrs = { ...attrs };
    this._text = text;
    this.value = text;
    this.children = [];
    this.parentElement = null;
    this.shadowRoot = null;
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
    this.disabled = false;
    this.clicked = 0;
    for (const child of children) this.appendChild(child);
  }

  appendChild(child) {
    child.parentElement = this;
    child.ownerDocument = this.ownerDocument;
    this.children.push(child);
    return child;
  }

  replaceChildren(...children) {
    this.children = [];
    this._text = "";
    for (const child of children) this.appendChild(child);
  }

  remove() {
    if (!this.parentElement) return;
    this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
    this.parentElement = null;
  }

  focus() {
    if (this.ownerDocument) this.ownerDocument.activeElement = this;
  }

  click() {
    this.clicked += 1;
  }

  dispatchEvent() {
    return true;
  }

  get textContent() {
    return [this._text, ...this.children.map((child) => child.textContent)].filter(Boolean).join("\n");
  }

  set textContent(value) {
    this._text = String(value || "");
    this.children = [];
  }

  get innerText() {
    return this.textContent;
  }

  set innerText(value) {
    this.textContent = value;
  }

  get id() {
    return this.attrs.id || "";
  }

  set id(value) {
    this.attrs.id = String(value || "");
  }

  get isContentEditable() {
    return String(this.attrs.contenteditable || "").toLowerCase() === "true";
  }

  get classList() {
    return new Set(String(this.attrs.class || "").split(/\s+/).filter(Boolean));
  }

  getAttribute(name) {
    return this.attrs[name] ?? null;
  }

  setAttribute(name, value) {
    this.attrs[name] = String(value);
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

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }

  getBoundingClientRect() {
    return this.rect;
  }
}

class FakeDocument extends FakeElement {
  constructor() {
    super(null, "document", {}, "", { width: 100, height: 100 });
    this.ownerDocument = this;
    this.documentElement = this;
    this.body = this;
    this.referrer = `${EXTENSION_ORIGIN}/legacy/index.html`;
    this.activeElement = null;
    this._listeners = {};
  }

  createElement(tagName) {
    return new FakeElement(this, tagName);
  }

  createTextNode(text) {
    return new FakeElement(this, "#text", {}, String(text || ""));
  }

  createDocumentFragment() {
    return new FakeElement(this, "#fragment");
  }

  createRange() {
    return {
      selectNodeContents() {},
      collapse() {},
      getBoundingClientRect() {
        return { width: 0, height: 0 };
      }
    };
  }

  execCommand() {
    return false;
  }

  getElementById(id) {
    return this.querySelector(`#${id}`);
  }

  addEventListener(type, listener) {
    this._listeners[type] = this._listeners[type] || [];
    this._listeners[type].push(listener);
  }

  removeEventListener(type, listener) {
    this._listeners[type] = (this._listeners[type] || []).filter((item) => item !== listener);
  }

  dispatchEvent(event) {
    for (const listener of this._listeners[event?.type] || []) listener(event);
    return true;
  }
}

function el(document, tagName, attrs, text, rect, children) {
  return new FakeElement(document, tagName, attrs, text, rect, children);
}

function setPage(document) {
  document.children = [];
  const input = el(document, "textarea", { id: "prompt-textarea" }, "", { top: 90, bottom: 110 });
  const sendButton = el(document, "button", { "data-testid": "send-button", type: "submit" }, "Send", { top: 90, bottom: 110 });
  const assistant = el(
    document,
    "div",
    { "data-message-author-role": "assistant" },
    "shared latest",
    { top: 10, bottom: 30 }
  );
  const article = el(document, "article", {}, "", { top: 10, bottom: 30 }, [assistant]);
  document.appendChild(el(document, "main", {}, "", {}, [article, input, sendButton]));
}

function setClaudePage(document) {
  document.children = [];
  const userHeading = el(document, "h2", {}, "You said: old user prompt", { top: 10, bottom: 25 });
  const userText = el(document, "div", {}, "old user prompt", { top: 30, bottom: 45 });
  const responseHeading = el(
    document,
    "h2",
    {},
    "Claude responded: accessible heading summary",
    { top: 50, bottom: 65 }
  );
  const response = el(document, "div", {}, "Claude latest visible reply", { top: 70, bottom: 90 });
  const actions = el(document, "div", {}, "Message actions\nCopy\nRetry", { top: 95, bottom: 110 });
  const input = el(document, "div", { contenteditable: "true" }, "", { top: 130, bottom: 150 });
  document.appendChild(el(document, "main", {}, "", {}, [userHeading, userText, responseHeading, response, actions, input]));
}

function setGeminiPage(document) {
  document.children = [];
  const input = el(document, "div", { class: "ql-editor", contenteditable: "true" }, "", { top: 100, bottom: 130 });
  const staleSubmit = el(
    document,
    "button",
    { class: "submit", "aria-disabled": "true" },
    "old disabled submit",
    { top: 150, bottom: 170 }
  );
  const sendButton = el(
    document,
    "button",
    { "aria-label": "傳送訊息" },
    "傳送",
    { top: 150, bottom: 170 }
  );
  document.appendChild(el(document, "main", {}, "", {}, [input, staleSubmit, sendButton]));
  return { input, staleSubmit, sendButton };
}

function setHost(context, hostname) {
  context.location.hostname = hostname;
  context.location.href = `https://${hostname}/`;
  context.location.origin = `https://${hostname}`;
}

function matchesSelectorList(node, selector) {
  return String(selector || "")
    .split(",")
    .some((part) => matchesDescendantSelector(node, part.trim()));
}

function matchesDescendantSelector(node, selector) {
  const parts = selector.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return matchesSimpleSelector(node, selector);
  if (!matchesSimpleSelector(node, parts[parts.length - 1])) return false;
  let ancestor = node.parentElement;
  for (let index = parts.length - 2; index >= 0; index -= 1) {
    while (ancestor && !matchesSimpleSelector(ancestor, parts[index])) {
      ancestor = ancestor.parentElement;
    }
    if (!ancestor) return false;
    ancestor = ancestor.parentElement;
  }
  return true;
}

function matchesSimpleSelector(node, selector) {
  if (!selector || !node?.localName) return false;
  if (selector.startsWith("#")) return node.id === selector.slice(1);
  if (selector.startsWith(".")) return node.classList.has(selector.slice(1));

  const tagClass = selector.match(/^([a-z0-9-]+)\.([A-Za-z0-9_-]+)$/i);
  if (tagClass) return node.localName === tagClass[1].toLowerCase() && node.classList.has(tagClass[2]);

  const attrOnly = selector.match(/^\[([^\]=*]+)(\*=|=)?(?:"([^"]*)"|'([^']*)'|([^\]\s]+))?(?:\s+i)?\]$/);
  if (attrOnly) return matchesAttribute(node, attrOnly[1], attrOnly[2], attrOnly[3] ?? attrOnly[4] ?? attrOnly[5] ?? "");

  const tagAttr = selector.match(/^([a-z0-9-]+)(\[.+\])$/i);
  if (tagAttr) return node.localName === tagAttr[1].toLowerCase() && matchesSimpleSelector(node, tagAttr[2]);

  return node.localName === selector.toLowerCase();
}

function matchesAttribute(node, name, operator, expected) {
  const value = node.getAttribute(name);
  if (value === null) return false;
  if (!operator) return true;
  if (operator === "=") return String(value) === expected;
  if (operator === "*=") return String(value).toLowerCase().includes(String(expected).toLowerCase());
  return false;
}

function loadScript(context, scriptPath) {
  vm.runInContext(fs.readFileSync(scriptPath, "utf8"), context, { filename: scriptPath });
}

function makeContext() {
  const messageListeners = [];
  const runtimeMessages = [];
  const parentWindow = {
    calls: [],
    postMessage(message, targetOrigin) {
      this.calls.push({ message, targetOrigin });
    }
  };
  const document = new FakeDocument();
  setPage(document);

  class FakeEvent {
    constructor(type, fields = {}) {
      this.type = type;
      Object.assign(this, fields);
    }
  }

  class FakeBlob {
    constructor(parts = [], options = {}) {
      this.parts = parts;
      this.type = options.type || "";
    }
  }

  class FakeFile extends FakeBlob {
    constructor(parts = [], name = "file.bin", options = {}) {
      super(parts, options);
      this.name = name;
    }
  }

  class FakeDataTransfer {
    constructor() {
      this.files = [];
      this.items = {
        add: (file) => {
          this.files.push(file);
        }
      };
    }
  }

  const context = vm.createContext({
    console,
    Date,
    Promise,
    URL,
    Uint8Array,
    Buffer,
    Node: { ELEMENT_NODE: 1 },
    Event: FakeEvent,
    KeyboardEvent: FakeEvent,
    DragEvent: FakeEvent,
    InputEvent: FakeEvent,
    ClipboardEvent: FakeEvent,
    CustomEvent: FakeEvent,
    Blob: FakeBlob,
    File: FakeFile,
    DataTransfer: FakeDataTransfer,
    HTMLTextAreaElement: class HTMLTextAreaElement {},
    HTMLInputElement: class HTMLInputElement {},
    navigator: { language: "en-US" },
    atob(value) {
      return Buffer.from(String(value || ""), "base64").toString("binary");
    },
    setTimeout(fn) {
      if (typeof fn === "function") fn();
      return 1;
    },
    clearTimeout() {},
    setInterval() {
      return 1;
    },
    clearInterval() {},
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    chrome: {
      runtime: {
        getURL(value = "") {
          return `${EXTENSION_ORIGIN}/${String(value || "").replace(/^\//, "")}`;
        },
        sendMessage(message) {
          runtimeMessages.push(message);
        }
      }
    },
    location: {
      hostname: "chatgpt.com",
      href: "https://chatgpt.com/",
      origin: "https://chatgpt.com",
      protocol: "https:",
      ancestorOrigins: [EXTENSION_ORIGIN],
      reload() {
        this.href = "https://chatgpt.com/";
      }
    },
    document,
    window: null,
    top: null,
    globalThis: null
  });

  context.globalThis = context;
  const windowStub = {
    parent: parentWindow,
    top: parentWindow,
    HTMLTextAreaElement: context.HTMLTextAreaElement,
    HTMLInputElement: context.HTMLInputElement,
    addEventListener(type, listener) {
      if (type === "message") messageListeners.push(listener);
    },
    setTimeout: context.setTimeout,
    clearTimeout() {},
    getComputedStyle(node) {
      return node?.style || { display: "block", visibility: "visible", opacity: "1" };
    },
    getSelection() {
      return {
        toString() {
          return "";
        },
        rangeCount: 0,
        removeAllRanges() {},
        addRange() {}
      };
    }
  };
  context.window = windowStub;
  context.top = parentWindow;
  return { context, messageListeners, parentWindow, runtimeMessages };
}

function dispatchMessage(messageListeners, data) {
  assert.equal(messageListeners.length, 1);
  messageListeners[0]({
    origin: EXTENSION_ORIGIN,
    data
  });
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

(async () => {
  const { context, messageListeners, parentWindow } = makeContext();
  loadScript(context, runtimeContractPath);
  loadScript(context, providerCatalogPath);
  loadScript(context, quoteHelperPath);
  for (const scriptPath of contentRuntimePaths) loadScript(context, scriptPath);
  loadScript(context, legacyContentPath);

  const runtime = context.__ASK_AI_TOGETHER_RUNTIME__;
  const sharedTransport = runtime.getTransport("legacy-content");
  assert.ok(sharedTransport, "expected content-shared-runtime to register legacy-content transport");
  assert.equal(sharedTransport.runtimeKind, "shared-content");
  assert.equal(typeof sharedTransport.sendPrompt, "function");
  assert.equal(typeof sharedTransport.collectLatest, "function");
  assert.equal(typeof sharedTransport.newChat, "function");

  const capabilities = sharedTransport.getCapabilities(["chatgpt"]);
  assert.equal(capabilities.status, "response-found");
  assert.deepEqual(JSON.parse(JSON.stringify(capabilities.capabilities)), [
    {
      siteId: "chatgpt",
      supportsAttachments: true,
      attachmentMode: "legacy-only"
    }
  ]);

  const sharedCalls = [];
  for (const method of ["sendPrompt", "collectLatest", "newChat"]) {
    const original = sharedTransport[method].bind(sharedTransport);
    sharedTransport[method] = function traceSharedTransportCall(...args) {
      sharedCalls.push({ method, args });
      return original(...args);
    };
  }

  dispatchMessage(messageListeners, {
    type: "CHAT_MESSAGE",
    message: "hello shared runtime",
    payload: { requestId: "send-1" },
    config: { siteId: "chatgpt" }
  });
  await flushPromises();
  assert.equal(sharedCalls.at(-1)?.method, "sendPrompt");
  assert.equal(sharedCalls.at(-1)?.args[1], "hello shared runtime");
  assert.deepEqual(Array.from(sharedCalls.at(-1)?.args[0] || []), ["chatgpt"]);
  assert.equal(sharedCalls.at(-1)?.args[2]?.requestId, "send-1");

  dispatchMessage(messageListeners, {
    type: "COLLECT_LAST_RESPONSE",
    payload: { requestId: "collect-1" },
    config: { siteId: "chatgpt" }
  });
  await flushPromises();
  assert.equal(sharedCalls.at(-1)?.method, "collectLatest");
  assert.equal(parentWindow.calls.at(-1)?.message?.type, "LAST_RESPONSE");
  assert.equal(parentWindow.calls.at(-1)?.message?.payload?.text, "shared latest");

  setHost(context, "claude.ai");
  setClaudePage(context.document);
  const rawClaudeOutcome = await sharedTransport.collectLatest(["claude"], { requestId: "raw-claude" });
  assert.equal(rawClaudeOutcome.status, "response-found");
  assert.equal(rawClaudeOutcome.text, "Claude latest visible reply");

  dispatchMessage(messageListeners, {
    type: "COLLECT_LAST_RESPONSE",
    payload: { requestId: "collect-claude" },
    config: { siteId: "claude" }
  });
  await flushPromises();
  const claudeResponse = parentWindow.calls.at(-1)?.message;
  assert.equal(sharedCalls.at(-1)?.method, "collectLatest");
  assert.equal(claudeResponse?.type, "LAST_RESPONSE");
  assert.equal(claudeResponse?.payload?.siteId, "claude");
  assert.equal(claudeResponse?.payload?.text, "Claude latest visible reply");
  assert.equal(claudeResponse?.payload?.status, "response-found");

  setHost(context, "chatgpt.com");
  setPage(context.document);

  setHost(context, "gemini.google.com");
  const gemini = setGeminiPage(context.document);
  const geminiSendOutcome = await sharedTransport.sendPrompt(["gemini"], "hello gemini primitive", {
    requestId: "send-gemini"
  });
  assert.equal(geminiSendOutcome.status, "send-submitted");
  assert.equal(gemini.staleSubmit.clicked, 0, "Gemini send should skip stale disabled submit controls");
  assert.equal(gemini.sendButton.clicked, 1, "Gemini send should click the enabled Chinese aria-label send button");
  assert.equal(gemini.input.textContent, "hello gemini primitive");

  setHost(context, "chatgpt.com");
  setPage(context.document);

  dispatchMessage(messageListeners, {
    type: "NEW_CHAT",
    payload: { requestId: "new-1" },
    config: { siteId: "chatgpt" }
  });
  await flushPromises();
  assert.equal(sharedCalls.at(-1)?.method, "newChat");

  const attachCalls = [];
  context.attachFiles = function traceAttachFiles(...args) {
    attachCalls.push(args);
    return Promise.resolve(true);
  };
  const callCountBeforeAttach = sharedCalls.length;
  dispatchMessage(messageListeners, {
    type: "ATTACH_FILES",
    payload: { files: [{ name: "local-only.txt", dataUrl: "data:text/plain;base64,aGk=", type: "text/plain" }] },
    config: { siteId: "chatgpt" }
  });
  await flushPromises();
  assert.equal(sharedCalls.length, callCountBeforeAttach);
  assert.equal(attachCalls.length, 1);
  assert.equal(attachCalls[0][2], "chatgpt");

  console.log("legacy shared runtime routing validation passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
