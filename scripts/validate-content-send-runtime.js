"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");

const repoRoot = path.resolve(__dirname, "..");
const contractPath = path.join(repoRoot, "Side-by-Side AI", "shared", "runtime-contract.js");
const sendRuntimePath = path.join(repoRoot, "Side-by-Side AI", "content", "content-send-runtime.js");
const quoteUiPath = path.join(repoRoot, "Side-by-Side AI", "content", "content-quote-ui.js");
const backgroundPath = path.join(repoRoot, "Side-by-Side AI", "background", "background.js");
const backgroundSource = fs.readFileSync(backgroundPath, "utf8");
const quoteUiSource = fs.readFileSync(quoteUiPath, "utf8");

assert.match(backgroundSource, /function resolveUpdateHistorySiteId/);
assert.match(backgroundSource, /payloadSiteId !== "generic"/);
assert.match(backgroundSource, /siteIdForSenderTab\(sender\)/);
assert.match(quoteUiSource, /function ensureTopLevelRuntimeEventsRegistered/);
assert.match(quoteUiSource, /rememberCompatibilityConfiguredSiteId\(msg\?\.siteId/);

function eventTargetStub() {
  return {
    addListener() {}
  };
}

async function validateBackgroundUpdateHistoryTrustOrder() {
  let backgroundTargets = {};
  const backgroundContext = vm.createContext({
    console,
    Promise,
    importScripts() {},
    globalThis: null,
    __ASK_AI_TOGETHER_RUNTIME__: {
      markBootstrapped() {}
    },
    loadTargets() {
      return Promise.resolve(backgroundTargets);
    },
    chrome: {
      action: {
        setPopup() {},
        onClicked: eventTargetStub()
      },
      declarativeNetRequest: {
        updateDynamicRules() {}
      },
      runtime: {
        lastError: null,
        getURL(value) {
          return value;
        },
        onInstalled: eventTargetStub(),
        onStartup: eventTargetStub(),
        onMessage: eventTargetStub()
      },
      windows: {
        onRemoved: eventTargetStub()
      },
      tabs: {
        onRemoved: eventTargetStub(),
        query() {
          return Promise.resolve([]);
        },
        update() {
          return Promise.resolve({});
        }
      }
    }
  });
  backgroundContext.globalThis = backgroundContext;
  vm.runInContext(backgroundSource, backgroundContext, { filename: backgroundPath });

  backgroundTargets = {
    chatgpt: { siteId: "chatgpt", tabId: 101 },
    "custom-alpha": { siteId: "custom-alpha", tabId: 202 },
    generic: { siteId: "generic", tabId: 404 }
  };

  assert.equal(
    await backgroundContext.resolveUpdateHistorySiteId(
      { payload: { siteId: "custom-alpha" } },
      { tab: { id: 101 } }
    ),
    "chatgpt"
  );
  assert.equal(
    await backgroundContext.resolveUpdateHistorySiteId(
      { payload: { siteId: "chatgpt" } },
      { tab: { id: 101 } }
    ),
    "chatgpt"
  );
  assert.equal(
    await backgroundContext.resolveUpdateHistorySiteId(
      { payload: { targetSiteId: "custom-alpha" } },
      { tab: { id: 101 } }
    ),
    "chatgpt"
  );
  assert.equal(
    await backgroundContext.resolveUpdateHistorySiteId(
      { payload: { siteId: "custom-alpha" } },
      { tab: { id: 303 } }
    ),
    "custom-alpha"
  );
  assert.equal(
    await backgroundContext.resolveUpdateHistorySiteId(
      { payload: { siteId: "custom-alpha" } },
      { tab: { id: 404 } }
    ),
    "custom-alpha"
  );
}

function validateCustomCompatibilityUrlWatcher() {
  const sentMessages = [];
  const documentEvents = [];
  const windowEvents = [];
  const listenerFlags = {};
  let runtimeMessageListener = null;
  let attachResponse = null;
  let currentQuoteSite = null;

  const windowStub = {
    parent: null,
    top: null,
    scrollX: 0,
    scrollY: 0,
    addEventListener(type) {
      windowEvents.push(type);
    },
    setTimeout(fn) {
      fn();
      return 1;
    },
    clearTimeout() {},
    getSelection() {
      return null;
    }
  };
  windowStub.parent = windowStub;
  windowStub.top = windowStub;

  const quoteContext = vm.createContext({
    console,
    Date,
    Promise,
    Node: { ELEMENT_NODE: 1 },
    navigator: { language: "en-US" },
    location: {
      href: "https://custom.example/chat",
      origin: "https://custom.example"
    },
    setInterval() {
      return 1;
    },
    clearInterval() {},
    document: {
      body: {
        appendChild() {}
      },
      createElement() {
        return {
          style: {},
          addEventListener() {}
        };
      },
      querySelector() {
        return null;
      },
      addEventListener(type) {
        documentEvents.push(type);
      }
    },
    window: windowStub,
    globalThis: null,
    currentSite() {
      return currentQuoteSite;
    },
    GENERIC_SITE: {
      id: "generic",
      inputSelectors: ["textarea"]
    },
    notifyExtension(message) {
      sentMessages.push(message);
    },
    postSendProgress() {},
    chrome: {
      runtime: {
        sendMessage(message) {
          sentMessages.push(message);
        },
        onMessage: {
          addListener(listener) {
            runtimeMessageListener = listener;
          }
        }
      }
    },
    __ASK_AI_TOGETHER_RUNTIME__: {
      markListenerRegistered(flag) {
        if (listenerFlags[flag]) return false;
        listenerFlags[flag] = true;
        return true;
      },
      makeOutcome(status, fields = {}) {
        return {
          ok: false,
          status,
          ...fields
        };
      }
    }
  });
  quoteContext.globalThis = quoteContext;

  vm.runInContext(quoteUiSource, quoteContext, { filename: quoteUiPath });

  assert.equal(typeof runtimeMessageListener, "function");
  assert.equal(documentEvents.length, 0);
  assert.equal(windowEvents.length, 0);
  assert.equal(sentMessages.some((message) => message?.type === "OA_UPDATE_HISTORY"), false);

  runtimeMessageListener(
    { type: "OA_RUNTIME_ATTACH_FILES", requestId: "req-attach", siteId: "custom-alpha" },
    {},
    (response) => {
      attachResponse = response;
    }
  );

  assert.equal(attachResponse?.providerId, "custom-alpha");
  assert.deepEqual(documentEvents, ["mouseup", "touchend", "click"]);
  assert.deepEqual(windowEvents, ["scroll"]);
  assert.deepEqual(
    sentMessages
      .filter((message) => message?.type === "OA_UPDATE_HISTORY")
      .map((message) => message.payload?.siteId),
    ["custom-alpha"]
  );
}

const progressEvents = [];
let currentSite = {
  id: "chatgpt",
  inputSelectors: ["textarea"]
};
const inputEl = {
  value: "",
  focus() {
    this.focused = true;
  }
};

const context = vm.createContext({
  console,
  Date,
  URL,
  Promise,
  setTimeout(fn) {
    fn();
    return 1;
  },
  clearTimeout() {},
  MutationObserver: class {
    observe() {}
    disconnect() {}
  },
  chrome: {
    runtime: {
      sendMessage(message) {
        progressEvents.push(message);
      }
    }
  },
  document: {
    documentElement: {},
    querySelectorAll() {
      return [];
    }
  },
  window: {
    setTimeout(fn) {
      fn();
      return 1;
    },
    clearTimeout() {}
  },
  globalThis: null
});
context.globalThis = context;

context.currentSite = () => currentSite;
context.GENERIC_SITE = {
  id: "generic",
  inputSelectors: ["textarea"]
};
context.collectReplyNodes = () => [];
context.normalizeEditableText = (value) => String(value || "").trim();
context.extractLatestResponseText = () => "";
context.readInputValue = (node) => String(node?.value || "");
context.findFirst = () => inputEl;
context.setInputValue = (node, value) => {
  node.value = String(value || "");
  return true;
};
context.sleep = () => Promise.resolve();
context.clickSendWithRetry = async () => true;

vm.runInContext(fs.readFileSync(contractPath, "utf8"), context, { filename: contractPath });
vm.runInContext(fs.readFileSync(sendRuntimePath, "utf8"), context, { filename: sendRuntimePath });

(async () => {
  await validateBackgroundUpdateHistoryTrustOrder();
  validateCustomCompatibilityUrlWatcher();

  const outcome = await context.sendPrompt({
    message: "hello from validation",
    requestId: "req-send-submitted"
  });

  assert.equal(outcome.ok, true);
  assert.equal(outcome.status, "send-submitted");
  assert.equal(outcome.action, "sendPrompt");
  assert.equal(outcome.requestId, "req-send-submitted");
  assert.equal(outcome.providerId, "chatgpt");
  assert.equal(outcome.reason, "acknowledgement-pending");

  const phases = progressEvents.map((event) => event?.payload?.phase).filter(Boolean);
  assert.deepEqual(phases, ["injecting", "submitted", "submitted-unacknowledged"]);
  assert.deepEqual(progressEvents.map((event) => event?.payload?.siteId).filter(Boolean), [
    "chatgpt",
    "chatgpt",
    "chatgpt"
  ]);

  progressEvents.length = 0;
  currentSite = context.GENERIC_SITE;
  const customOutcome = await context.sendPrompt({
    message: "hello custom",
    requestId: "req-custom",
    siteId: "custom-alpha"
  });
  assert.equal(customOutcome.ok, true);
  assert.equal(customOutcome.providerId, "custom-alpha");
  assert.deepEqual(progressEvents.map((event) => event?.payload?.siteId).filter(Boolean), [
    "custom-alpha",
    "custom-alpha",
    "custom-alpha"
  ]);

  console.log("content send runtime validation passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
