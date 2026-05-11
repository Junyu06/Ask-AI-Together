"use strict";

function collectTextFromNode(node) {
  return String(node?.innerText || node?.textContent || "")
    .replaceAll(/\r\n?/g, "\n")
    .replaceAll(/\u00a0/g, " ")
    .replaceAll(/\n{3,}/g, "\n\n")
    .trim();
}

let lastSubmittedPromptText = "";

const ASSISTANT_MESSAGE_SELECTOR = '[data-message-author-role="assistant"], [data-role="assistant"], [data-testid*="assistant"]';
const USER_MESSAGE_SELECTOR = '[data-message-author-role="user"], [data-role="user"], [data-testid*="user"]';
const CLAUDE_RESPONSE_HEADING_SELECTOR = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  '[role="heading"]',
  "[aria-level]"
];
const CLAUDE_RESPONSE_HEADING_RE = /^Claude responded\b\s*:?\s*/i;

function rememberSubmittedPromptText(text) {
  lastSubmittedPromptText = String(text || "");
}

function normalizeResponseCandidateText(text) {
  return String(text || "")
    .replaceAll(/\r\n?/g, "\n")
    .replaceAll(/\u00a0/g, " ")
    .replaceAll(/\n{3,}/g, "\n\n")
    .trim();
}

function assistantRootForNode(node) {
  return node?.closest?.(ASSISTANT_MESSAGE_SELECTOR) || null;
}

function isLikelyUserNode(node) {
  return Boolean(node?.closest?.(USER_MESSAGE_SELECTOR));
}

function hasDescendantMatching(node, selector) {
  return Boolean(node?.querySelectorAll?.(selector)?.length);
}

function nodeHasClass(node, className) {
  const list = node?.classList;
  return Boolean(list && (typeof list.contains === "function" ? list.contains(className) : list.has?.(className)));
}

function hasClaudeFontMessageSignal(node) {
  return nodeHasClass(node, "font-claude-message")
    || Boolean(node?.closest?.(".font-claude-message"))
    || hasDescendantMatching(node, ".font-claude-message");
}

function hasAssistantMessageSignal(node) {
  return Boolean(assistantRootForNode(node) || hasDescendantMatching(node, ASSISTANT_MESSAGE_SELECTOR));
}

function isClaudeAssistantMessageNode(node) {
  return hasClaudeFontMessageSignal(node) || hasAssistantMessageSignal(node) || hasClaudeResponseHeadingSignal(node);
}

function hasUserMessageSignal(node) {
  return Boolean(isLikelyUserNode(node) || hasDescendantMatching(node, USER_MESSAGE_SELECTOR));
}

function isGrokStatusLine(line) {
  const normalized = String(line || "").trim().replaceAll(/\s+/g, " ");
  if (!normalized || normalized.length > 48) return false;
  return /^(Thought|Thinking|Reasoning|Reasoned)(?:\s+(?:for|about)\s+(?:(?:a|an)\s+)?(?:\d+(?:\.\d+)?\s*)?(?:s|sec|secs|second|seconds|min|mins|minute|minutes))?\.?$/i.test(normalized);
}

function isClaudeResponseHeadingLine(line) {
  return CLAUDE_RESPONSE_HEADING_RE.test(String(line || "").trim());
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isGrokPromptUiText(text) {
  let remaining = normalizeResponseCandidateText(text).toLowerCase().replaceAll(/[.,;:|]/g, " ");
  if (!remaining) return true;
  const labels = ["ask grok", "new chat", "regenerate", "copied", "delete", "attach", "share", "retry", "more", "edit", "copy", "send", "user", "you", "grok"];
  for (const label of labels) {
    remaining = remaining.replaceAll(new RegExp(`(?:^|\\s)${escapeRegExp(label)}(?=\\s|$)`, "g"), " ");
  }
  return remaining.replaceAll(/\s+/g, "") === "";
}

function textContainsSubmittedPrompt(text, prompt) {
  const normalizedText = normalizeResponseCandidateText(text).toLowerCase();
  const normalizedPrompt = normalizeResponseCandidateText(prompt).toLowerCase();
  if (!normalizedPrompt) return false;
  if (normalizedText === normalizedPrompt) return true;
  return normalizedPrompt.length >= 8 && normalizedText.includes(normalizedPrompt);
}

function grokCandidateHasTextBeyondPromptUi(text, prompt) {
  const normalizedPrompt = normalizeResponseCandidateText(prompt).toLowerCase();
  return normalizeResponseCandidateText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .some((line) => {
      const normalizedLine = line.toLowerCase();
      if (normalizedPrompt && normalizedLine.includes(normalizedPrompt)) {
        const remainder = normalizedLine.replaceAll(normalizedPrompt, "").trim();
        return Boolean(remainder) && !isGrokPromptUiText(remainder);
      }
      return !isGrokPromptUiText(line) && !isGrokStatusLine(line);
    });
}

function cleanResponseTextForSite(text, siteId = "") {
  const normalized = normalizeResponseCandidateText(text);
  if (siteId === "claude") {
    return normalized
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => !isClaudeResponseHeadingLine(line))
      .join("\n")
      .replaceAll(/\n{3,}/g, "\n\n")
      .trim();
  }
  if (siteId === "grok") {
    return normalized
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => !isGrokStatusLine(line))
      .join("\n")
      .replaceAll(/\n{3,}/g, "\n\n")
      .trim();
  }
  if (siteId !== "gemini") return normalized;

  return normalized
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return true;
      return !/^(Gemini\s*(說了|说了)|顯示思路|显示思路|Show (thinking|thoughts))$/i.test(line);
    })
    .join("\n")
    .replaceAll(/\n{3,}/g, "\n\n")
    .trim();
}

