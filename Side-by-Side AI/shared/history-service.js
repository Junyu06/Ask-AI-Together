(function initAskAiTogetherHistoryService(global) {
  "use strict";

  var HISTORY_KEY = "oa_history";
  var MAX_HISTORY_ENTRIES = 200;
  var RECENT_PATCH_WINDOW_MS = 30 * 60 * 1000;

  function isObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function cleanString(value) {
    return String(value || "").trim();
  }

  function isHttpUrl(value) {
    return /^https?:\/\//i.test(cleanString(value));
  }

  function cappedHistory(history) {
    return Array.isArray(history) ? history.slice(0, MAX_HISTORY_ENTRIES) : [];
  }

  function cloneEntry(entry) {
    if (!isObject(entry)) return entry;
    var copy = Object.assign({}, entry);
    if (Array.isArray(entry.sites)) copy.sites = entry.sites.slice();
    if (Array.isArray(entry.siteIds)) copy.siteIds = entry.siteIds.slice();
    if (isObject(entry.urls)) copy.urls = Object.assign({}, entry.urls);
    return copy;
  }

  function cloneHistory(history) {
    return cappedHistory(history).map(cloneEntry);
  }

  function defaultStorage() {
    if (global.chrome && global.chrome.storage && global.chrome.storage.local) {
      return global.chrome.storage.local;
    }
    return null;
  }

  function resolveStorage(options) {
    var opts = isObject(options) ? options : {};
    return opts.storage || defaultStorage();
  }

  function defaultMutationTransport() {
    if (!global.chrome || !global.chrome.runtime || typeof global.chrome.runtime.sendMessage !== "function") {
      return null;
    }
    if (!global.document || !global.location || !/^chrome-extension:/i.test(String(global.location.href || ""))) {
      return null;
    }
    return "background";
  }

  function resolveMutationTransport(options, fallbackOptions) {
    var opts = isObject(options) ? options : {};
    if (Object.prototype.hasOwnProperty.call(opts, "mutationTransport")) return opts.mutationTransport;
    if (Object.prototype.hasOwnProperty.call(opts, "backgroundMutationTransport")) return opts.backgroundMutationTransport;
    var fallback = isObject(fallbackOptions) ? fallbackOptions : {};
    if (Object.prototype.hasOwnProperty.call(fallback, "mutationTransport")) return fallback.mutationTransport;
    if (Object.prototype.hasOwnProperty.call(fallback, "backgroundMutationTransport")) {
      return fallback.backgroundMutationTransport;
    }
    return defaultMutationTransport();
  }

  function cloneRpcValue(value) {
    if (typeof value === "function") return null;
    if (Array.isArray(value)) return value.map(cloneRpcValue);
    if (!isObject(value)) return value;
    var copy = {};
    Object.keys(value).forEach(function (key) {
      if (key === "storage" || key === "mutationTransport" || key === "backgroundMutationTransport") return;
      if (typeof value[key] === "function") return;
      copy[key] = cloneRpcValue(value[key]);
    });
    return copy;
  }

  function sendRuntimeMutation(method, args) {
    return new Promise(function (resolve, reject) {
      try {
        global.chrome.runtime.sendMessage(
          {
            type: "OA_HISTORY_MUTATE",
            payload: {
              method: method,
              args: cloneRpcValue(args)
            }
          },
          function (response) {
            var runtimeError = global.chrome.runtime.lastError;
            if (runtimeError) {
              reject(new Error(runtimeError.message || String(runtimeError)));
              return;
            }
            if (!response || response.ok !== true) {
              reject(new Error(String((response && response.error) || "history mutation failed")));
              return;
            }
            resolve(response.result);
          }
        );
      } catch (error) {
        reject(error);
      }
    });
  }

  function sendBackgroundMutation(method, args, mutationOptions, serviceOptions) {
    var transport = resolveMutationTransport(mutationOptions, serviceOptions);
    if (!transport) return null;
    if (method === "updateEntryById" && typeof args[1] === "function") {
      return Promise.reject(new Error("history updateEntryById function updaters cannot be sent to background"));
    }
    if (typeof transport === "function") {
      return Promise.resolve(transport({ method: method, args: cloneRpcValue(args) }));
    }
    if (isObject(transport) && typeof transport.send === "function") {
      return Promise.resolve(transport.send({ method: method, args: cloneRpcValue(args) }));
    }
    return sendRuntimeMutation(method, args);
  }

  function applyEntryUpdate(current, updater, index, history) {
    if (typeof updater === "function") return updater(current, index, history);
    if (!isObject(updater)) return null;

    var prompt = cleanString(current && current.prompt);
    if (Array.isArray(updater.ifPromptIn)) {
      var allowedPrompts = updater.ifPromptIn.map(cleanString);
      if (allowedPrompts.indexOf(prompt) < 0) return null;
    }

    var updated = cloneEntry(current);
    if (isObject(updater.set)) {
      Object.keys(updater.set).forEach(function (key) {
        updated[key] = cloneRpcValue(updater.set[key]);
      });
    }
    return updated;
  }

  function isRootLikePath(pathname) {
    var p = cleanString(pathname);
    return (
      !p ||
      p === "/" ||
      p === "/new" ||
      p === "/new/" ||
      p === "/chat" ||
      p === "/chat/" ||
      p === "/app" ||
      p === "/app/" ||
      /^\/u\/\d+\/app\/?$/.test(p)
    );
  }

  function shouldReplaceHistoryUrl(previousUrl, nextUrl) {
    var prev = cleanString(previousUrl);
    var next = cleanString(nextUrl);
    if (!isHttpUrl(next)) return false;
    if (!prev) return true;
    if (prev === next) return false;
    try {
      var prevUrl = new URL(prev);
      var nextUrlObj = new URL(next);
      if (prevUrl.origin !== nextUrlObj.origin) return false;
      if (isRootLikePath(prevUrl.pathname) && !isRootLikePath(nextUrlObj.pathname)) return true;
      if (!prevUrl.search && !prevUrl.hash && (nextUrlObj.search || nextUrlObj.hash)) return true;
      if (
        prevUrl.pathname !== nextUrlObj.pathname &&
        nextUrlObj.pathname.startsWith(prevUrl.pathname.replace(/\/+$/, "") + "/")
      ) {
        return true;
      }
    } catch (_error) {
      return true;
    }
    return false;
  }

  function shouldPatchTargetedHistoryUrl(previousUrl, nextUrl) {
    var prev = cleanString(previousUrl);
    var next = cleanString(nextUrl);
    if (!isHttpUrl(next)) return false;
    var nextUrlObj;
    try {
      nextUrlObj = new URL(next);
    } catch (_error) {
      return false;
    }
    if (nextUrlObj.protocol !== "http:" && nextUrlObj.protocol !== "https:") return false;
    if (!prev) return true;
    var prevUrl = null;
    try {
      prevUrl = new URL(prev);
    } catch (_error) {
      prevUrl = null;
    }
    if (prevUrl && prevUrl.origin && prevUrl.origin !== "null") {
      if (prevUrl.href === nextUrlObj.href) return false;
      return prevUrl.origin === nextUrlObj.origin;
    }
    return prev !== nextUrlObj.href;
  }

  function makeService(options) {
    var serviceOptions = isObject(options) ? options : {};
    var writeQueue = Promise.resolve();

    async function loadHistory(loadOptions) {
      var storage = resolveStorage(loadOptions || serviceOptions);
      if (!storage) return [];
      try {
        var data = await storage.get([HISTORY_KEY]);
        return cloneHistory(data && data[HISTORY_KEY]);
      } catch (_error) {
        return [];
      }
    }

    async function writeHistory(history, writeOptions) {
      var storage = resolveStorage(writeOptions || serviceOptions);
      if (!storage) return [];
      var next = cloneHistory(history);
      await storage.set({ [HISTORY_KEY]: next });
      return next;
    }

    function enqueueWrite(work) {
      var job = writeQueue.then(function () {
        return work();
      });
      writeQueue = job.catch(function () {});
      return job;
    }

    function enqueueMutation(method, args, localWork, mutationOptions) {
      var remote = sendBackgroundMutation(method, args, mutationOptions, serviceOptions);
      if (remote) return remote;
      return enqueueWrite(localWork);
    }

    function saveHistory(history, saveOptions) {
      var args = [history, saveOptions];
      var opts = saveOptions || serviceOptions;
      return enqueueMutation("saveHistory", args, function () {
        return writeHistory(history, saveOptions);
      }, opts);
    }

    function prependEntry(entry, prependOptions) {
      var args = [entry, prependOptions];
      var opts = prependOptions || serviceOptions;
      var remote = sendBackgroundMutation("prependEntry", args, opts, serviceOptions);
      if (remote) return remote;
      var cleanEntry = cloneEntry(entry);
      if (!isObject(cleanEntry)) return Promise.resolve(null);
      return enqueueWrite(function () {
        return (async function () {
          var history = await loadHistory(prependOptions);
          history.unshift(cleanEntry);
          await writeHistory(history, prependOptions);
          return cleanEntry;
        })();
      });
    }

    function deleteEntryById(entryId, deleteOptions) {
      var id = cleanString(entryId);
      if (!id) return Promise.resolve(false);
      var args = [entryId, deleteOptions];
      var opts = deleteOptions || serviceOptions;
      return enqueueMutation("deleteEntryById", args, async function () {
        var history = await loadHistory(deleteOptions);
        var next = history.filter(function (item) {
          return cleanString(item && item.id) !== id;
        });
        if (next.length === history.length) return false;
        await writeHistory(next, deleteOptions);
        return true;
      }, opts);
    }

    function updateEntryById(entryId, updater, updateOptions) {
      var id = cleanString(entryId);
      if (!id || (typeof updater !== "function" && !isObject(updater))) return Promise.resolve(null);
      var args = [entryId, updater, updateOptions];
      var opts = updateOptions || serviceOptions;
      return enqueueMutation("updateEntryById", args, async function () {
        var history = await loadHistory(updateOptions);
        var index = history.findIndex(function (item) {
          return item && item.id === id;
        });
        if (index < 0) return null;
        var current = cloneEntry(history[index]);
        var updated = applyEntryUpdate(current, updater, index, history);
        if (!updated) return null;
        history[index] = cloneEntry(updated);
        await writeHistory(history, updateOptions);
        return history[index];
      }, opts);
    }

    function patchHistoryUrl(entryId, siteId, url, patchOptions) {
      var id = cleanString(entryId);
      var cleanSiteId = cleanString(siteId);
      var cleanUrl = cleanString(url);
      if (!id || !cleanSiteId || !isHttpUrl(cleanUrl)) return Promise.resolve(false);
      var args = [entryId, siteId, url, patchOptions];
      var opts = patchOptions || serviceOptions;
      return enqueueMutation("patchHistoryUrl", args, async function () {
        var history = await loadHistory(patchOptions);
        var index = history.findIndex(function (item) {
          return item && item.id === id;
        });
        if (index < 0) return false;
        var item = cloneEntry(history[index]);
        var urls = isObject(item.urls) ? Object.assign({}, item.urls) : {};
        if (!shouldPatchTargetedHistoryUrl(urls[cleanSiteId], cleanUrl)) return false;
        urls[cleanSiteId] = cleanUrl;
        item.urls = urls;
        history[index] = item;
        await writeHistory(history, patchOptions);
        return true;
      }, opts);
    }

    function patchRecentHistoryUrl(siteId, url, patchOptions) {
      var cleanSiteId = cleanString(siteId);
      var cleanUrl = cleanString(url);
      var opts = isObject(patchOptions) ? patchOptions : {};
      var now = Number(opts.now) || Date.now();
      var windowMs = Number(opts.windowMs) || RECENT_PATCH_WINDOW_MS;
      if (!cleanSiteId || !isHttpUrl(cleanUrl)) return Promise.resolve(false);
      var args = [siteId, url, patchOptions];
      return enqueueMutation("patchRecentHistoryUrl", args, async function () {
        var history = await loadHistory(opts);
        var changed = false;

        for (var i = 0; i < history.length; i += 1) {
          var entry = history[i];
          if (!isObject(entry)) continue;
          var ts = Number(entry.ts) || 0;
          if (ts && now - ts > windowMs) break;
          var urls = isObject(entry.urls) ? Object.assign({}, entry.urls) : null;
          if (!urls || !(cleanSiteId in urls)) continue;
          if (!shouldReplaceHistoryUrl(urls[cleanSiteId], cleanUrl)) break;
          urls[cleanSiteId] = cleanUrl;
          entry.urls = urls;
          history[i] = entry;
          changed = true;
          break;
        }

        if (!changed) return false;
        await writeHistory(history, opts);
        return true;
      }, opts);
    }

    return {
      constants: {
        historyKey: HISTORY_KEY,
        maxEntries: MAX_HISTORY_ENTRIES,
        recentPatchWindowMs: RECENT_PATCH_WINDOW_MS
      },
      loadHistory: loadHistory,
      saveHistory: saveHistory,
      prependEntry: prependEntry,
      deleteEntryById: deleteEntryById,
      updateEntryById: updateEntryById,
      patchHistoryUrl: patchHistoryUrl,
      patchRecentHistoryUrl: patchRecentHistoryUrl,
      isRootLikePath: isRootLikePath,
      shouldReplaceHistoryUrl: shouldReplaceHistoryUrl,
      shouldPatchTargetedHistoryUrl: shouldPatchTargetedHistoryUrl,
      create: makeService
    };
  }

  global.AskAiTogetherHistoryService = makeService();
})(globalThis);
