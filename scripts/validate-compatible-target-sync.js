"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");

const repoRoot = path.resolve(__dirname, "..");
const constantsPath = path.join(repoRoot, "Side-by-Side AI", "background", "bg-constants.js");
const tabsPath = path.join(repoRoot, "Side-by-Side AI", "background", "bg-tabs.js");
const tilingPath = path.join(repoRoot, "Side-by-Side AI", "background", "bg-tiling.js");
const constantsSource = fs.readFileSync(constantsPath, "utf8");
const tabsSource = fs.readFileSync(tabsPath, "utf8");
const tilingSource = fs.readFileSync(tilingPath, "utf8");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeContext(initialTargets, openTabs) {
  let targets = clone(initialTargets);
  let nextWindowId = 9000;
  let nextTabId = 90000;
  const createdWindows = [];
  const providerCatalog = {
    getHomeUrlMap() {
      return {
        chatgpt: "https://chatgpt.com/",
        gemini: "https://gemini.google.com/app"
      };
    },
    getNewChatUrlMap() {
      return {
        chatgpt: "https://chatgpt.com/",
        gemini: "https://gemini.google.com/app"
      };
    },
    getDisplayNameMap() {
      return {
        chatgpt: "ChatGPT",
        gemini: "Gemini"
      };
    },
    getHostMap() {
      return {
        chatgpt: ["chatgpt.com"],
        gemini: ["gemini.google.com"]
      };
    }
  };
  const context = vm.createContext({
    console,
    Promise,
    URL,
    globalThis: {},
    AskAiTogetherProviderCatalog: providerCatalog,
    async loadTargets() {
      return clone(targets);
    },
    async saveTargets(nextTargets) {
      targets = clone(nextTargets);
    },
    async getWindowPrefs() {
      return { type: "normal", width: 1200, height: 900 };
    },
    chrome: {
      runtime: {
        getURL(value) {
          return `chrome-extension://unit/${value}`;
        }
      },
      tabs: {
        async get(tabId) {
          const tab = openTabs.find((candidate) => candidate.id === tabId);
          if (!tab) throw new Error("missing tab");
          return clone(tab);
        },
        async query() {
          return clone(openTabs);
        }
      },
      windows: {
        async create(details) {
          const windowId = nextWindowId++;
          const tabId = nextTabId++;
          const tab = { id: tabId, windowId, active: true, url: details.url };
          const created = { id: windowId, ...details, tabs: [tab] };
          openTabs.push(tab);
          createdWindows.push(clone(created));
          return clone(created);
        },
        async update() {
          return {};
        }
      }
    }
  });
  context.globalThis = context;
  vm.runInContext(constantsSource, context, { filename: constantsPath });
  vm.runInContext(tabsSource, context, { filename: tabsPath });
  vm.runInContext(tilingSource, context, { filename: tilingPath });
  return {
    context,
    getTargets() {
      return clone(targets);
    },
    getCreatedWindows() {
      return clone(createdWindows);
    }
  };
}