function candidateTextForNode(node, siteId = "") {
  return cleanResponseTextForSite(collectTextFromNode(node), siteId);
}

function isBlockedClaudeResponseContainer(node, inputEl) {
  if (!node || !isVisible(node)) return true;
  if (inputEl && (node === inputEl || node.contains(inputEl) || inputEl.contains(node))) return true;
  if (node.closest?.("textarea, input, button, nav, header, footer, aside, form, [contenteditable=\"true\"]")) return true;
  if (isLikelyUserNode(node) || hasUserMessageSignal(node)) return true;
  return false;
}

function hasClaudeResponseHeadingSignal(node) {
  if (!node?.querySelectorAll) return false;
  return Array.from(node.querySelectorAll(CLAUDE_RESPONSE_HEADING_SELECTOR.join(","))).some((heading) => {
    return isClaudeResponseHeadingNode(heading, null);
  });
}

function isClaudeResponseHeadingNode(node, inputEl) {
  if (!node || !isVisible(node)) return false;
  if (isBlockedClaudeResponseContainer(node, inputEl)) return false;
  const text = normalizeResponseCandidateText(node.getAttribute?.("aria-label") || collectTextFromNode(node));
  return isClaudeResponseHeadingLine(text);
}

function childElements(node) {
  return Array.from(node?.children || []);
}

function followingElementSiblings(node) {
  const parent = node?.parentElement;
  if (!parent) return [];
  const children = childElements(parent);
  const index = children.indexOf(node);
  return index >= 0 ? children.slice(index + 1) : [];
}

function cleanClaudeResponseCandidateNode(node, inputEl) {
  if (isBlockedClaudeResponseContainer(node, inputEl)) return "";
  const text = candidateTextForNode(node, "claude");
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const uiOnlyLines = new Set(["message actions", "copy", "retry", "edit", "share"]);
  if (lines.length && lines.every((line) => uiOnlyLines.has(line.toLowerCase()))) return "";
  return isClaudeResponseHeadingLine(text) ? "" : text;
}

function textFromClaudeHeadingScope(heading, inputEl) {
  let scope = heading;
  for (let depth = 0; scope && depth < 4; depth += 1, scope = scope.parentElement) {
    const siblingTexts = followingElementSiblings(scope)
      .map((node) => cleanClaudeResponseCandidateNode(node, inputEl))
      .filter(Boolean);
    if (siblingTexts.length) return siblingTexts[0];
  }

  const parentText = cleanClaudeResponseCandidateNode(heading.parentElement, inputEl);
  return parentText;
}

function extractClaudeLatestResponseText(inputEl) {
  const headings = queryDeepAll(CLAUDE_RESPONSE_HEADING_SELECTOR)
    .filter((node) => isClaudeResponseHeadingNode(node, inputEl));
  if (!headings.length) return "";
  sortNodesByScreenPosition(headings);
  for (let index = headings.length - 1; index >= 0; index -= 1) {
    const text = textFromClaudeHeadingScope(headings[index], inputEl);
    if (text) return text;
  }
  return "";
}

function isLikelyReplyNode(node, inputEl, siteId = "") {
  if (!node || node === inputEl || !isVisible(node)) return false;
  if (inputEl && (node === inputEl || node.contains(inputEl) || inputEl.contains(node))) return false;
  if (node.closest?.("textarea, input, button, nav, header, footer, aside")) return false;

  const assistantRoot = assistantRootForNode(node);
  if (assistantRoot) {
    if (inputEl && assistantRoot.contains(inputEl)) return false;
    const text = candidateTextForNode(assistantRoot, siteId);
    return text.length >= 1;
  }

  if (node.closest?.("form, [contenteditable=\"true\"]")) return false;
  if (isLikelyUserNode(node)) return false;
  const text = candidateTextForNode(node, siteId);
  const lastPrompt = normalizeResponseCandidateText(lastSubmittedPromptText);
  if (lastPrompt && text === lastPrompt) return false;
  if (siteId === "grok" && !assistantRootForNode(node)) {
    if (hasUserMessageSignal(node) && !hasAssistantMessageSignal(node)) return false;
    if (textContainsSubmittedPrompt(text, lastPrompt) && !grokCandidateHasTextBeyondPromptUi(text, lastPrompt)) {
      return false;
    }
  }
  if (siteId === "claude" && isClaudeAssistantMessageNode(node) && text.length >= 1) return true;
  if ((siteId === "gemini" || siteId === "grok") && text.length >= 1) return true;
  if (text.length < 12) return false;
  return true;
}

