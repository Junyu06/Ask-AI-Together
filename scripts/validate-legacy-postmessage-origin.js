"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");

const repoRoot = path.resolve(__dirname, "..");
const providerCatalogPath = path.join(repoRoot, "Side-by-Side AI", "shared", "provider-catalog.js");
const legacyContentPath = path.join(repoRoot, "Side-by-Side AI", "legacy", "content.js");
const source = fs.readFileSync(legacyContentPath, "utf8").replace(
  /\n\}\)\(\);\s*$/,
  `
globalThis.__legacyPostMessageOriginTestApi = {
  postToExtensionParent,
  effectiveLegacySiteId,
  rememberLegacyConfiguredSiteId
};
})();`
);

const EXTENSION_ORIGIN = "chrome-extension://ask-ai-together";

function makeContext({ ancestorOrigins, parentOrigin }) {
  const parentWindow = {
    calls: [],
    postMessage(message, targetOrigin) {
      if (targetOrigin !== parentOrigin) {
        throw new DOMException(
          `The target origin provided ('${targetOrigin}') does not match the recipient window's origin ('${parentOrigin}')`,
          "DataCloneError"
        );
      }
      this.calls.push({ message, targetOrigin });
    }
  };

  const context = vm.createContext({
    console,
    Date,
    URL,
    DOMException,
    setInterval() {
      return 1;
    },
    clearInterval() {},
    chrome: {
      runtime: {
        getURL() {
          return `${EXTENSION_ORIGIN}/`;
        }
      }
    },
    navigator: {
      language: "en-US"
    },
    location: {
      hostname: "gemini.google.com",
      href: "https://gemini.google.com/app",
      origin: "https://gemini.google.com",
      ancestorOrigins
    },
    document: {
      referrer: ancestorOrigins.length ? `${ancestorOrigins[0]}/legacy/index.html` : "",
      documentElement: {},
      body: {},
      addEventListener() {},
      querySelector() {
        return null;
      }
    },
    window: null,
    globalThis: null
  });
  context.globalThis = context;
  context.window = {
    parent: parentWindow,
    addEventListener() {},
    setTimeout() {
      return 1;
    },
    clearTimeout() {},
    getComputedStyle() {
      return {
        display: "block",
        visibility: "visible",
        opacity: "1"
      };
    }
  };
  return { context, parentWindow };
}

const nested = makeContext({
  ancestorOrigins: ["https://gemini.google.com", EXTENSION_ORIGIN],
  parentOrigin: "https://gemini.google.com"
});
assert.doesNotThrow(() => {
  vm.runInContext(fs.readFileSync(providerCatalogPath, "utf8"), nested.context, { filename: providerCatalogPath });
  vm.runInContext(source, nested.context, { filename: legacyContentPath });
});
assert.equal(nested.parentWindow.calls.length, 0);
nested.context.__legacyPostMessageOriginTestApi.postToExtensionParent({ type: "PING" });
assert.equal(nested.parentWindow.calls.length, 0);

const direct = makeContext({
  ancestorOrigins: [EXTENSION_ORIGIN],
  parentOrigin: EXTENSION_ORIGIN
});
vm.runInContext(fs.readFileSync(providerCatalogPath, "utf8"), direct.context, { filename: providerCatalogPath });
vm.runInContext(source, direct.context, { filename: legacyContentPath });
direct.context.__legacyPostMessageOriginTestApi.postToExtensionParent({ type: "PING" });
assert.ok(direct.parentWindow.calls.length >= 1);
assert.equal(direct.parentWindow.calls.at(-1).targetOrigin, EXTENSION_ORIGIN);
assert.equal(direct.parentWindow.calls.at(-1).message.type, "PING");
assert.equal(
  direct.context.__legacyPostMessageOriginTestApi.effectiveLegacySiteId({ id: "generic" }, "custom-alpha"),
  "custom-alpha"
);
assert.equal(
  direct.context.__legacyPostMessageOriginTestApi.effectiveLegacySiteId({ id: "chatgpt" }, "custom-alpha"),
  "chatgpt"
);
direct.context.__legacyPostMessageOriginTestApi.rememberLegacyConfiguredSiteId("custom-beta");
assert.equal(
  direct.context.__legacyPostMessageOriginTestApi.effectiveLegacySiteId({ id: "generic" }),
  "custom-beta"
);

console.log("legacy postMessage origin validation passed");