(async () => {
  assert.match(tabsSource, /chrome\.tabs\.get\(rec\.tabId\)/, "sync should validate saved records by tab id");
  assert.match(tabsSource, /tabMatchesAiSite\(tab, siteId, siteUrl\)/, "sync should validate target tab URL hosts");
  assert.match(tabsSource, /function tabAffinityScore/, "sync should prefer tabs near the sender options page when provided");
  assert.match(tabsSource, /async function bindTargetForSenderTab/, "embedded page sender should be able to bind its current AI tab");
  assert.doesNotMatch(
    tilingSource,
    /chrome\.windows\.get\(existing\.windowId/,
    "direct open/reuse should not trust saved window ids without validating the saved tab"
  );
  assert.match(
    tilingSource,
    /getValidTargetTab\(existing, siteId, u\)/,
    "direct open/reuse should reuse the shared target tab validation helper"
  );

  {
    const { context, getTargets } = makeContext(
      {
        chatgpt: { siteId: "chatgpt", windowId: 10, tabId: 1, transport: "window" }
      },
      [
        { id: 1, windowId: 10, active: true, url: "chrome-extension://unit/ui/options/options.html" },
        { id: 2, windowId: 20, active: false, url: "https://chatgpt.com/c/old" },
        { id: 3, windowId: 30, active: true, url: "https://team.chatgpt.com/c/new" }
      ]
    );
    await context.syncTargetsFromTabsForSites([{ siteId: "chatgpt", url: "https://chatgpt.com/" }]);
    assert.deepEqual(
      getTargets().chatgpt,
      { siteId: "chatgpt", windowId: 30, tabId: 3, transport: "window" },
      "stale extension/options tab should be replaced by an open matching provider tab"
    );
  }

  {
    const { context, getTargets } = makeContext(
      {},
      [
        { id: 1, windowId: 10, groupId: 3, index: 4, active: true, url: "chrome-extension://unit/ui/options/options.html" },
        { id: 2, windowId: 10, groupId: 3, index: 3, active: false, url: "https://chatgpt.com/c/6a01101a-8cc8-83ea-87e4-705b8edaf657" },
        { id: 3, windowId: 30, groupId: 7, index: 0, active: true, url: "https://chatgpt.com/c/other-window" }
      ]
    );
    await context.syncTargetsFromTabsForSites(
      [{ siteId: "chatgpt", url: "https://chatgpt.com/" }],
      { windowId: 10, tabId: 1, groupId: 3, index: 4 }
    );
    assert.deepEqual(
      getTargets().chatgpt,
      { siteId: "chatgpt", windowId: 10, tabId: 2, transport: "window" },
      "standalone options send should bind the ChatGPT tab in the same window/tab group instead of missing-tab or another window"
    );
  }

  {
    const { context, getTargets } = makeContext(
      {},
      [
        { id: 1, windowId: 10, groupId: 3, index: 4, active: true, url: "chrome-extension://unit/ui/options/options.html" },
        { id: 2, windowId: 10, groupId: 3, index: 3, active: false, url: "https://chatgpt.com/c/hinted" },
        { id: 3, windowId: 30, groupId: 7, index: 0, active: true, url: "https://chatgpt.com/c/active-other-window" }
      ]
    );
    await context.syncTargetsFromTabsForSites(
      [{ siteId: "chatgpt", url: "https://chatgpt.com/" }],
      { windowId: 10, tabId: 1, groupId: 3, index: 4 },
      [{ siteId: "chatgpt", windowId: 10, tabId: 2 }]
    );
    assert.deepEqual(
      getTargets().chatgpt,
      { siteId: "chatgpt", windowId: 10, tabId: 2, transport: "window" },
      "standalone options target hints should bind the validated same-window provider tab"
    );
  }

  {
    const { context, getTargets } = makeContext(
      {},
      [
        { id: 11, windowId: 110, active: true, url: "https://chatgpt.com/c/current" }
      ]
    );
    const result = await context.bindTargetForSenderTab(
      { siteId: "chatgpt", url: "https://chatgpt.com/c/current" },
      { tab: { id: 11, windowId: 110, url: "https://chatgpt.com/c/current" } }
    );
    assert.equal(result.ok, true, "ChatGPT embedded sender tab should bind as the current target");
    assert.deepEqual(
      getTargets().chatgpt,
      { siteId: "chatgpt", windowId: 110, tabId: 11, transport: "window" },
      "embedded ChatGPT sender should avoid missing-tab on current-page sends"
    );
  }

  {
    const { context, getTargets } = makeContext(
      {},
      [
        { id: 12, windowId: 120, active: true, url: "https://lab.custom.example/thread" }
      ]
    );
    const result = await context.bindTargetForSenderTab(
      { siteId: "custom-alpha", url: "https://custom.example/chat" },
      { tab: { id: 12, windowId: 120, url: "https://lab.custom.example/thread" } }
    );
    assert.equal(result.ok, false, "embedded sender binding should keep custom exact-host validation");
    assert.equal(
      Object.prototype.hasOwnProperty.call(getTargets(), "custom-alpha"),
      false,
      "custom embedded sender binding must not accept subdomains"
    );
  }

  {
    const { context, getTargets } = makeContext(
      {
        chatgpt: { siteId: "chatgpt", windowId: 999, tabId: 2, transport: "window" }
      },
      [
        { id: 2, windowId: 20, active: false, url: "https://chatgpt.com/c/current" },
        { id: 3, windowId: 30, active: true, url: "https://chatgpt.com/c/other" }
      ]
    );
    await context.syncTargetsFromTabsForSites([{ siteId: "chatgpt", url: "https://chatgpt.com/" }]);
    assert.deepEqual(
      getTargets().chatgpt,
      { siteId: "chatgpt", windowId: 20, tabId: 2, transport: "window" },
      "valid saved tab should be reused and its window id should be refreshed"
    );
  }

  {
    const { context, getTargets } = makeContext(
      {
        gemini: { siteId: "gemini", windowId: 10, tabId: 5, transport: "window" }
      },
      [
        { id: 5, windowId: 10, active: true, url: "chrome-extension://unit/ui/options/options.html" },
        { id: 6, windowId: 60, active: false, url: "https://example.com/" }
      ]
    );
    await context.syncTargetsFromTabsForSites([{ siteId: "gemini", url: "https://gemini.google.com/app" }]);
    assert.equal(
      Object.prototype.hasOwnProperty.call(getTargets(), "gemini"),
      false,
      "stale target should be removed when no matching provider tab is open"
    );
  }

  {
    const { context, getTargets } = makeContext(
      {},
      [
        { id: 7, windowId: 70, active: true, url: "https://lab.custom.example/thread" }
      ]
    );
    await context.syncTargetsFromTabsForSites([{ siteId: "custom-alpha", url: "https://custom.example/chat" }]);
    assert.equal(
      Object.prototype.hasOwnProperty.call(getTargets(), "custom-alpha"),
      false,
      "custom sites should exact-match the configured URL host instead of accepting subdomains"
    );
  }

  {
    const { context, getTargets } = makeContext(
      {},
      [
        { id: 8, windowId: 80, active: true, url: "https://custom.example/thread" }
      ]
    );
    await context.syncTargetsFromTabsForSites([{ siteId: "custom-alpha", url: "https://custom.example/chat" }]);
    assert.deepEqual(
      getTargets()["custom-alpha"],
      { siteId: "custom-alpha", windowId: 80, tabId: 8, transport: "window" },
      "custom sites should still reuse tabs on the exact configured host"
    );
  }

  {
    const { context, getTargets } = makeContext(
      {},
      [
        { id: 9, windowId: 90, active: true, url: "https://www.custom.example/thread" }
      ]
    );
    await context.syncTargetsFromTabsForSites([{ siteId: "custom-alpha", url: "https://custom.example/chat" }]);
    assert.equal(
      Object.prototype.hasOwnProperty.call(getTargets(), "custom-alpha"),
      false,
      "custom sites should not apply built-in www normalization to exact host matches"
    );
  }

  {
    const { context, getTargets } = makeContext(
      {
        chatgpt: { siteId: "chatgpt", windowId: 10, tabId: 1, transport: "window" }
      },
      [
        { id: 1, windowId: 10, active: true, url: "chrome-extension://unit/ui/options/options.html" },
        { id: 2, windowId: 20, active: false, url: "https://chatgpt.com/c/old" },
        { id: 3, windowId: 30, active: true, url: "https://team.chatgpt.com/c/new" }
      ]
    );
    await context.openOrReuseWindows([{ siteId: "chatgpt", url: "https://chatgpt.com/" }], { skipFocusChain: true });
    assert.deepEqual(
      getTargets().chatgpt,
      { siteId: "chatgpt", windowId: 30, tabId: 3, transport: "window" },
      "direct open/reuse should discard stale saved targets and reuse an open matching provider tab"
    );
  }

  {
    const { context, getTargets } = makeContext(
      {
        chatgpt: { siteId: "chatgpt", windowId: 999, tabId: 2, transport: "window" }
      },
      [
        { id: 2, windowId: 20, active: false, url: "https://chatgpt.com/c/current" },
        { id: 3, windowId: 30, active: true, url: "https://chatgpt.com/c/other" }
      ]
    );
    await context.openOrReuseWindows([{ siteId: "chatgpt", url: "https://chatgpt.com/" }], { skipFocusChain: true });
    assert.deepEqual(
      getTargets().chatgpt,
      { siteId: "chatgpt", windowId: 20, tabId: 2, transport: "window" },
      "direct open/reuse should keep a valid saved tab and refresh its window id"
    );
  }

  {
    const { context, getTargets, getCreatedWindows } = makeContext(
      {
        gemini: { siteId: "gemini", windowId: 10, tabId: 5, transport: "window" }
      },
      [
        { id: 5, windowId: 10, active: true, url: "chrome-extension://unit/ui/options/options.html" },
        { id: 6, windowId: 60, active: false, url: "https://example.com/" }
      ]
    );
    await context.openOrReuseWindows([{ siteId: "gemini", url: "https://gemini.google.com/app" }], { skipFocusChain: true });
    assert.deepEqual(
      getTargets().gemini,
      { siteId: "gemini", windowId: 9000, tabId: 90000, transport: "window" },
      "direct open/reuse should open the intended provider URL when the saved target is stale and no matching tab exists"
    );
    assert.deepEqual(
      getCreatedWindows().map((w) => w.url),
      ["https://gemini.google.com/app"],
      "direct open/reuse should preserve existing provider-window creation behavior"
    );
  }

  console.log("compatible target sync validation passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
