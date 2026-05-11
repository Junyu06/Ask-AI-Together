"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");

const repoRoot = path.resolve(__dirname, "..");
const historyServicePath = path.join(repoRoot, "Side-by-Side AI", "shared", "history-service.js");
const source = fs.readFileSync(historyServicePath, "utf8");
const backgroundPath = path.join(repoRoot, "Side-by-Side AI", "background", "background.js");
const backgroundActionsPath = path.join(repoRoot, "Side-by-Side AI", "background", "bg-actions.js");
const legacyAppPath = path.join(repoRoot, "Side-by-Side AI", "legacy", "app.js");
const optionsPath = path.join(repoRoot, "Side-by-Side AI", "ui", "options", "options.js");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeStorage(initialHistory, options = {}) {
  const delayMs = Number(options.delayMs) || 0;
  const state = {
    oa_history: clone(initialHistory)
  };
  const writes = [];
  return {
    storage: {
      async get() {
        return { oa_history: clone(state.oa_history) };
      },
      async set(patch) {
        if (delayMs) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
        Object.assign(state, clone(patch));
        writes.push(clone(patch));
      }
    },
    read() {
      return clone(state.oa_history);
    },
    writes
  };
}

const context = vm.createContext({
  console,
  Date,
  Promise,
  URL,
  setTimeout,
  globalThis: {}
});
context.globalThis = context;

vm.runInContext(source, context, { filename: historyServicePath });

const historyService = context.AskAiTogetherHistoryService;
assert.ok(historyService, "history service should load");
assert.equal(historyService.constants.historyKey, "oa_history");
assert.equal(historyService.constants.maxEntries, 200);
assert.match(source, /OA_HISTORY_MUTATE/, "history service should proxy UI mutations through the background action");
assert.match(
  fs.readFileSync(backgroundPath, "utf8"),
  /msg\.type === "OA_HISTORY_MUTATE"/,
  "background should handle shared history mutation messages"
);
assert.match(
  fs.readFileSync(backgroundActionsPath, "utf8"),
  /function runHistoryMutation/,
  "background should execute history mutations locally"
);

function assertNoDirectHistoryStorageWrites(filePath) {
  const fileSource = fs.readFileSync(filePath, "utf8");
  const writes = [...fileSource.matchAll(/chrome\.storage\.local\.set\s*\(([\s\S]*?)\)/g)]
    .map((match) => match[0])
    .filter((write) => /oa_history|STORAGE_KEYS\.history(?![A-Za-z0-9_])|STORAGE_HISTORY(?![A-Za-z0-9_])/.test(write));
  assert.deepEqual(writes, [], `${path.relative(repoRoot, filePath)} should not directly write oa_history`);
}

assertNoDirectHistoryStorageWrites(legacyAppPath);
assertNoDirectHistoryStorageWrites(optionsPath);

