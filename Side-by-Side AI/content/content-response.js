"use strict";

function collectTextFromNode(node) {
  return String(node?.innerText || node?.textContent || "")
    .replaceAll(/\r\n?/g, "\n")
    .replaceAll(/\u00a0/g, " ")
    .replaceAll(/\n{3,}/g, "\n\n")
    .trim();
}

function isLikelyReplyNode(node, inputEl, siteId = "") {
  if (!node || node === inputEl || !isVisible(node)) return false;
  if (inputEl && (node === inputEl || node.contains(inputEl) || inputEl.contains(node))) return false;
  if (node.closest?.("textarea, input, nav, header, footer, aside")) return false;

  const assistantRoot = node.closest?.("[data-message-author-role=\"assistant\"]");
  if (assistantRoot) {
    if (inputEl && assistantRoot.contains(inputEl)) return false;
    const text = collectTextFromNode(assistantRoot);
    return text.trim().length >= 1;
  }

  if (node.closest?.("form, [contenteditable=\"true\"]")) return false;
  const text = collectTextFromNode(node);
  if (text.length < 12) return false;
  return true;
}

function extractLatestResponseText() {
  const site = currentSite() || GENERIC_SITE;
  const inputEl = findFirst(site.inputSelectors);
  const selectors = RESPONSE_SELECTORS[site.id] || [];
  const explicitMatches = queryDeepAll(selectors).filter((node) => isLikelyReplyNode(node, inputEl, site.id));
  if (explicitMatches.length) {
    const seen = new Set();
    const roots = [];
    for (const node of explicitMatches) {
      const r = node.closest?.("[data-message-author-role=\"assistant\"]") || node;
      if (seen.has(r)) continue;
      seen.add(r);
      roots.push(r);
    }
    roots.sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      if (ar.bottom !== br.bottom) return ar.bottom - br.bottom;
      return ar.top - br.top;
    });
    return collectTextFromNode(roots[roots.length - 1]);
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

  nodes.sort((a, b) => {
    const ar = a.getBoundingClientRect();
    const br = b.getBoundingClientRect();
    if (ar.bottom !== br.bottom) return ar.bottom - br.bottom;
    return ar.top - br.top;
  });
  return collectTextFromNode(nodes[nodes.length - 1]);
}

function collectReplyNodes(site, inputEl) {
  const selectors = RESPONSE_SELECTORS[site.id] || [];
  const explicitMatches = queryDeepAll(selectors).filter((node) => isLikelyReplyNode(node, inputEl, site.id));
  if (explicitMatches.length) return explicitMatches;

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
  return queryDeepAll(fallbackSelectors).filter((node) => isLikelyReplyNode(node, inputEl, site.id));
}
