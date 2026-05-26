(function initAskAiTogetherAgentBridge(global) {
  "use strict";

  const BRIDGE_VERSION = "agent-bridge-mvp-v1";

  async function request(payload) {
    if (!global.chrome?.runtime?.sendMessage) {
      throw new Error("ask-ai-together-agent-bridge-runtime-unavailable");
    }
    const response = await global.chrome.runtime.sendMessage({
      type: "OA_AGENT_BRIDGE",
      payload: payload && typeof payload === "object" ? payload : {}
    });
    return response;
  }

  global.AskAiTogetherAgentBridge = Object.freeze({
    version: BRIDGE_VERSION,
    request
  });
})(globalThis);
