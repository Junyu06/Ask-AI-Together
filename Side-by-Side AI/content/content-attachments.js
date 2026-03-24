"use strict";

function dataUrlToBlob(dataUrl) {
  const idx = dataUrl.indexOf(",");
  if (idx < 0) return null;
  const meta = dataUrl.slice(0, idx);
  const body = dataUrl.slice(idx + 1);
  const mimeMatch = meta.match(/^data:([^;]+);base64$/i);
  if (!mimeMatch) return null;
  const mimeType = mimeMatch[1] || "application/octet-stream";
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

function toFiles(items) {
  return items
    .map((item, index) => {
      const type = String(item?.type || "application/octet-stream");
      const blob = dataUrlToBlob(String(item?.dataUrl || ""));
      if (!blob) return null;
      const ext = type.split("/")[1]?.split(";")[0] || "bin";
      const name = String(item?.name || `file-${Date.now()}-${index}.${ext}`);
      return new File([blob], name, { type });
    })
    .filter(Boolean);
}

function buildDataTransfer(files) {
  try {
    const dt = new DataTransfer();
    files.forEach((file) => dt.items.add(file));
    return dt;
  } catch (_error) {
    return null;
  }
}

function attachByFileInput(files, hintEl = null) {
  const inputs = queryDeepAll(['input[type="file"]']).filter((el) => !el.disabled);
  inputs.sort((a, b) => {
    const aAccept = String(a.getAttribute("accept") || "").toLowerCase();
    const bAccept = String(b.getAttribute("accept") || "").toLowerCase();
    const aImg = aAccept.includes("image") ? 10 : 0;
    const bImg = bAccept.includes("image") ? 10 : 0;
    let aNear = 0;
    let bNear = 0;
    if (hintEl && hintEl.getBoundingClientRect) {
      const hr = hintEl.getBoundingClientRect();
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      const ad = Math.abs(ar.top - hr.top) + Math.abs(ar.left - hr.left);
      const bd = Math.abs(br.top - hr.top) + Math.abs(br.left - hr.left);
      aNear = -Math.min(ad, 5000) / 500;
      bNear = -Math.min(bd, 5000) / 500;
    }
    return bImg + bNear - (aImg + aNear);
  });
  for (const input of inputs) {
    try {
      const dt = buildDataTransfer(files);
      if (!dt) continue;
      input.focus();
      input.files = dt.files;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    } catch (_error) {
      // Continue trying next candidate.
    }
  }
  return false;
}

function attachByDrop(inputEl, files) {
  if (!inputEl) return false;
  const dt = buildDataTransfer(files);
  if (!dt) return false;
  try {
    inputEl.focus();
    ["dragenter", "dragover", "drop"].forEach((type) => {
      let evt;
      try {
        evt = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt });
      } catch (_error) {
        evt = new Event(type, { bubbles: true, cancelable: true });
      }
      if (!("dataTransfer" in evt)) {
        Object.defineProperty(evt, "dataTransfer", { value: dt });
      }
      inputEl.dispatchEvent(evt);
    });
    return true;
  } catch (_error) {
    return false;
  }
}

function attachByPaste(inputEl, files) {
  if (!inputEl) return false;
  const dt = buildDataTransfer(files);
  if (!dt) return false;

  try {
    inputEl.focus();
    const beforeEvent = new InputEvent("beforeinput", {
      bubbles: true,
      cancelable: true,
      inputType: "insertFromPaste",
      dataTransfer: dt
    });
    inputEl.dispatchEvent(beforeEvent);
  } catch (_error) {
    // Continue fallback.
  }

  try {
    const pasteEvent = new ClipboardEvent("paste", {
      bubbles: true,
      cancelable: true
    });
    Object.defineProperty(pasteEvent, "clipboardData", { value: dt });
    inputEl.dispatchEvent(pasteEvent);
    return true;
  } catch (_error) {
    return false;
  }
}

function attachByPasteTargets(targets, files) {
  for (const target of targets) {
    if (attachByPaste(target, files)) return true;
  }
  return false;
}