(async () => {
  assert.equal(historyService.isRootLikePath("/"), true);
  assert.equal(historyService.isRootLikePath("/new"), true);
  assert.equal(historyService.isRootLikePath("/chat/abc"), false);
  assert.equal(
    historyService.shouldReplaceHistoryUrl("https://claude.ai/new", "https://claude.ai/chat/abc"),
    true,
    "root-like saved URL should forward-patch to a conversation URL"
  );
  assert.equal(
    historyService.shouldReplaceHistoryUrl("https://claude.ai/chat/abc", "https://chatgpt.com/c/abc"),
    false,
    "history URL patch must not cross origins"
  );
  assert.equal(
    historyService.shouldReplaceHistoryUrl("https://chatgpt.com/", "https://chatgpt.com/?model=gpt-5"),
    true,
    "empty search/hash can forward-patch to a same-origin URL with state"
  );

  {
    const backing = makeStorage("not-array");
    const service = historyService.create({ storage: backing.storage });
    assert.deepEqual(clone(await service.loadHistory()), [], "non-array stored history should load as empty array");
  }

  {
    const backing = makeStorage([]);
    const service = historyService.create({ storage: backing.storage });
    const entries = Array.from({ length: 205 }, (_, index) => ({ id: String(index), ts: index }));
    const saved = await service.saveHistory(entries);
    assert.equal(saved.length, 200, "saved history should cap at 200 entries");
    assert.equal(backing.read().length, 200, "stored history should cap at 200 entries");
  }

  {
    const backing = makeStorage([{ id: "seed", prompt: "Seed", ts: 1 }], { delayMs: 5 });
    const service = historyService.create({ storage: backing.storage });
    const entryA = {
      id: "a",
      prompt: "A",
      aiSummary: false,
      ts: 2,
      siteIds: ["chatgpt"],
      sites: ["ChatGPT"],
      urls: { chatgpt: "https://chatgpt.com/" }
    };
    const entryB = {
      id: "b",
      prompt: "B",
      aiSummary: true,
      ts: 3,
      sites: ["Claude"],
      urls: { claude: "https://claude.ai/new" }
    };
    await Promise.all([service.prependEntry(entryA), service.prependEntry(entryB)]);
    const stored = backing.read();
    assert.deepEqual(stored.map((entry) => entry.id), ["b", "a", "seed"], "local write queue should serialize concurrent prepends");
    assert.deepEqual(
      Object.keys(stored[1]).sort(),
      ["aiSummary", "id", "prompt", "siteIds", "sites", "ts", "urls"].sort(),
      "prepend should preserve the existing history entry shape without schema fields"
    );
    assert.equal("schemaVersion" in stored[1], false);
  }

  {
    const backing = makeStorage([{ id: "seed", prompt: "Seed", ts: 1 }], { delayMs: 5 });
    const backgroundService = historyService.create({ storage: backing.storage, mutationTransport: null });
    const uiStorage = {
      async get(keys) {
        return backing.storage.get(keys);
      },
      async set() {
        throw new Error("UI proxy service must not write history storage directly");
      }
    };
    const calls = [];
    async function backgroundHandler(request) {
      calls.push(request.method);
      return backgroundService[request.method](...request.args);
    }
    const uiServiceA = historyService.create({ storage: uiStorage, mutationTransport: backgroundHandler });
    const uiServiceB = historyService.create({ storage: uiStorage, mutationTransport: backgroundHandler });
    await Promise.all([
      uiServiceA.prependEntry({ id: "ui-a", prompt: "A", ts: 2 }),
      uiServiceB.prependEntry({ id: "ui-b", prompt: "B", ts: 3 })
    ]);
    const stored = backing.read();
    assert.equal(stored.length, 3, "background-owned queue should preserve both cross-instance UI prepends");
    assert.deepEqual(
      stored.slice(0, 2).map((entry) => entry.id).sort(),
      ["ui-a", "ui-b"],
      "cross-instance UI prepends should both be present"
    );
    assert.deepEqual(calls, ["prependEntry", "prependEntry"], "UI proxy services should call background mutations");
  }

  {
    const backing = makeStorage([{ id: "new-chat", prompt: "New chat", ts: 1 }]);
    const backgroundService = historyService.create({ storage: backing.storage, mutationTransport: null });
    const uiService = historyService.create({
      storage: {
        async get(keys) {
          return backing.storage.get(keys);
        },
        async set() {
          throw new Error("UI proxy service must not write history storage directly");
        }
      },
      mutationTransport(request) {
        return backgroundService[request.method](...request.args);
      }
    });
    const updated = await uiService.updateEntryById("new-chat", {
      ifPromptIn: ["New chat"],
      set: { prompt: "Actual prompt", aiSummary: false, sites: ["ChatGPT"] }
    });
    assert.equal(updated.prompt, "Actual prompt", "serializable update patches should run in background");
    assert.deepEqual(backing.read()[0].sites, ["ChatGPT"]);
    const skipped = await uiService.updateEntryById("new-chat", {
      ifPromptIn: ["New chat"],
      set: { prompt: "Should not overwrite" }
    });
    assert.equal(skipped, null, "guarded update patch should preserve existing prompt when guard fails");
    assert.equal(backing.read()[0].prompt, "Actual prompt");
  }

  {
    const now = Date.now();
    const backing = makeStorage([
      {
        id: "recent",
        prompt: "Recent",
        ts: now,
        urls: { claude: "https://claude.ai/new", chatgpt: "https://chatgpt.com/" }
      },
      {
        id: "older",
        prompt: "Older",
        ts: now - 1000,
        urls: { claude: "https://claude.ai/new" }
      }
    ]);
    const service = historyService.create({ storage: backing.storage });
    assert.equal(
      await service.patchRecentHistoryUrl("claude", "https://claude.ai/chat/abc", { now, storage: backing.storage }),
      true,
      "recent root-like URL should patch forward"
    );
    assert.equal(backing.read()[0].urls.claude, "https://claude.ai/chat/abc");
    assert.equal(
      await service.patchRecentHistoryUrl("chatgpt", "https://evil.example/c/abc", { now, storage: backing.storage }),
      false,
      "recent URL patch should reject cross-origin replacement"
    );
    assert.equal(backing.read()[0].urls.chatgpt, "https://chatgpt.com/");
    assert.equal(
      await service.patchRecentHistoryUrl("claude", "https://claude.ai/chat/def", { now, storage: backing.storage }),
      false,
      "recent URL patch should remain forward-only and reject conversation-to-conversation replacement"
    );
    assert.equal(backing.read()[0].urls.claude, "https://claude.ai/chat/abc");
  }

  {
    const backing = makeStorage([
      { id: "target", prompt: "Target", ts: 1, urls: { chatgpt: "https://chatgpt.com/" } },
      { id: "empty", prompt: "Empty", ts: 2, urls: { chatgpt: "" } },
      { id: "keep", prompt: "Keep", ts: 2 }
    ]);
    const service = historyService.create({ storage: backing.storage });
    assert.equal(await service.patchHistoryUrl("target", "chatgpt", "https://chatgpt.com/c/123"), true);
    assert.equal(backing.read()[0].urls.chatgpt, "https://chatgpt.com/c/123");
    assert.equal(
      await service.patchHistoryUrl("target", "chatgpt", "https://chatgpt.com/c/456"),
      true,
      "targeted URL patch should accept same-origin conversation-to-conversation replacement"
    );
    assert.equal(backing.read()[0].urls.chatgpt, "https://chatgpt.com/c/456");
    assert.equal(
      await service.patchHistoryUrl("target", "chatgpt", "https://chatgpt.com/c/456"),
      false,
      "targeted URL patch should reject normalized no-op replacement"
    );
    assert.equal(
      await service.patchHistoryUrl("target", "chatgpt", "https://evil.example/c/456"),
      false,
      "targeted URL patch should reject cross-origin replacement"
    );
    assert.equal(
      await service.patchHistoryUrl("target", "chatgpt", "ftp://chatgpt.com/c/456"),
      false,
      "targeted URL patch should reject non-HTTP(S) replacement"
    );
    assert.equal(backing.read()[0].urls.chatgpt, "https://chatgpt.com/c/456");
    assert.equal(
      await service.patchHistoryUrl("empty", "chatgpt", "https://chatgpt.com/c/789"),
      true,
      "targeted URL patch should accept HTTP(S) target when the existing URL is empty"
    );
    assert.equal(await service.deleteEntryById("target"), true);
    assert.deepEqual(backing.read().map((entry) => entry.id), ["empty", "keep"], "delete should remove only the matching entry");
  }

  console.log("history-service validation passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
