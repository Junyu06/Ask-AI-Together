"use strict";

document.addEventListener("DOMContentLoaded", () => {
  void renderQuickFocus("switcher-targets");
});

document.getElementById("switcher-refresh").addEventListener("click", () => {
  void renderQuickFocus("switcher-targets");
});

document.getElementById("switcher-open-controller").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "OA_BG_OPEN_CONTROLLER" });
});
