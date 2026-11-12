/**
 * @file parse.js
 * @description Parse a layout's source into a DOM, decide its kind
 * (base, child or fragment), read its info block, and map elements back
 * to source line numbers.
 */

import { parseHTML } from 'linkedom';

const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title']);

// Comments, doctype-like declarations, and start tags (name captured)
const TOKEN = /<!--[\s\S]*?(?:-->|$)|<![^>]*>|<([a-zA-Z][a-zA-Z0-9-]*)/g;

/**
 * Collect every start tag in the source, in order, grouped by tag name.
 * Comments and the raw text of script/style are skipped.
 * @param {string} html
 * @returns {Map<string, number[]>} tag name → source lines, in order
 */
function scanStartTags(html) {
  const tags = new Map();
  let line = 1;
  let counted = 0;
  const lineAt = (offset) => {
    for (; counted < offset; counted++) if (html.charCodeAt(counted) === 10) line++;
    return line;
  };

  TOKEN.lastIndex = 0;
  let match;
  while ((match = TOKEN.exec(html))) {
    if (!match[1]) continue;
    const name = match[1].toLowerCase();
    if (!tags.has(name)) tags.set(name, []);
    tags.get(name).push(lineAt(match.index));

    if (RAW_TEXT.has(name)) {
      const close = html.toLowerCase().indexOf(`</${name}`, TOKEN.lastIndex);
      TOKEN.lastIndex = close === -1 ? html.length : close;
    }
  }
  return tags;
}

/**
 * Child nodes of an element, looking through `<template>` to its content.
 * @param {Element} el
 * @returns {Node[]}
 */
export function childrenOf(el) {
  const holder = el.tagName === 'TEMPLATE' && el.content ? el.content : el;
  return Array.from(holder.childNodes);
}

/**
 * Pair each element, in document order, with the next unused start tag of
 * the same name. Elements the parser implied take their parent's line.
 * @param {Element} root
 * @param {Map<string, number[]>} tags
 * @returns {WeakMap<Element, number>}
 */
function mapLines(root, tags) {
  const lines = new WeakMap();
  const used = new Map();
  const visit = (el, parentLine) => {
    const name = el.tagName.toLowerCase();
    const queue = tags.get(name) || [];
    const next = used.get(name) || 0;
    let line = parentLine;
    if (next < queue.length) {
      line = queue[next];
      used.set(name, next + 1);
    }
    lines.set(el, line);
    for (const node of childrenOf(el)) {
      if (node.nodeType === 1) visit(node, line);
    }
  };
  visit(root, 1);
  return lines;
}

/**
 * Parse layout source.
 * @param {string} html
 * @param {Object} [opts]
 * @property {boolean} [opts.fragment=false] - Treat the source as a fragment
 * @returns {{ document: Document, kind: 'base'|'child'|'fragment', info: Object|null,
 *   infoError: string|null, parent: string|null, lineOf: (el: Element) => number }}
 */
export function parseLayoutSource(html, { fragment = false } = {}) {
  let kind = 'fragment';
  let document;

  if (!fragment) {
    ({ document } = parseHTML(html));
    const top = document.documentElement;
    const templated = [top, document.body].find(el => el && el.hasAttribute('data-template'));
    if (templated) kind = 'child';
    else if (/<!doctype|<html[\s>]|<head[\s>]/i.test(html)) kind = 'base';
  }

  if (kind === 'fragment') {
    ({ document } = parseHTML(`<!doctype html><html><head></head><body>${html}</body></html>`));
  } else if (kind === 'child' && document.documentElement.tagName !== 'HTML') {
    // A bare `<body data-template>` parses with <body> as the root and a
    // detached document.body; wrap it so document.body is the real one.
    ({ document } = parseHTML(`<!doctype html><html><head></head>${html}</html>`));
  }

  let parent = null;
  if (kind === 'child') {
    const templated = [document.documentElement, document.body].find(el => el && el.hasAttribute('data-template'));
    parent = templated.getAttribute('data-template').trim() || null;
  }

  let info = null;
  let infoError = null;
  const script = document.querySelector('script[data-layout-info]');
  if (script) {
    try {
      info = JSON.parse(script.textContent);
    } catch (err) {
      infoError = err.message;
    }
  }

  const lines = mapLines(document.documentElement, scanStartTags(html));
  const lineOf = (el) => lines.get(el) ?? 1;

  return { document, kind, info, infoError, parent, lineOf };
}
