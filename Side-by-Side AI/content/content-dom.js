"use strict";

function findFirst(selectors) {
  return queryDeepFirst(selectors) || null;
}

function isVisible(el) {
  if (!el) return false;
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function clickFirstVisible(selectors) {
  const target = queryDeepFirstVisible(selectors);
  if (!target) return false;
  target.click();
  return true;
}

function walkDeep(node, visitor) {
  visitor(node);
  const children = node.children ? Array.from(node.children) : [];
  for (const child of children) {
    walkDeep(child, visitor);
    if (child.shadowRoot) {
      walkDeep(child.shadowRoot, visitor);
    }
  }
}

function queryDeepAll(selectors, root = document) {
  const results = [];
  const seen = new Set();
  walkDeep(root, (node) => {
    if (!node.querySelectorAll) return;
    for (const selector of selectors) {
      const items = Array.from(node.querySelectorAll(selector));
      for (const item of items) {
        if (seen.has(item)) continue;
        seen.add(item);
        results.push(item);
      }
    }
  });
  return results;
}

function queryDeepFirst(selectors, root = document) {
  const all = queryDeepAll(selectors, root);
  return all.length ? all[0] : null;
}

function queryDeepFirstVisible(selectors, root = document) {
  const all = queryDeepAll(selectors, root);
  return all.find(isVisible) || null;
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function clickFirstVisibleSelector(selectors) {
  const target = queryDeepFirstVisible(selectors);
  if (!target || target.disabled) return false;
  target.click();
  return true;
}
