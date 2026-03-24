"use strict";

/**
 * Document Picture-in-Picture：优先用 location 导航到扩展页（iframe 在 PiP 里常空白）。
 * 失败时再回退到 iframe。
 */
async function openSwitcherAsDocumentPictureInPicture() {
  if (!documentPictureInPicture?.requestWindow) {
    throw new Error("当前 Chrome 不支持 Document Picture-in-Picture（需较新版本）");
  }
  const pip = await documentPictureInPicture.requestWindow({ width: 980, height: 280 });
  const url = `${chrome.runtime.getURL("ui/switcher/switcher.html")}?pip=1`;

  try {
    if (pip.location && typeof pip.location.assign === "function") {
      pip.location.assign(url);
      return;
    }
  } catch (_e) {
    /* 部分环境禁止对 PiP 窗口 assign chrome-extension URL，走 iframe */
  }

  const iframe = pip.document.createElement("iframe");
  iframe.src = url;
  iframe.setAttribute("allow", "clipboard-read; clipboard-write");
  Object.assign(iframe.style, { width: "100%", height: "100%", border: "none", display: "block" });
  pip.document.body.style.margin = "0";
  pip.document.documentElement.style.height = "100%";
  pip.document.body.style.minHeight = "100vh";
  pip.document.body.appendChild(iframe);
}
