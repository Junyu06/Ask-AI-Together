document.getElementById("open-split").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "OA_BG_OPEN_MAIN" });
  window.close();
});

document.getElementById("open-controller").addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "OA_BG_OPEN_CONTROLLER" });
  window.close();
});
