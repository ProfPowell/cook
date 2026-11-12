/**
 * @file render.js
 * @description Render a page through a layout and, for a child layout
 * (`data-template="parent"` on its `<html>` or `<body>`), through each
 * parent in turn.
 *
 * Everything here works on source strings, never on a re-serialized DOM,
 * so a layout's markup reaches the output exactly as the author wrote it.
 * Each layer's pieces are split from the RAW layout source and then filled;
 * filled output is never re-scanned. Page content that contains `<main>`,
 * `<template>`, `<template slot>` or `${...}` is therefore only ever a
 * value, never layout structure (the interpolator never rescans inserted
 * values).
 *
 * A layout with no `data-template` and no info block takes an early exit
 * and renders exactly as before.
 */

import { renderTemplate } from '../interpolate/interpolate.js';

export const MAX_DEPTH = 5;

// The exact opening form the old slot regex accepted
const SLOT_OPEN = /<template\s+slot="([^"]+)">/gi;
// Any template open or close tag, for depth counting
const TEMPLATE_TAG = /<(\/?)template(?=[\s>/])[^>]*>/gi;

// A child layout: data-template on <html> or <body> (same test as apply-template)
const TEMPLATED_TAG = /<(html|body)(\s[^>]*data-template="([^"]+)"[^>]*)>/i;

// The info block element: its body never crosses a `</script`, so the
// match ends at the info script's own close tag. Leading indent and the
// trailing line break are captured so a line holding only the block can
// go whole.
const INFO = /([ \t]*)<script\b[^>]*\bdata-layout-info\b[^>]*>(?:(?!<\/script)[\s\S])*<\/script\s*>([ \t]*(?:\r?\n|$))?/gi;
const HAS_INFO = /<script\b[^>]*\bdata-layout-info\b/i;

// A `slot` attribute inside a start tag's attributes, any quoting
const SLOT_ATTR = /(?:^|\s)slot\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i;

/**
 * Thrown for a layout cycle or a chain deeper than MAX_DEPTH. Always a
 * build error, whatever kind of page hit it.
 */
export class LayoutChainError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LayoutChainError';
  }
}

/**
 * Index just past the `</template>` that closes a template opened before
 * `from`, counting nested templates. -1 when it never closes.
 * @param {string} html
 * @param {number} from - Index just after the opening tag
 * @returns {{ innerEnd: number, end: number }|null}
 */
function findClose(html, from) {
  let depth = 1;
  TEMPLATE_TAG.lastIndex = from;
  let m;
  while ((m = TEMPLATE_TAG.exec(html))) {
    if (m[1]) depth--;
    else depth++;
    if (depth === 0) return { innerEnd: m.index, end: TEMPLATE_TAG.lastIndex };
  }
  return null;
}

/**
 * Split top-level `<template slot="x">…</template>` elements out of HTML.
 * Nested `<template>`s inside a slot are kept whole. Without nesting the
 * result is byte-identical to the old non-greedy regex: each slot's inner
 * HTML trimmed, a later slot of the same name winning, and the remaining
 * content trimmed.
 * @param {string} html
 * @returns {{ content: string, slots: Record<string, string> }}
 */
export function extractSlots(html) {
  const slots = {};
  let content = '';
  let pos = 0;

  SLOT_OPEN.lastIndex = 0;
  let open;
  while ((open = SLOT_OPEN.exec(html))) {
    const close = findClose(html, SLOT_OPEN.lastIndex);
    if (!close) continue; // never closed: not a slot, leave it in place
    slots[open[1]] = html.slice(SLOT_OPEN.lastIndex, close.innerEnd).trim();
    content += html.slice(pos, open.index);
    pos = close.end;
    SLOT_OPEN.lastIndex = close.end;
  }
  content += html.slice(pos);

  return { content: content.trim(), slots };
}

/**
 * Remove the info block from layout source.
 * @param {string} html
 * @returns {string}
 */
export function stripInfo(html) {
  if (!HAS_INFO.test(html)) return html;
  return html.replace(INFO, (match, lead, trail, offset) => {
    const atLineStart = offset === 0 || html[offset - 1] === '\n';
    // Alone on its line: the whole line goes
    if (atLineStart && trail !== undefined) return '';
    // Shares the line: only the element goes
    return lead + (trail || '');
  });
}

/**
 * Split a child layout's body into its top-level slot templates and the
 * rest. Any top-level `<template …>` with a `slot` attribute counts, in any
 * attribute order and quoting. Each piece is the WHOLE element (opening tag
 * included) so the conditionals hook can see attributes such as `data-if`.
 * @param {string} html
 * @returns {{ body: string, pieces: Array<{ name: string, element: string }> }}
 */