function geminiMainWorldAttach() {
  function signal(ok) {
    document.dispatchEvent(new CustomEvent("__oa_attach_result", { detail: { ok: ok } }));
  }
  try {
    var el = document.getElementById("__oa_attach_payload");
    if (!el) {
      signal(false);
      return;
    }
    var items = JSON.parse(el.value);
    el.remove();

    var files = items.map(function (item) {
      var i = item.dataUrl.indexOf(",");
      var b = atob(item.dataUrl.slice(i + 1));
      var a = new Uint8Array(b.length);
      for (var j = 0; j < b.length; j++) a[j] = b.charCodeAt(j);
      return new File([a], item.name, { type: item.type });
    });
    if (!files.length) {
      signal(false);
      return;
    }

    var dt = new DataTransfer();
    files.forEach(function (f) {
      dt.items.add(f);
    });

    var done = false;
    var origClick = HTMLInputElement.prototype.click;
    var origPicker = window.showOpenFilePicker;

    function cleanup() {
      HTMLInputElement.prototype.click = origClick;
      if (origPicker) window.showOpenFilePicker = origPicker;
      observer.disconnect();
    }

    function inject(input) {
      if (done) return;
      done = true;
      cleanup();
      input.files = dt.files;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      signal(true);
    }

    HTMLInputElement.prototype.click = function () {
      if (this.type === "file" && !done) {
        inject(this);
        return;
      }
      return origClick.call(this);
    };

    if (window.showOpenFilePicker) {
      window.showOpenFilePicker = function () {
        done = true;
        cleanup();
        signal(true);
        return Promise.resolve(
          files.map(function (f) {
            return { kind: "file", name: f.name, getFile: function () { return Promise.resolve(f); } };
          })
        );
      };
    }

    var observer = new MutationObserver(function () {
      if (done) return;
      var inputs = document.querySelectorAll('input[type="file"]');
      for (var k = 0; k < inputs.length; k++) {
        if (!inputs[k].disabled) {
          inject(inputs[k]);
          return;
        }
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    var sels = [
      'button[aria-label*="Upload" i]', 'button[aria-label*="Add file" i]',
      'button[aria-label*="Add photo" i]', 'button[aria-label*="Add image" i]',
      'button[aria-label*="Attach" i]', 'button[aria-label*="上传" i]',
      'button[aria-label*="文件" i]', 'button[aria-label*="图片" i]',
      'button[aria-label*="添加" i]', '[data-test-id*="upload"]',
      '[data-testid*="upload"]', 'button[mattooltip*="Upload" i]',
      'button[mattooltip*="photo" i]', '[data-tooltip*="Upload" i]',
      'div[role="button"][aria-label*="Upload" i]',
      'div[role="button"][aria-label*="file" i]'
    ];
    for (var s = 0; s < sels.length; s++) {
      var btn = document.querySelector(sels[s]);
      if (btn && btn.offsetWidth > 0) {
        btn.click();
        break;
      }
    }

    setTimeout(function () {
      if (!done) {
        done = true;
        cleanup();
        signal(false);
      }
    }, 6000);
  } catch (e) {
    signal(false);
  }
}

function attachByMainWorld(items) {
  return new Promise(function (resolve) {
    var resolved = false;
    var handler = function (event) {
      if (resolved) return;
      resolved = true;
      document.removeEventListener("__oa_attach_result", handler);
      resolve(!!event.detail?.ok);
    };
    document.addEventListener("__oa_attach_result", handler);

    var dataEl = document.createElement("textarea");
    dataEl.id = "__oa_attach_payload";
    dataEl.style.display = "none";
    dataEl.value = JSON.stringify(
      items.map(function (item) {
        return {
          dataUrl: String(item?.dataUrl || ""),
          name: String(item?.name || "file.bin"),
          type: String(item?.type || "application/octet-stream")
        };
      })
    );
    document.documentElement.appendChild(dataEl);

    var script = document.createElement("script");
    script.textContent = "(" + geminiMainWorldAttach.toString() + ")()";
    document.documentElement.appendChild(script);
    script.remove();

    setTimeout(function () {
      if (!resolved) {
        resolved = true;
        document.removeEventListener("__oa_attach_result", handler);
        try {
          dataEl.remove();
        } catch (_) {
          /* noop */
        }
        resolve(false);
      }
    }, 8000);
  });
}

async function attachFilesGemini(inputEl, files) {
  if (attachByFileInput(files, inputEl)) return true;

  const dropTargets = [
    queryDeepFirst(['.ql-editor', '[role="textbox"]', '[contenteditable="true"]']),
    inputEl,
    document.body
  ].filter(Boolean);
  const seenDrop = new Set();
  for (const target of dropTargets) {
    if (seenDrop.has(target)) continue;
    seenDrop.add(target);
    if (attachByDrop(target, files)) return true;
  }

  inputEl.focus();
  await sleep(80);
  const pasteTargets = [inputEl, document.activeElement, document.body, document].filter(Boolean);
  const seenPaste = new Set();
  for (const target of pasteTargets) {
    if (seenPaste.has(target)) continue;
    seenPaste.add(target);
    if (attachByPaste(target, files)) return true;
  }
  return false;
}

async function attachFiles(inputEl, items, siteId = "") {
  const files = toFiles(items);
  if (!files.length) return false;
  if (siteId === "gemini") {
    return attachFilesGemini(inputEl, files);
  }
  if (attachByFileInput(files, inputEl)) return true;
  if (attachByDrop(inputEl, files)) return true;
  return attachByPasteTargets([inputEl, document.activeElement, document.body].filter(Boolean), files);
}
