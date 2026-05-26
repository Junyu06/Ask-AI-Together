"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");

const repoRoot = path.resolve(__dirname, "..");
const manifestPath = path.join(repoRoot, "Side-by-Side AI", "manifest.json");
const contractPath = path.join(repoRoot, "Side-by-Side AI", "shared", "runtime-contract.js");
const providerCatalogPath = path.join(repoRoot, "Side-by-Side AI", "shared", "provider-catalog.js");
const constantsPath = path.join(repoRoot, "Side-by-Side AI", "background", "bg-constants.js");
const backgroundPath = path.join(repoRoot, "Side-by-Side AI", "background", "background.js");
const actionsPath = path.join(repoRoot, "Side-by-Side AI", "background", "bg-actions.js");
const optionsPath = path.join(repoRoot, "Side-by-Side AI", "ui", "options", "options.js");
const quickFocusPath = path.join(repoRoot, "Side-by-Side AI", "assets", "quick-focus.js");
const settingsPath = path.join(repoRoot, "Side-by-Side AI", "assets", "options-settings.js");
const pageEmbedPath = path.join(repoRoot, "Side-by-Side AI", "embed", "page-embed-options.js");
const i18nPath = path.join(repoRoot, "Side-by-Side AI", "assets", "options-i18n.js");

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const backgroundSource = fs.readFileSync(backgroundPath, "utf8");
const actionsSource = fs.readFileSync(actionsPath, "utf8");
const optionsSource = fs.readFileSync(optionsPath, "utf8");
const quickFocusSource = fs.readFileSync(quickFocusPath, "utf8");
const settingsSource = fs.readFileSync(settingsPath, "utf8");
const pageEmbedSource = fs.readFileSync(pageEmbedPath, "utf8");
const i18nSource = fs.readFileSync(i18nPath, "utf8");

assert.ok(manifest.permissions.includes("scripting"), "compatible send retry needs scripting permission");
assert.match(actionsSource, /function sendRuntimeMessageToTarget/);
assert.match(actionsSource, /function probeCompatibilityContentRuntime/);
assert.match(actionsSource, /function registerCompatibilityContentRuntimeRecovery/);
assert.match(actionsSource, /function isRecoverableRuntimeOutcome/);
assert.match(actionsSource, /async function ensureTargetsForAction/);
assert.match(actionsSource, /findTabForAiSite\(siteId, url, origin\)/, "send-time actions should recover targets from open provider tabs");
assert.match(actionsSource, /full-runtime-injection-already-started/);
assert.match(actionsSource, /compatibility-content-runtime-recovery/);
assert.match(actionsSource, /chrome\.scripting\.executeScript/);
assert.match(actionsSource, /content\/content-shared-runtime\.js/);
assert.match(actionsSource, /content\/content-quote-ui\.js/);
assert.match(pageEmbedSource, /OA_BG_BIND_CURRENT_TARGET/, "embedded parent page should register the current AI tab with background");
assert.match(pageEmbedSource, /OA_EMBED_CONTEXT/, "embedded parent page should pass current provider context to options iframe");
assert.match(optionsSource, /function mergeEmbeddedCurrentSite/, "options iframe should add current embedded site to runtime target sites");
assert.match(optionsSource, /partialSuccess \|\| res\.status === "partial-success"/);
assert.match(
  optionsSource,
  /Array\.isArray\(res\.outcomes\)[\s\S]+const direct = res\.error \|\| res\.reason \|\| res\.status/,
  "partial success should report the failed outcome reason instead of the top-level partial-success status"
);
assert.match(i18nSource, /status_sent_partial/);

function functionSource(name) {
  const match = actionsSource.match(new RegExp(`async function ${name}\\([\\s\\S]*?\\n}`));
  assert.ok(match, `missing function ${name}`);
  return match[0];
}

function optionsFunctionSource(name) {
  const match = optionsSource.match(new RegExp(`function ${name}\\([\\s\\S]*?\\n}`));
  assert.ok(match, `missing options function ${name}`);
  return match[0];
}

