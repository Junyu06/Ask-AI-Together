"use strict";

document.addEventListener("DOMContentLoaded", () => {
  void renderQuickFocus("popup-targets");
});

document.getElementById("open-split").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "OA_BG_OPEN_MAIN" });
  window.close();
});

document.getElementById("open-controller").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "OA_BG_OPEN_CONTROLLER" });
  window.close();
});

document.getElementById("open-switcher").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "OA_BG_OPEN_SWITCHER" });
  window.close();
});