export function splitChildSlots(html) {
  const pieces = [];
  let body = '';
  let pos = 0;

  TEMPLATE_TAG.lastIndex = 0;
  let m;
  while ((m = TEMPLATE_TAG.exec(html))) {
    if (m[1]) continue; // a stray close tag at top level
    const openEnd = TEMPLATE_TAG.lastIndex;
    const close = findClose(html, openEnd);
    if (!close) break; // never closed: leave the rest as body
    const attrs = m[0].slice('<template'.length, -1);
    const slot = attrs.match(SLOT_ATTR);
    if (slot) {
      const name = (slot[1] ?? slot[2] ?? slot[3]).trim();
      if (name) {
        pieces.push({ name, element: html.slice(m.index, close.end) });
        body += html.slice(pos, m.index);
        pos = close.end;
      }
    }
    // Skip the whole element: templates inside it are not top level
    TEMPLATE_TAG.lastIndex = close.end;
  }
  body += html.slice(pos);

  return { body: body.trim(), pieces };
}

/**
 * The inner HTML of a slot template element, after the conditionals hook
 * has run on it. A hook that removed the element leaves nothing.
 * @param {string} element
 * @returns {string}
 */
function innerOf(element) {
  const open = element.match(/^\s*<template\b[^>]*>/i);
  if (!open) return element;
  const close = element.match(/<\/template\s*>\s*$/i);
  return element.slice(open[0].length, close ? close.index : element.length);
}

/**
 * Split a child layout's raw source into its parts.
 * @param {string} src
 * @returns {{ parent: string, attrs: Record<string,string>, body: string }|null}
 */
function splitChild(src) {
  const tag = src.match(TEMPLATED_TAG);
  if (!tag) return null;

  // data-* attributes on the templated element, data-template excepted
  const attrs = {};
  const attrPattern = /\sdata-(?!template\b)([a-z][a-z0-9-]*)="([^"]*)"/gi;
  let m;
  while ((m = attrPattern.exec(tag[2])) !== null) {
    attrs[m[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = m[2];
  }

  // The body: inside <body> when there is one, else inside <html>
  let body;
  const bodyOpen = src.match(/<body(?:\s[^>]*)?>/i);
  if (bodyOpen) {
    const start = bodyOpen.index + bodyOpen[0].length;
    const end = src.toLowerCase().lastIndexOf('</body');
    body = src.slice(start, end === -1 || end < start ? src.length : end);
  } else {
    const start = tag.index + tag[0].length;
    const end = src.toLowerCase().lastIndexOf('</html');
    body = src.slice(start, end === -1 || end < start ? src.length : end)
      .replace(/<head(?:\s[^>]*)?>[\s\S]*?<\/head\s*>/i, '');
  }

  return { parent: tag[3].trim(), attrs, body: stripInfo(body) };
}

/**
 * Render a page through a layout and its parents.
 * @param {string} name - Layout name
 * @param {Object} pageData - Variables, including `content` and `slot:x` keys
 * @param {Object} opts
 * @property {(name: string) => Promise<string|null>} opts.loadLayout
 * @property {Object} [opts.data] - Site data, passed to `conditionals`
 * @property {(html: string, pageData: Object, data: Object) => string} [opts.conditionals]
 * @property {boolean} [opts.removeUnmatchedSlots=true] - For a plain layout
 *   only (no info block, no parent): remove unfilled `${slot:x}`. Layouts in
 *   the new format always remove them.
 * @returns {Promise<string|null>} null when `name` (or a parent) is not found
 */
export async function renderLayout(name, pageData, opts) {
  return renderChain(name, pageData, opts, []);
}

async function renderChain(name, pageData, opts, chain) {
  const { loadLayout, data = {}, conditionals = (html) => html, removeUnmatchedSlots = true } = opts;

  if (chain.includes(name)) {
    throw new LayoutChainError(`Layout cycle: ${[...chain, name].join(' → ')}`);
  }
  if (chain.length >= MAX_DEPTH) {
    throw new LayoutChainError(`Layout chain too deep (more than ${MAX_DEPTH}): ${[...chain, name].join(' → ')}`);
  }
  chain = [...chain, name];

  // Missing (or empty, as callers have always treated it): not found
  const src = await loadLayout(name);
  if (!src) return null;

  const child = TEMPLATED_TAG.test(src) ? splitChild(src) : null;

  // Base (or plain) layout
  if (!child) {
    // Early exit: a plain layout reached directly renders exactly as before
    const plain = chain.length === 1 && !HAS_INFO.test(src);
    const layout = conditionals(stripInfo(src), pageData, data);
    return renderTemplate(layout, pageData, {
      removeUnmatchedSlots: plain ? removeUnmatchedSlots : true,
    });
  }

  // Child layout: fill each piece of the raw child source, then the parent
  const { body, pieces } = splitChildSlots(child.body);
  const fill = (piece) => renderTemplate(piece, pageData, { removeUnmatchedSlots: true });

  const parentData = {};
  for (const [key, value] of Object.entries(pageData)) {
    if (!key.startsWith('slot:')) parentData[key] = value;
  }
  for (const [key, value] of Object.entries(child.attrs)) {
    parentData[key] = renderTemplate(value, pageData);
  }
  parentData.content = fill(conditionals(body, pageData, data));
  for (const { name: slot, element } of pieces) {
    // The hook sees the whole <template slot …> element, attributes included
    const rendered = fill(innerOf(conditionals(element, pageData, data)).trim());
    if (rendered.trim()) parentData[`slot:${slot}`] = rendered;
    else delete parentData[`slot:${slot}`];
  }

  return renderChain(child.parent, parentData, opts, chain);
}
