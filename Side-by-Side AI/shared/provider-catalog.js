(function initAskAiTogetherProviderCatalog(global) {
  "use strict";

  var DEFAULT_BUILTIN_SITE_IDS = ["chatgpt", "deepseek", "kimi"];
  var GENERIC_SITE = {
    id: "generic",
    inputSelectors: ["textarea", 'div[contenteditable="true"]', "input[type='text']"],
    sendSelectors: ['button[type="submit"]', "button.send", "button[aria-label*='Send']"],
    newChatSelectors: []
  };

  var BUILTIN_PROVIDERS = [
    {
      id: "chatgpt",
      displayName: "ChatGPT",
      matchHosts: ["chatgpt.com", "chat.openai.com"],
      homeUrl: "https://chatgpt.com/",
      newChatUrl: "https://chatgpt.com/",
      inputSelectors: ["#prompt-textarea", "textarea"],
      sendSelectors: ['button[data-testid="send-button"]', 'button[type="submit"]'],
      newChatSelectors: ['[data-testid="create-new-chat-button"]', "a.no-draggable", 'a[href="/"]'],
      responseSelectors: [
        '[data-message-author-role="assistant"]',
        'article [data-message-author-role="assistant"]',
        '[data-testid="conversation-turn"] [data-message-author-role="assistant"]'
      ]
    },
    {
      id: "deepseek",
      displayName: "DeepSeek",
      matchHosts: ["chat.deepseek.com"],
      homeUrl: "https://chat.deepseek.com/",
      newChatUrl: "https://chat.deepseek.com/",
      inputSelectors: ["textarea#chat-input", "textarea"],
      sendSelectors: ['button[type="submit"]'],
      newChatSelectors: ["._5a8ac7a", 'a[href="/"]'],
      responseSelectors: ['[data-role="assistant"]', ".ds-markdown", ".markdown-body"]
    },
    {
      id: "kimi",
      displayName: "Kimi",
      matchHosts: ["www.kimi.com", "kimi.com"],
      homeUrl: "https://www.kimi.com/",
      newChatUrl: "https://www.kimi.com/",
      inputSelectors: ['div[contenteditable="true"]', "textarea"],
      sendSelectors: [".send-button-container", 'button[type="submit"]'],
      newChatSelectors: [".new-chat-btn", 'a[href="/"]'],
      responseSelectors: ['[data-role="assistant"]', ".markdown", ".segment-content"]
    },
    {
      id: "qwen",
      displayName: "Qwen",
      matchHosts: ["chat.qwen.ai"],
      homeUrl: "https://chat.qwen.ai/",
      newChatUrl: "https://chat.qwen.ai/",
      inputSelectors: [".message-input-textarea", "textarea"],
      sendSelectors: ['button[type="submit"]'],
      newChatSelectors: [".sidebar-entry-list-content", 'a[href="/"]'],
      responseSelectors: ['[data-role="assistant"]', ".message-item-assistant", ".markdown-body"]
    },
    {
      id: "doubao",
      displayName: "Doubao",
      matchHosts: ["www.doubao.com", "doubao.com"],
      homeUrl: "https://www.doubao.com/",
      newChatUrl: "https://www.doubao.com/",
      inputSelectors: ["textarea"],
      sendSelectors: ["#flow-end-msg-send", 'button[type="submit"]'],
      newChatSelectors: ['div[data-testid="create_conversation_button"]', 'a[href="/"]'],
      responseSelectors: ['[data-testid*="assistant"]', ".markdown-body", ".semi-typography"]
    },
    {
      id: "yuanbao",
      displayName: "Yuanbao",
      matchHosts: ["yuanbao.tencent.com"],
      homeUrl: "https://yuanbao.tencent.com/",
      newChatUrl: "https://yuanbao.tencent.com/",
      inputSelectors: ["div.ql-editor", "textarea", 'div[contenteditable="true"]'],
      sendSelectors: [".icon-send", 'button[type="submit"]'],
      newChatSelectors: [".yb-common-nav__trigger", 'a[href="/"]'],
      responseSelectors: ['[data-role="assistant"]', ".agent-message", ".markdown-body"]
    },
    {
      id: "grok",
      displayName: "Grok",
      matchHosts: ["grok.com"],
      homeUrl: "https://grok.com/",
      newChatUrl: "https://grok.com/",
      inputSelectors: ["textarea[aria-label]", 'div[contenteditable="true"]', "textarea"],
      sendSelectors: ['button[type="submit"]'],
      newChatSelectors: ['a[data-sidebar="menu-button"]', 'a[href="/"]'],
      responseSelectors: ['[data-testid*="assistant"]', '[data-message-author-role="assistant"]', ".prose"]
    },
    {
      id: "claude",
      displayName: "Claude",
      matchHosts: ["claude.ai"],
      homeUrl: "https://claude.ai/",
      newChatUrl: "https://claude.ai/new",
      inputSelectors: ['div[contenteditable="true"]', "textarea"],
      sendSelectors: ['button[aria-label*="Send" i]', 'button[type="submit"]'],
      newChatSelectors: ['a[href="/new"]', 'button[aria-label*="New chat" i]', 'a[href="/"]'],
      responseSelectors: ['[data-is-streaming="false"] .font-claude-message', '[data-testid*="assistant"]', ".prose"]
    },
    {
      id: "gemini",
      displayName: "Gemini",
      matchHosts: ["gemini.google.com"],
      homeUrl: "https://gemini.google.com/",
      newChatUrl: "https://gemini.google.com/",
      inputSelectors: [".ql-editor", 'div[contenteditable="true"]', "textarea"],
      sendSelectors: ["button.submit", 'button[type="submit"]'],
      newChatSelectors: [
        '[data-test-id="new-chat-button"]',
        'button[aria-label*="New chat" i]',
        'button[aria-label*="新聊天" i]',
        '[role="button"][aria-label*="New chat" i]',
        'a[href="/"]'
      ],
      responseSelectors: ["message-content", "[data-response-id]", ".model-response-text", ".response-content"]
    },
    {
      id: "perplexity",
      displayName: "Perplexity",
      matchHosts: ["www.perplexity.ai", "perplexity.ai"],
      homeUrl: "https://www.perplexity.ai/",
      newChatUrl: "https://www.perplexity.ai/",
      inputSelectors: ['textarea[placeholder]', 'div[contenteditable="true"]', "textarea"],
      sendSelectors: ['button[aria-label*="Submit" i]', 'button[type="submit"]'],
      newChatSelectors: ['a[href="/"]', 'button[aria-label*="New" i]'],
      responseSelectors: [".prose", '[data-testid="answer"]', ".markdown"]
    }
  ];

  function cloneArray(value) {
    return Array.isArray(value) ? value.slice() : [];
  }

  function cloneProvider(provider, mode) {
    var attachmentMode = mode === "legacy" || mode === "legacy-content" ? "legacy-only" : "unsupported";
    return {
      id: provider.id,
      displayName: provider.displayName,
      name: provider.displayName,
      matchHosts: cloneArray(provider.matchHosts),
      homeUrl: provider.homeUrl,
      url: provider.homeUrl,
      newChatUrl: provider.newChatUrl || provider.homeUrl,
      inputSelectors: cloneArray(provider.inputSelectors),
      sendSelectors: cloneArray(provider.sendSelectors),
      newChatSelectors: cloneArray(provider.newChatSelectors),
      responseSelectors: cloneArray(provider.responseSelectors),
      capabilities: {
        supportsAttachments: attachmentMode === "legacy-only",
        attachmentMode: attachmentMode
      }
    };
  }

  function getBuiltInProviders(options) {
    var mode = options && options.mode ? String(options.mode) : "";
    return BUILTIN_PROVIDERS.map(function (provider) {
      return cloneProvider(provider, mode);
    });
  }

  function getBuiltInSiteEntries() {
    return BUILTIN_PROVIDERS.map(function (provider) {
      return {
        id: provider.id,
        name: provider.displayName,
        url: provider.homeUrl
      };
    });
  }

  function getProviderById(siteId, options) {
    var clean = String(siteId || "");
    var provider = BUILTIN_PROVIDERS.find(function (item) {
      return item.id === clean;
    });
    return provider ? cloneProvider(provider, options && options.mode) : null;
  }

  function mapByProvider(mapper) {
    return BUILTIN_PROVIDERS.reduce(function (acc, provider) {
      acc[provider.id] = mapper(provider);
      return acc;
    }, {});
  }

  function getDisplayNameMap() {
    return mapByProvider(function (provider) {
      return provider.displayName;
    });
  }

  function getHomeUrlMap() {
    return mapByProvider(function (provider) {
      return provider.homeUrl;
    });
  }

  function getNewChatUrlMap() {
    return mapByProvider(function (provider) {
      return provider.newChatUrl || provider.homeUrl;
    });
  }

  function getHostMap() {
    return mapByProvider(function (provider) {
      return cloneArray(provider.matchHosts);
    });
  }

  function getResponseSelectorsMap() {
    return mapByProvider(function (provider) {
      return cloneArray(provider.responseSelectors);
    });
  }

  function getManifestHostPatterns() {
    var seen = {};
    var patterns = [];
    BUILTIN_PROVIDERS.forEach(function (provider) {
      provider.matchHosts.forEach(function (host) {
        var pattern = "https://" + host + "/*";
        if (seen[pattern]) return;
        seen[pattern] = true;
        patterns.push(pattern);
      });
    });
    return patterns;
  }

  function providerMatchesHost(provider, host) {
    var cleanHost = String(host || "").toLowerCase();
    if (!cleanHost) return false;
    return provider.matchHosts.some(function (matchHost) {
      var cleanMatchHost = String(matchHost || "").toLowerCase();
      return cleanMatchHost && (cleanHost === cleanMatchHost || cleanHost.endsWith("." + cleanMatchHost));
    });
  }

  function matchProviderForLocation(locationLike, options) {
    var host = "";
    try {
      host = String(locationLike && locationLike.hostname ? locationLike.hostname : global.location && global.location.hostname);
    } catch (_error) {
      host = "";
    }
    var provider = BUILTIN_PROVIDERS.find(function (item) {
      return providerMatchesHost(item, host);
    });
    return provider ? cloneProvider(provider, options && options.mode) : null;
  }

  global.AskAiTogetherProviderCatalog = {
    defaultBuiltInSiteIds: DEFAULT_BUILTIN_SITE_IDS.slice(),
    genericSite: Object.assign({}, GENERIC_SITE, {
      inputSelectors: cloneArray(GENERIC_SITE.inputSelectors),
      sendSelectors: cloneArray(GENERIC_SITE.sendSelectors),
      newChatSelectors: cloneArray(GENERIC_SITE.newChatSelectors)
    }),
    getBuiltInProviders: getBuiltInProviders,
    getBuiltInSiteEntries: getBuiltInSiteEntries,
    getProviderById: getProviderById,
    getDisplayNameMap: getDisplayNameMap,
    getHomeUrlMap: getHomeUrlMap,
    getNewChatUrlMap: getNewChatUrlMap,
    getHostMap: getHostMap,
    getResponseSelectorsMap: getResponseSelectorsMap,
    getManifestHostPatterns: getManifestHostPatterns,
    providerMatchesHost: providerMatchesHost,
    matchProviderForLocation: matchProviderForLocation
  };
})(globalThis);