function sortNodesByScreenPosition(nodes) {
  nodes.sort((a, b) => {
    const ar = a.getBoundingClientRect();
    const br = b.getBoundingClientRect();
    if (ar.bottom !== br.bottom) return ar.bottom - br.bottom;
    return ar.top - br.top;
  });
  return nodes;
}

function preferAssistantMarkedMatches(matches, siteId = "") {
  if (siteId !== "grok" && siteId !== "claude") return matches;
  if (siteId === "claude") {
    const fontMessageMatches = matches.filter((node) => hasClaudeFontMessageSignal(node));
    if (fontMessageMatches.length) return fontMessageMatches;
    const assistantSignalMatches = matches.filter((node) => hasAssistantMessageSignal(node));
    return assistantSignalMatches.length ? assistantSignalMatches : matches;
  }
  const assistantMatches = matches.filter((node) => {
    return Boolean(assistantRootForNode(node));
  });
  return assistantMatches.length ? assistantMatches : matches;
}

function latestReplyTextFromMatches(matches, siteId = "") {
  if (!matches.length) return "";
  const seen = new Set();
  const roots = [];
  const candidates = preferAssistantMarkedMatches(matches, siteId);
  for (const node of candidates) {
    const root = assistantRootForNode(node) || node;
    if (seen.has(root)) continue;
    seen.add(root);
    roots.push(root);
  }
  sortNodesByScreenPosition(roots);
  return candidateTextForNode(roots[roots.length - 1], siteId);
}

function extractLatestResponseText() {
  const site = currentSite() || GENERIC_SITE;
  const inputEl = findFirst(site.inputSelectors);
  if (site.id === "claude") {
    const claudeText = extractClaudeLatestResponseText(inputEl);
    if (claudeText) return claudeText;
  }
  const selectors = RESPONSE_SELECTORS[site.id] || [];
  const explicitMatches = queryDeepAll(selectors).filter((node) => isLikelyReplyNode(node, inputEl, site.id));
  if (explicitMatches.length) {
    return latestReplyTextFromMatches(explicitMatches, site.id);
  }

  const fallbackSelectors = [
    '[data-message-author-role="assistant"]',
    '[data-role="assistant"]',
    '[data-testid*="assistant"]',
    "article",
    ".markdown",
    ".markdown-body",
    ".prose",
    '[role="article"]'
  ];
  const nodes = queryDeepAll(fallbackSelectors).filter((node) => isLikelyReplyNode(node, inputEl, site.id));
  if (!nodes.length) return "";

  return latestReplyTextFromMatches(nodes, site.id);
}

function collectReplyNodes(site, inputEl) {
  if (site.id === "claude") {
    const claudeHeadingMatches = queryDeepAll(CLAUDE_RESPONSE_HEADING_SELECTOR)
      .filter((node) => isClaudeResponseHeadingNode(node, inputEl))
      .map((heading) => {
        let scope = heading;
        for (let depth = 0; scope && depth < 4; depth += 1, scope = scope.parentElement) {
          const match = followingElementSiblings(scope).find((node) => cleanClaudeResponseCandidateNode(node, inputEl));
          if (match) return match;
        }
        return heading.parentElement;
      })
      .filter(Boolean);
    if (claudeHeadingMatches.length) return claudeHeadingMatches;
  }

  const selectors = RESPONSE_SELECTORS[site.id] || [];
  const explicitMatches = queryDeepAll(selectors).filter((node) => isLikelyReplyNode(node, inputEl, site.id));
  if (explicitMatches.length) return preferAssistantMarkedMatches(explicitMatches, site.id);

  const fallbackSelectors = [
    '[data-message-author-role="assistant"]',
    '[data-role="assistant"]',
    '[data-testid*="assistant"]',
    "article",
    ".markdown",
    ".markdown-body",
    ".prose",
    '[role="article"]'
  ];
  const fallbackMatches = queryDeepAll(fallbackSelectors).filter((node) => isLikelyReplyNode(node, inputEl, site.id));
  return preferAssistantMarkedMatches(fallbackMatches, site.id);
}