const collectSource = functionSource("collectLastFromTargets");
const newChatSource = functionSource("newChatOnTargets");
assert.match(collectSource, /sendRuntimeMessageToTarget\(rec\.tabId,\s*\{\s*type: "OA_RUNTIME_COLLECT_LAST"/);
assert.doesNotMatch(collectSource, /chrome\.tabs\.sendMessage/);
assert.match(actionsSource, /async function navigateTargetToNewChat/);
assert.match(actionsSource, /chrome\.tabs\.update\(rec\.tabId,\s*\{\s*url: targetUrl\s*\}\)/);
assert.match(actionsSource, /chrome\.tabs\.reload\(rec\.tabId\)/);
assert.match(actionsSource, /waitForNewChatNavigation\(rec\.tabId,\s*siteId,\s*targetUrl\)/);
assert.match(actionsSource, /recoverCompatibilityContentRuntime\(rec\.tabId\)/);
assert.match(newChatSource, /outcomes/, "new chat should return per-provider outcomes for bridge diagnostics");
assert.doesNotMatch(newChatSource, /chrome\.tabs\.sendMessage/);

assert.match(pageEmbedSource, /OA_EMBED_REQUEST_CONTEXT/, "embedded parent page should handle explicit pre-send context requests");
assert.match(optionsSource, /function requestEmbeddedContextRefresh/, "options iframe should request fresh parent context before resolving targets");
assert.match(optionsSource, /await requestEmbeddedContextRefresh\(\);[\s\S]+loadOrderedSelectedSitesPayload/, "runtimeTargetSites should refresh embedded context before reading targets");
assert.match(quickFocusSource, /async function getOptionsPageOriginPayload/, "extension pages should expose their current tab origin");
assert.match(quickFocusSource, /async function getOptionsPageTargetHints/, "extension pages should pass validated same-window tab hints");
assert.match(optionsSource, /origin: await window\.getOptionsPageOriginPayload\?\.\(\)/, "options runtime messages should include current extension tab origin");
assert.match(optionsSource, /targetHints/, "options runtime messages should include target tab hints for standalone compatible sends");
assert.match(settingsSource, /origin: await window\.getOptionsPageOriginPayload\?\.\(\)/, "settings actions should include current extension tab origin");
assert.match(settingsSource, /targetHints/, "settings actions should include target tab hints for standalone compatible workflows");
assert.match(backgroundSource, /function getMessageOrigin\(sender, explicitOrigin\)/, "background should accept explicit extension-page origin fallback");
assert.match(backgroundSource, /getMessageOrigin\(sender, msg\.origin\)/, "background message handlers should pass explicit origin into target sync");
assert.match(backgroundSource, /msg\.targetHints/, "background message handlers should pass target hints into target sync");

function quickFocusFunctionSource(name) {
  const match = quickFocusSource.match(new RegExp(`async function ${name}\\([\\s\\S]*?\\n}`));
  assert.ok(match, `missing quick-focus function ${name}`);
  return match[0];
}

function makeOptionsTargetContext({ embedMode, selectedSites, embeddedSite, currentTab = null, targetHints = [] }) {
  const sentMessages = [];
  const postedMessages = [];
  const context = vm.createContext({
    console,
    Date,
    Math,
    Promise,
    Map,
    String,
    Array,
    window: {
      setTimeout,
      clearTimeout,
      parent: {
        postMessage(message) {
          postedMessages.push(JSON.parse(JSON.stringify(message)));
          if (message?.type === "OA_EMBED_REQUEST_CONTEXT") {
            vm.runInContext(
              `rememberEmbeddedContext(${JSON.stringify({ source: "oa-page-embed", type: "OA_EMBED_CONTEXT", requestId: message.requestId, currentSite: embeddedSite })});\n` +
              `resolveEmbeddedContextRequest(${JSON.stringify({ source: "oa-page-embed", type: "OA_EMBED_CONTEXT", requestId: message.requestId, currentSite: embeddedSite })});`,
              context
            );
          }
        }
      },
      __ASK_AI_TOGETHER_RUNTIME__: {
        registerTransport() {}
      },
      getOptionsPageTargetHints() {
        return Promise.resolve(JSON.parse(JSON.stringify(targetHints)));
      }
    },
    chrome: {
      runtime: {
        sendMessage(message) {
          sentMessages.push(JSON.parse(JSON.stringify(message)));
          return Promise.resolve({ ok: true, status: "response-found" });
        }
      },
      tabs: {
        getCurrent() {
          return Promise.resolve(currentTab ? JSON.parse(JSON.stringify(currentTab)) : null);
        }
      }
    },
    async loadOrderedSelectedSitesPayload() {
      return JSON.parse(JSON.stringify(selectedSites));
    }
  });
  const snippets = [
    `const OPTIONS_EMBED_MODE = ${embedMode ? "true" : "false"};`,
    "let embeddedCurrentSite = null;",
    "const embeddedContextRequests = new Map();",
    optionsFunctionSource("normalizeRuntimeSiteEntry"),
    optionsFunctionSource("rememberEmbeddedContext"),
    optionsFunctionSource("resolveEmbeddedContextRequest"),
    optionsFunctionSource("requestEmbeddedContextRefresh"),
    optionsFunctionSource("mergeEmbeddedCurrentSite"),
    quickFocusFunctionSource("getOptionsPageOriginPayload"),
    "window.getOptionsPageOriginPayload = getOptionsPageOriginPayload;",
    optionsSource.match(/async function runtimeTargetSites\([\s\S]*?\n}/)[0],
    optionsSource.match(/function createCompatibilityRuntimeTransport\([\s\S]*?const compatibilityRuntimeTransport = createCompatibilityRuntimeTransport\(\);/)[0],
    "globalThis.compatibilityRuntimeTransport = compatibilityRuntimeTransport;"
  ];
  vm.runInContext(snippets.join("\n\n"), context, { filename: `${optionsPath}#embedded-target-harness` });
  return { context, sentMessages, postedMessages };
}

function makeContext({
  targets,
  sendMessageImpl,
  executeScriptImpl,
  tabUrls = {},
  discoveredTabs = [],
  tabUpdateImpl,
  tabReloadImpl,
  autoCompleteNavigation = true,
  fastTimers = false
}) {
  const nativeSetTimeout = setTimeout;
  const nativeClearTimeout = clearTimeout;
  let mutableTargets = JSON.parse(JSON.stringify(targets || {}));
  const mutableTabs = new Map();
  for (const tab of discoveredTabs) {
    mutableTabs.set(tab.id, {
      status: "complete",
      ...JSON.parse(JSON.stringify(tab))
    });
  }
  for (const rec of Object.values(mutableTargets)) {
    if (!rec?.tabId || mutableTabs.has(rec.tabId)) continue;
    mutableTabs.set(rec.tabId, {
      id: rec.tabId,
      windowId: rec.windowId || 1,
      status: "complete",
      url: tabUrls[rec.tabId] || (rec.siteId === "gemini" ? "https://gemini.google.com/app" : "https://chatgpt.com/c/current")
    });
  }
  const historyEntries = [];
  const executeScriptCalls = [];
  const tabUpdateCalls = [];
  const tabReloadCalls = [];
  const updatedListeners = new Set();
  function hostMatches(url, siteId, siteUrl) {
    const host = new URL(url).hostname;
    const configuredHost = new URL(siteUrl || (siteId === "gemini" ? "https://gemini.google.com/app" : "https://chatgpt.com/")).hostname;
    return host === configuredHost || host.endsWith("." + configuredHost);
  }
  function cloneTab(tab) {
    return JSON.parse(JSON.stringify(tab));
  }
  function fallbackTab(tabId) {
    return {
      id: tabId,
      windowId: 1,
      status: "complete",
      url: tabUrls[tabId] || "https://chatgpt.com/c/current"
    };
  }
  function tabRecord(tabId) {
    if (!mutableTabs.has(tabId)) mutableTabs.set(tabId, fallbackTab(tabId));
    return mutableTabs.get(tabId);
  }
  function emitUpdated(tabId, changeInfo, tabPatch = {}) {
    const tab = tabRecord(tabId);
    Object.assign(tab, tabPatch);
    if (changeInfo?.url) tab.url = changeInfo.url;
    if (changeInfo?.status) tab.status = changeInfo.status;
    for (const listener of Array.from(updatedListeners)) {
      listener(tabId, JSON.parse(JSON.stringify(changeInfo || {})), cloneTab(tab));
    }
  }
  const context = vm.createContext({
    console,
    Date,
    Math,
    Promise,
    URL,
    setTimeout(callback, ms, ...args) {
      return nativeSetTimeout(callback, fastTimers ? 0 : ms, ...args);
    },
    clearTimeout: nativeClearTimeout,
    globalThis: null,
    AskAiTogetherHistoryService: {
      prependEntry(entry) {
        historyEntries.push(entry);
        return Promise.resolve();
      }
    },
    broadcastToExtensionPages() {},
    syncTargetsFromTabsForSites() {
      return Promise.resolve();
    },
    async saveTargets(nextTargets) {
      mutableTargets = JSON.parse(JSON.stringify(nextTargets));
    },
    async getValidTargetTab(rec, siteId, siteUrl) {
      const tab = discoveredTabs.find((candidate) => candidate.id === rec?.tabId) || (
        rec?.tabId
          ? {
              id: rec.tabId,
              windowId: rec.windowId || 1,
              url: tabUrls[rec.tabId] || (siteId === "gemini" ? "https://gemini.google.com/app" : "https://chatgpt.com/c/current")
            }
          : null
      );
      if (!tab) return null;
      return hostMatches(tab.url, siteId, siteUrl) ? JSON.parse(JSON.stringify(tab)) : null;
    },
    async findTabForAiSite(siteId, siteUrl) {
      const tab = discoveredTabs.find((candidate) => {
        try {
          return hostMatches(candidate.url, siteId, siteUrl);
        } catch (_e) {
          return false;
        }
      });
      return tab ? JSON.parse(JSON.stringify(tab)) : null;
    },
    loadTargets() {
      return Promise.resolve(JSON.parse(JSON.stringify(mutableTargets)));
    },
    chrome: {
      runtime: {
        getURL(value) {
          return `chrome-extension://unit/${value}`;
        },
        sendMessage() {
          return Promise.resolve();
        }
      },
      storage: {
        local: {
          get() {
            return Promise.resolve({ oa_custom_sites: [] });
          }
        }
      },
      tabs: {
        async get(tabId) {
          return cloneTab(tabRecord(tabId));
        },
        async update(tabId, properties = {}) {
          tabUpdateCalls.push({ tabId, properties: JSON.parse(JSON.stringify(properties)) });
          if (tabUpdateImpl) {
            return tabUpdateImpl(tabId, properties, { emitUpdated, tabRecord, cloneTab });
          }
          const tab = tabRecord(tabId);
          if (properties.url) {
            tab.url = properties.url;
            tab.status = "loading";
            emitUpdated(tabId, { url: properties.url }, tab);
            if (autoCompleteNavigation) {
              nativeSetTimeout(() => emitUpdated(tabId, { status: "complete" }, { status: "complete" }), 0);
            }
          }
          if (properties.active != null) tab.active = properties.active;
          return cloneTab(tab);
        },
        async reload(tabId) {
          tabReloadCalls.push({ tabId });
          if (tabReloadImpl) return tabReloadImpl(tabId, { emitUpdated, tabRecord, cloneTab });
          const tab = tabRecord(tabId);
          tab.status = "loading";
          if (autoCompleteNavigation) {
            nativeSetTimeout(() => emitUpdated(tabId, { status: "complete" }, { status: "complete" }), 0);
          }
          return undefined;
        },
        sendMessage: sendMessageImpl,
        onUpdated: {
          addListener(listener) {
            updatedListeners.add(listener);
          },
          removeListener(listener) {
            updatedListeners.delete(listener);
          }
        }
      },
      scripting: {
        async executeScript(details) {
          executeScriptCalls.push(details);
          return executeScriptImpl ? executeScriptImpl(details) : [];
        }
      }
    }
  });
  context.globalThis = context;

  vm.runInContext(fs.readFileSync(providerCatalogPath, "utf8"), context, { filename: providerCatalogPath });
  vm.runInContext(fs.readFileSync(contractPath, "utf8"), context, { filename: contractPath });
  vm.runInContext(fs.readFileSync(constantsPath, "utf8"), context, { filename: constantsPath });
  vm.runInContext(actionsSource, context, { filename: actionsPath });

  return {
    context,
    historyEntries,
    executeScriptCalls,
    tabUpdateCalls,
    tabReloadCalls,
    emitUpdated,
    getTargets() {
      return JSON.parse(JSON.stringify(mutableTargets));
    },
    getTab(tabId) {
      return cloneTab(tabRecord(tabId));
    }
  };
}

(async () => {
  {
    const currentChatGpt = { siteId: "chatgpt", url: "https://chatgpt.com/c/live-smoke" };
    const { context, sentMessages, postedMessages } = makeOptionsTargetContext({
      embedMode: true,
      selectedSites: [
        { siteId: "chatgpt", url: "https://chatgpt.com/" },
        { siteId: "gemini", url: "https://gemini.google.com/app" }
      ],
      embeddedSite: currentChatGpt
    });
    await context.compatibilityRuntimeTransport.sendPrompt(["chatgpt"], "hello embedded current tab");
    assert.equal(postedMessages[0]?.type, "OA_EMBED_REQUEST_CONTEXT", "embedded send should request fresh parent context before resolving targets");
    assert.deepEqual(
      sentMessages[0].sites,
      [currentChatGpt],
      "embedded currentSite should replace an existing matching selected site entry"
    );
    assert.deepEqual(sentMessages[0].siteIds, ["chatgpt"]);
  }

  {
    const currentChatGpt = { siteId: "chatgpt", url: "https://chatgpt.com/c/live-smoke" };
    const { context, sentMessages } = makeOptionsTargetContext({
      embedMode: true,
      selectedSites: [
        { siteId: "gemini", url: "https://gemini.google.com/app" }
      ],
      embeddedSite: currentChatGpt
    });
    await context.compatibilityRuntimeTransport.sendPrompt([], "hello embedded prepend");
    assert.deepEqual(
      sentMessages[0].sites,
      [
        currentChatGpt,
        { siteId: "gemini", url: "https://gemini.google.com/app" }
      ],
      "embedded currentSite should be prepended when absent from selected sites"
    );
    assert.deepEqual(sentMessages[0].siteIds, ["chatgpt", "gemini"]);
  }

  {
    const { context, sentMessages, postedMessages } = makeOptionsTargetContext({
      embedMode: false,
      selectedSites: [
        { siteId: "gemini", url: "https://gemini.google.com/app" }
      ],
      embeddedSite: { siteId: "chatgpt", url: "https://chatgpt.com/c/live-smoke" },
      currentTab: { id: 44, windowId: 4, groupId: 9, index: 3 }
    });
    await context.compatibilityRuntimeTransport.sendPrompt([], "hello non embed");
    assert.deepEqual(postedMessages, [], "ordinary options mode should not ask the parent page for embedded context");
    assert.deepEqual(
      sentMessages[0].sites,
      [{ siteId: "gemini", url: "https://gemini.google.com/app" }],
      "ordinary options mode should not add an embedded current site"
    );
    assert.deepEqual(sentMessages[0].siteIds, ["gemini"]);
    assert.deepEqual(
      sentMessages[0].origin,
      { windowId: 4, tabId: 44, groupId: 9, index: 3 },
      "ordinary options mode should pass the extension page tab origin for same-group target discovery"
    );
  }

  {
    const { context, sentMessages } = makeOptionsTargetContext({
      embedMode: false,
      selectedSites: [
        { siteId: "chatgpt", url: "https://chatgpt.com/" }
      ],
      embeddedSite: null,
      currentTab: { id: 44, windowId: 4, groupId: 9, index: 3 },
      targetHints: [{ siteId: "chatgpt", windowId: 4, tabId: 43 }]
    });
    await context.compatibilityRuntimeTransport.sendPrompt([], "hello hinted tab");
    assert.deepEqual(
      sentMessages[0].targetHints,
      [{ siteId: "chatgpt", windowId: 4, tabId: 43 }],
      "ordinary options mode should forward same-window target hints to the background"
    );
  }

  {
    let sendAttempts = 0;
    const { context, historyEntries, getTargets } = makeContext({
      targets: {},
      discoveredTabs: [
        { id: 303, windowId: 30, url: "https://chatgpt.com/c/live-options" }
      ],
      async sendMessageImpl(tabId, message) {
        sendAttempts += 1;
        assert.equal(tabId, 303);
        assert.equal(message.type, "OA_RUNTIME_CHAT");
        return {
          ok: true,
          status: "send-submitted",
          action: "sendPrompt",
          requestId: message.requestId,
          providerId: message.siteId
        };
      }
    });

    const result = await context.sendPromptToTargets(
      ["chatgpt"],
      "hello from standalone options fallback",
      "req-options-fallback",
      [{ siteId: "chatgpt", url: "https://chatgpt.com/" }],
      [],
      { windowId: 30, tabId: 302, groupId: 9, index: 4 },
      [{ siteId: "chatgpt", windowId: 30, tabId: 303 }]
    );

    assert.equal(result.ok, true, "send should recover a missing target from a matching open provider tab");
    assert.equal(sendAttempts, 1);
    assert.deepEqual(
      getTargets().chatgpt,
      { siteId: "chatgpt", windowId: 30, tabId: 303, transport: "window" },
      "send-time fallback should persist the recovered target"
    );
    assert.equal(historyEntries.length, 1);
  }

  {
    let sendAttempts = 0;
    let probeCount = 0;
    let sharedTransportInjected = false;
    const sendFrameOptions = [];
    const { context, historyEntries, executeScriptCalls } = makeContext({
      targets: {
        chatgpt: { siteId: "chatgpt", windowId: 10, tabId: 101, transport: "window" }
      },
      async sendMessageImpl(tabId, message, options) {
        sendAttempts += 1;
        sendFrameOptions.push(options);
        assert.equal(tabId, 101);
        assert.equal(message.type, "OA_RUNTIME_CHAT");
        if (sendAttempts === 1) {
          throw new Error("Could not establish connection. Receiving end does not exist.");
        }
        return {
          ok: true,
          status: "send-submitted",
          action: "sendPrompt",
          requestId: message.requestId,
          providerId: message.siteId
        };
      },
      async executeScriptImpl(details) {
        const funcSource = String(details.func || "");
        if (funcSource.includes("hasRuntime")) return [{ result: { hasRuntime: false, hasTransport: false } }];
        if (funcSource.includes("FULL_RUNTIME_INJECTION_STARTED")) return [{ result: { ok: true, shouldInject: true } }];
        if (funcSource.includes("FULL_RUNTIME_INJECTION_COMPLETE")) return [{ result: { ok: true } }];
        return [];
      }
    });

    const result = await context.sendPromptToTargets(
      ["chatgpt"],
      "hello after extension reload",
      "req-compatible-send",
      [{ siteId: "chatgpt", url: "https://chatgpt.com/" }]
    );

    const fileInjections = executeScriptCalls.filter((details) => Array.isArray(details.files));
    assert.equal(result.ok, true);
    assert.equal(result.status, "response-found");
    assert.equal(sendAttempts, 2, "send should retry once after injecting a missing runtime");
    assert.deepEqual(
      JSON.parse(JSON.stringify(sendFrameOptions)),
      [{ frameId: 0 }, { frameId: 0 }],
      "runtime sends must target the AI page top frame, not embedded/options frames"
    );
    assert.equal(fileInjections.length, 1);
    assert.equal(fileInjections[0].target?.tabId, 101);
    assert.ok(fileInjections[0].files.includes("content/content-send-runtime.js"));
    assert.ok(fileInjections[0].files.includes("content/content-shared-runtime.js"));
    assert.ok(fileInjections[0].files.includes("content/content-quote-ui.js"));
    assert.equal(historyEntries.length, 1, "successful retry should preserve history append behavior");
  }

  {
    let sendAttempts = 0;
    let probeCount = 0;
    let sharedTransportInjected = false;
    const { context, historyEntries, executeScriptCalls } = makeContext({
      targets: {
        chatgpt: { siteId: "chatgpt", windowId: 10, tabId: 101, transport: "window" }
      },
      async sendMessageImpl(tabId, message) {
        sendAttempts += 1;
        assert.equal(tabId, 101);
        assert.equal(message.type, "OA_RUNTIME_CHAT");
        if (sendAttempts === 1) {
          return {
            ok: false,
            status: "runtime-not-ready",
            action: "sendPrompt",
            requestId: message.requestId,
            providerId: message.siteId
          };
        }
        return {
          ok: true,
          status: "send-submitted",
          action: "sendPrompt",
          requestId: message.requestId,
          providerId: message.siteId
        };
      },
      async executeScriptImpl(details) {
        const funcSource = String(details.func || "");
        if (funcSource.includes("hasRuntime")) {
          probeCount += 1;
          if (probeCount === 1) {
            return [{ result: { hasRuntime: true, hasTransport: false, hasRuntimeMessageListener: false } }];
          }
          assert.equal(sharedTransportInjected, true, "shared runtime should be injected before the second probe reports transport ready");
          return [{ result: { hasRuntime: true, hasTransport: true, hasRuntimeMessageListener: true } }];
        }
        if (Array.isArray(details.files)) {
          assert.deepEqual(Array.from(details.files), ["content/content-shared-runtime.js"]);
          sharedTransportInjected = true;
          return [];
        }
        throw new Error("runtime-not-ready recovery should only inject the shared transport");
      }
    });

    const result = await context.sendPromptToTargets(
      ["chatgpt"],
      "hello through existing listener after transport recovery",
      "req-compatible-runtime-not-ready",
      [{ siteId: "chatgpt", url: "https://chatgpt.com/" }]
    );

    assert.equal(result.ok, true);
    assert.equal(sendAttempts, 2, "runtime-not-ready outcomes should recover and retry once");
    assert.equal(executeScriptCalls.filter((details) => Array.isArray(details.files)).length, 1);
    assert.equal(probeCount, 2, "runtime-not-ready recovery should verify the shared transport after injection");
    assert.equal(historyEntries.length, 1, "transport recovery success should still append history");
  }

  {
    let sendAttempts = 0;
    const { context, historyEntries, executeScriptCalls } = makeContext({
      targets: {
        chatgpt: { siteId: "chatgpt", windowId: 10, tabId: 101, transport: "window" }
      },
      async sendMessageImpl(tabId, message) {
        sendAttempts += 1;
        assert.equal(tabId, 101);
        assert.equal(message.type, "OA_RUNTIME_CHAT");
        if (sendAttempts === 1) {
          throw new Error("Could not establish connection. Receiving end does not exist.");
        }
        return {
          ok: true,
          status: "send-submitted",
          action: "sendPrompt",
          requestId: message.requestId,
          providerId: message.siteId
        };
      },
      async executeScriptImpl(details) {
        const funcSource = String(details.func || "");
        if (funcSource.includes("hasRuntime")) {
          return [{ result: { hasRuntime: true, hasTransport: true, hasRuntimeMessageListener: false, hasRecoveryListener: false } }];
        }
        if (funcSource.includes("compatibility-content-runtime-recovery")) return [{ result: { ok: true, registered: true } }];
        throw new Error("partial runtime recovery must not reinject lexical content files");
      }
    });

    const result = await context.sendPromptToTargets(
      ["chatgpt"],
      "hello through recovered listener",
      "req-compatible-partial-runtime",
      [{ siteId: "chatgpt", url: "https://chatgpt.com/" }]
    );

    assert.equal(result.ok, true);
    assert.equal(sendAttempts, 2, "send should retry once after registering a recovery listener");
    assert.equal(executeScriptCalls.filter((details) => Array.isArray(details.files)).length, 0);
    assert.equal(executeScriptCalls.filter((details) => typeof details.func === "function").length, 2);
    assert.equal(historyEntries.length, 1, "recovered listener success should still append history");
  }

  {
    const { context, historyEntries } = makeContext({
      targets: {
        chatgpt: { siteId: "chatgpt", windowId: 10, tabId: 101, transport: "window" },
        gemini: { siteId: "gemini", windowId: 20, tabId: 202, transport: "window" }
      },
      tabUrls: {
        101: "https://chatgpt.com/c/current",
        202: "https://gemini.google.com/app"
      },
      async sendMessageImpl(tabId, message) {
        if (tabId === 101) throw new Error("tab unreachable");
        assert.equal(tabId, 202);
        return {
          ok: true,
          status: "send-submitted",
          action: "sendPrompt",
          requestId: message.requestId,
          providerId: message.siteId
        };
      }
    });

    const result = await context.sendPromptToTargets(
      ["chatgpt", "gemini"],
      "hello partial aggregate",
      "req-compatible-partial-success",
      [
        { siteId: "chatgpt", url: "https://chatgpt.com/" },
        { siteId: "gemini", url: "https://gemini.google.com/app" }
      ]
    );

    assert.equal(result.ok, true, "one successful target should not be reported as a pure send failure");
    assert.equal(result.status, "partial-success");
    assert.equal(result.sentCount, 1);
    assert.equal(result.failedCount, 1);
    assert.equal(historyEntries.length, 1, "partial success should preserve the sent prompt in history");
    assert.deepEqual(historyEntries[0].siteIds, ["gemini"]);
  }

  {
    let collectAttempts = 0;
    let probeCount = 0;
    let sharedTransportInjected = false;
    const { context } = makeContext({
      targets: {
        gemini: { siteId: "gemini", windowId: 20, tabId: 202, transport: "window" }
      },
      async sendMessageImpl(tabId, message) {
        collectAttempts += 1;
        assert.equal(tabId, 202);
        assert.equal(message.type, "OA_RUNTIME_COLLECT_LAST");
        if (collectAttempts === 1) {
          return {
            ok: false,
            status: "runtime-not-ready",
            action: "collectLatest",
            providerId: message.siteId,
            siteId: message.siteId,
            text: ""
          };
        }
        return {
          ok: true,
          status: "response-found",
          action: "collectLatest",
          providerId: message.siteId,
          siteId: message.siteId,
          text: "OK COMPAT RETEST"
        };
      },
      async executeScriptImpl(details) {
        const funcSource = String(details.func || "");
        if (funcSource.includes("hasRuntime")) {
          probeCount += 1;
          if (probeCount === 1) {
            return [{ result: { hasRuntime: true, hasTransport: false, hasRuntimeMessageListener: false } }];
          }
          assert.equal(sharedTransportInjected, true);
          return [{ result: { hasRuntime: true, hasTransport: true, hasRuntimeMessageListener: true } }];
        }
        if (Array.isArray(details.files)) {
          assert.deepEqual(Array.from(details.files), ["content/content-shared-runtime.js"]);
          sharedTransportInjected = true;
          return [];
        }
        throw new Error("collect runtime-not-ready recovery should only inject the shared transport");
      }
    });

    const result = await context.collectLastFromTargets(
      ["gemini"],
      [{ siteId: "gemini", url: "https://gemini.google.com/app" }]
    );

    assert.equal(collectAttempts, 2, "collect latest should retry through sendRuntimeMessageToTarget recovery");
    assert.equal(probeCount, 2);
    assert.deepEqual(JSON.parse(JSON.stringify(result.sections)), [{
      siteId: "gemini",
      siteName: "Gemini",
      text: "OK COMPAT RETEST",
      status: "response-found",
      reason: ""
    }]);
  }

  {
    const { context, executeScriptCalls, tabUpdateCalls, tabReloadCalls, getTab } = makeContext({
      targets: {
        chatgpt: { siteId: "chatgpt", windowId: 10, tabId: 101, transport: "window" }
      },
      async executeScriptImpl(details) {
        const funcSource = String(details.func || "");
        if (funcSource.includes("hasRuntime")) {
          return [{ result: { hasRuntime: true, hasTransport: true, hasRuntimeMessageListener: false, hasRecoveryListener: false } }];
        }
        if (funcSource.includes("compatibility-content-runtime-recovery")) return [{ result: { ok: true, registered: true } }];
        throw new Error("new chat listener recovery must not reinject full content files");
      }
    });

    const result = await context.newChatOnTargets(
      ["chatgpt"],
      [{ siteId: "chatgpt", url: "https://chatgpt.com/" }],
      { windowId: 1, tabId: 2 }
    );

    assert.equal(result.ok, true);
    assert.equal(result.failedCount, 0);
    const providerTabUpdates = tabUpdateCalls.filter((call) => call.tabId === 101);
    assert.equal(providerTabUpdates.length, 1, "new chat should navigate the provider tab at background level");
    assert.deepEqual(providerTabUpdates[0], { tabId: 101, properties: { url: "https://chatgpt.com/" } });
    assert.equal(tabReloadCalls.length, 0);
    assert.equal(getTab(101).status, "complete", "new chat should wait for tab completion before reporting success");
    assert.equal(result.outcomes[0].ok, true);
    assert.equal(result.outcomes[0].status, "response-found");
    assert.equal(result.outcomes[0].providerId, "chatgpt");
    assert.equal(result.outcomes[0].siteId, "chatgpt");
    assert.equal(result.outcomes[0].reason, "");
    assert.equal(result.outcomes[0].navigatedUrl, "https://chatgpt.com/");
    assert.equal(executeScriptCalls.filter((details) => Array.isArray(details.files)).length, 0);
  }

  {
    const { context, tabUpdateCalls, tabReloadCalls } = makeContext({
      targets: {
        claude: { siteId: "claude", windowId: 30, tabId: 303, transport: "window" }
      },
      tabUrls: {
        303: "https://claude.ai/new?model=sonnet#draft"
      },
      async executeScriptImpl(details) {
        const funcSource = String(details.func || "");
        if (funcSource.includes("hasRuntime")) {
          return [{ result: { hasRuntime: true, hasTransport: true, hasRuntimeMessageListener: true, hasRecoveryListener: false } }];
        }
        return [];
      }
    });

    const result = await context.newChatOnTargets(
      ["claude"],
      [{ siteId: "claude", url: "https://claude.ai/" }]
    );

    assert.equal(result.ok, true);
    assert.equal(tabUpdateCalls.length, 0, "matching new-chat URL should reload instead of navigating");
    assert.equal(tabReloadCalls.length, 1);
    assert.deepEqual(tabReloadCalls[0], { tabId: 303 });
  }

  {
    const { context } = makeContext({
      targets: {
        chatgpt: { siteId: "chatgpt", windowId: 10, tabId: 101, transport: "window" }
      },
      fastTimers: true,
      tabUpdateImpl(tabId, properties, helpers) {
        assert.equal(properties.url, "https://chatgpt.com/");
        const tab = helpers.tabRecord(tabId);
        tab.url = "https://chatgpt.com/c/old-conversation";
        tab.status = "complete";
        return helpers.cloneTab(tab);
      },
      async executeScriptImpl() {
        throw new Error("runtime recovery should not run when old conversation URL is complete");
      }
    });

    const result = await context.newChatOnTargets(
      ["chatgpt"],
      [{ siteId: "chatgpt", url: "https://chatgpt.com/" }]
    );

    assert.equal(result.ok, false);
    assert.equal(result.status, "transport-failed");
    assert.equal(result.outcomes[0].ok, false);
    assert.equal(result.outcomes[0].status, "new-chat-failed");
    assert.equal(result.outcomes[0].reason, "new-chat-navigation-timeout");
  }

  {
    const { context } = makeContext({
      targets: {}
    });

    const result = await context.newChatOnTargets(
      ["chatgpt"],
      [{ siteId: "chatgpt", url: "https://chatgpt.com/" }]
    );

    assert.equal(result.ok, false);
    assert.equal(result.status, "transport-failed");
    assert.equal(result.failedCount, 1);
    assert.equal(result.outcomes[0].ok, false);
    assert.equal(result.outcomes[0].providerId, "chatgpt");
    assert.equal(result.outcomes[0].siteId, "chatgpt");
    assert.equal(result.outcomes[0].reason, "missing-tab");
  }

  {
    const { context } = makeContext({
      targets: {
        chatgpt: { siteId: "chatgpt", windowId: 10, tabId: 101, transport: "window" }
      },
      autoCompleteNavigation: false,
      fastTimers: true,
      async executeScriptImpl() {
        throw new Error("runtime recovery should not run before navigation readiness");
      }
    });

    const result = await context.newChatOnTargets(
      ["chatgpt"],
      [{ siteId: "chatgpt", url: "https://chatgpt.com/" }]
    );

    assert.equal(result.ok, false);
    assert.equal(result.status, "transport-failed");
    assert.equal(result.outcomes[0].ok, false);
    assert.equal(result.outcomes[0].status, "new-chat-failed");
    assert.equal(result.outcomes[0].reason, "new-chat-navigation-timeout");
  }

  {
    const { context } = makeContext({
      targets: {
        chatgpt: { siteId: "chatgpt", windowId: 10, tabId: 101, transport: "window" }
      },
      async executeScriptImpl() {
        return [];
      }
    });

    const result = await context.newChatOnTargets(
      ["chatgpt"],
      [{ siteId: "chatgpt", url: "https://chatgpt.com/" }]
    );

    assert.equal(result.ok, false);
    assert.equal(result.status, "transport-failed");
    assert.equal(result.outcomes[0].ok, false);
    assert.equal(result.outcomes[0].status, "runtime-not-ready");
    assert.equal(result.outcomes[0].reason, "runtime-not-ready-after-new-chat");
  }

  {
    const { context } = makeContext({
      targets: {
        chatgpt: { siteId: "chatgpt", windowId: 10, tabId: 101, transport: "window" },
        gemini: { siteId: "gemini", windowId: 20, tabId: 202, transport: "window" }
      },
      tabUrls: {
        101: "https://chatgpt.com/c/current",
        202: "https://gemini.google.com/app"
      },
      async executeScriptImpl(details) {
        const tabId = details.target?.tabId;
        const funcSource = String(details.func || "");
        if (tabId === 101 && funcSource.includes("hasRuntime")) {
          return [{ result: { hasRuntime: true, hasTransport: true, hasRuntimeMessageListener: true, hasRecoveryListener: false } }];
        }
        if (tabId === 202) return [];
        return [];
      }
    });

    const result = await context.newChatOnTargets(
      ["chatgpt", "gemini"],
      [
        { siteId: "chatgpt", url: "https://chatgpt.com/" },
        { siteId: "gemini", url: "https://gemini.google.com/app" }
      ]
    );

    assert.equal(result.ok, false);
    assert.equal(result.status, "partial-failed");
    assert.equal(result.succeededCount, 1);
    assert.equal(result.failedCount, 1);
    assert.equal(result.outcomes[0].ok, true);
    assert.equal(result.outcomes[0].providerId, "chatgpt");
    assert.equal(result.outcomes[1].ok, false);
    assert.equal(result.outcomes[1].providerId, "gemini");
    assert.equal(result.outcomes[1].status, "runtime-not-ready");
    assert.equal(result.outcomes[1].reason, "runtime-not-ready-after-new-chat");
  }

  console.log("compatible send transport validation passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
