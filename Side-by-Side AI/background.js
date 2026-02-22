const MAIN_PAGE = "index.html";

function openMainPage() {
  chrome.tabs.create({ url: chrome.runtime.getURL(MAIN_PAGE) });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.declarativeNetRequest.updateDynamicRules(
    {
      removeRuleIds: [9001],
      addRules: [
        {
          id: 9001,
          priority: 1,
          action: {
            type: "modifyHeaders",
            responseHeaders: [
              { header: "x-frame-options", operation: "remove" },
              { header: "frame-options", operation: "remove" },
              { header: "content-security-policy", operation: "remove" },
              { header: "content-security-policy-report-only", operation: "remove" }
            ]
          },
          condition: {
            urlFilter: "*",
            resourceTypes: ["main_frame", "sub_frame"]
          }
        }
      ]
    },
    () => void chrome.runtime.lastError
  );
});

chrome.action.onClicked.addListener(() => {
  openMainPage();
});
