/**
 * @file tree.js
 * @description Parse a correct format-1 layout (or include fragment) into a
 * layout tree: plain JSON that an editor can change and `serializeLayout`
 * can write back. Only layouts that `checkLayout` passes get a tree; the
 * walk follows the checker's classification block by block.
 *
 * What the tree keeps exactly as written comes from the raw source, not the
 * DOM: a component's inner HTML, a picture's sources, and the text of inline
 * scripts and styles. Comments become comment blocks where a block may
 * stand. A correct layout holding something the tree has no place for (a
 * comment in <head>, a comment inside a text block, …) is refused with a
 * problem rather than opened with that part lost.
 */

import { parseLayoutSource, childrenOf } from './parse.js';
import {
  checkLayout, PLACEHOLDER, SLOT_KEY, REPEAT, tagOf, isIncludeElement,
} from './check.js';
import {
  TEXT_ELEMENTS, INLINE_ELEMENTS, CONTAINER_ELEMENTS, LAYOUT_WRAPPERS, MENU_ELEMENTS,
  LAYOUT_ELEMENTS,
} from './vocabulary.js';
import { findTemplatedTag, templateDataAttrs } from './render.js';

const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title']);
// Comments, declarations, and start/end tags whose attributes may quote `>`
const TOKEN = /<!--[\s\S]*?(?:-->|$)|<![^>]*>|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)(?:"[^"]*"|'[^']*'|[^>"'])*>/g;
const FRAGMENT_MARKER = /^\s*<!--\s*layout-fragment\s*-->/;
const MARKER_TEXT = /^\s*layout-fragment\s*$/;
const SPACE = /[ \t\n\r\f]+/g;

const BLOCK_ATTRS = ['data-repeat', 'data-if', 'data-unless'];

// SOURCE OFFSETS
// -----------------------------
/**
 * Every start and end tag in the source, in order. Comments and the raw
 * text of script, style, textarea and title are skipped.
 * @param {string} html
 * @returns {Array<{ name: string, close: boolean, start: number, end: number }>}
 */
function scanTags(html) {
  const lower = html.toLowerCase();
  const tags = [];
  TOKEN.lastIndex = 0;
  let m;
  while ((m = TOKEN.exec(html))) {
    if (!m[2]) continue;
    const name = m[2].toLowerCase();
    const close = m[1] === '/';
    tags.push({ name, close, start: m.index, end: TOKEN.lastIndex });
    if (!close && RAW_TEXT.has(name)) {
      const at = lower.indexOf(`</${name}`, TOKEN.lastIndex);
      TOKEN.lastIndex = at === -1 ? html.length : at;
    }
  }
  return tags;
}

/**
 * Pair each element, in document order, with the next unused start tag of
 * the same name (as parse.js does for lines), so an element's raw inner
 * HTML can be sliced from the source.
 * @param {string} html
 * @param {Element} root
 * @returns {(el: Element) => string|null} the raw inner source, or null
 */
function rawInner(html, root) {
  const tags = scanTags(html);
  const starts = new Map();
  tags.forEach((tag, i) => {
    if (tag.close) return;
    if (!starts.has(tag.name)) starts.set(tag.name, []);
    starts.get(tag.name).push(i);
  });

  const index = new WeakMap();
  const used = new Map();
  const visit = (el) => {
    const name = tagOf(el);
    const queue = starts.get(name) || [];
    const next = used.get(name) || 0;
    if (next < queue.length) {
      index.set(el, queue[next]);
      used.set(name, next + 1);
    }
    for (const node of childrenOf(el)) if (node.nodeType === 1) visit(node);
  };
  visit(root);

  return (el) => {
    const i = index.get(el);
    if (i === undefined) return null;
    const open = tags[i];
    let depth = 1;
    for (let j = i + 1; j < tags.length; j++) {
      if (tags[j].name !== open.name) continue;
      depth += tags[j].close ? -1 : 1;
      if (depth === 0) return html.slice(open.end, tags[j].start);
    }
    return null;
  };
}

// HELPERS
// -----------------------------
const attrList = (el, skip = []) => Array.from(el.attributes)
  .filter(a => !skip.includes(a.name.toLowerCase()))
  .map(a => [a.name, a.value]);

/**
 * Read a data-repeat expression the way the checker does.
 * @param {string} expr
 * @returns {{ source: string, pipes: string[], alias: string, index?: string }}
 */
function parseRepeat(expr) {
  const match = expr.trim().match(REPEAT);
  const [source, ...pipes] = match[1].split('|').map(p => p.trim());
  const repeat = { source, pipes, alias: match[2] };
  if (match[3]) repeat.index = match[3];
  return repeat;
}

/** Conditions on an element: `{ if?, unless? }`. */
function conditions(el) {
  const out = {};
  if (el.hasAttribute('data-if')) out.if = el.getAttribute('data-if');
  if (el.hasAttribute('data-unless')) out.unless = el.getAttribute('data-unless');
  return out;
}

/**
 * Text with fields: split into `{ text }` and `{ field }` runs, whitespace
 * collapsed.
 * @param {string} text - decoded text
 * @returns {Array<{ text: string }|{ field: string }>}
 */
function textRuns(text) {
  const runs = [];
  let pos = 0;
  for (const match of text.matchAll(PLACEHOLDER)) {
    if (match.index > pos) runs.push({ text: text.slice(pos, match.index).replace(SPACE, ' ') });
    runs.push({ field: match[1].trim() });
    pos = match.index + match[0].length;
  }
  if (pos < text.length) runs.push({ text: text.slice(pos).replace(SPACE, ' ') });
  return runs;
}

/** Merge adjacent text runs; trim the outer edges of a whole run list. */
function tidyRuns(runs, { trim }) {
  const out = [];
  for (const run of runs) {
    const last = out.at(-1);
    if ('text' in run && last && 'text' in last) last.text += run.text;
    else out.push(run);
  }
  if (trim) {
    const first = out[0];
    if (first && 'text' in first) first.text = first.text.replace(/^ /, '');
    const last = out.at(-1);
    if (last && 'text' in last) last.text = last.text.replace(/ $/, '');
  }
  return out.filter(run => !('text' in run) || run.text !== '');
}

// BUILDER
// -----------------------------
class TreeBuilder {
  constructor(html, parsed) {
    this.html = html;
    this.parsed = parsed;
    this.document = parsed.document;
    this.inner = rawInner(html, this.document.documentElement);
    this.problems = [];
    this.keptComments = new Set();
    this.rawElements = new Set();
  }

  refuse(el, message) {
    this.problems.push({ line: this.parsed.lineOf(el), message });
  }

  raw(el) {
    this.rawElements.add(el);
    const inner = this.inner(el);
    return inner ?? el.innerHTML;
  }

  build() {
    const { kind } = this.parsed;
    const tree = {
      kind,
      info: this.info(),
      parent: kind === 'child' ? this.parsed.parent : null,
      vars: [],
      pageLayout: null,
      htmlAttrs: [],
      head: [],
      body: [],
      slots: [],
    };
    if (kind === 'base') this.base(tree);
    else if (kind === 'child') this.child(tree);
    else tree.body = this.blocks(this.document.body, { skipMarker: FRAGMENT_MARKER.test(this.html) });
    this.sweepComments();
    return tree;
  }

  info() {
    const raw = this.parsed.info;
    if (!raw) return null;
    const { format, label, description, abstract, slots, ...rest } = raw;
    const info = { format, label: label ?? '' };
    if (description !== undefined) info.description = description;
    if (abstract !== undefined) info.abstract = abstract;
    info.slots = slots ?? {};
    return Object.assign(info, rest);
  }

  // ROOTS
  // -----------------------------
  base(tree) {
    const { documentElement, head, body } = this.document;
    tree.htmlAttrs = attrList(documentElement);
    if (head && head.attributes.length) this.refuse(head, `<head> attributes can't be edited here (${head.attributes[0].name})`);
    tree.head = head ? this.headItems(head) : [];

    if (body.hasAttribute('data-page-layout')) tree.pageLayout = body.getAttribute('data-page-layout');
    const extra = attrList(body, ['data-page-layout']);
    if (extra.length) this.refuse(body, `<body> attributes besides data-page-layout can't be edited here (${extra.map(a => a[0]).join(', ')})`);

    tree.body = this.blocks(body, { region: true });
  }

  child(tree) {
    const { documentElement, body } = this.document;
    const templated = documentElement.hasAttribute('data-template') ? documentElement : body;

    // The body's variables, read as render.js reads them
    const tag = findTemplatedTag(this.html);
    const vars = tag
      ? Object.entries(templateDataAttrs(tag.attrs))
      : attrList(templated, ['data-template']).filter(([name]) => /^data-/.test(name))
        .map(([name, value]) => [name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase()), value]);
    const pageLayout = vars.find(([name]) => name === 'pageLayout');
    tree.pageLayout = pageLayout ? pageLayout[1] : null;
    tree.vars = vars.filter(([name]) => name !== 'pageLayout');

    for (const node of childrenOf(body)) {
      if (node.nodeType === 1 && tagOf(node) === 'template') tree.slots.push(this.slotTemplate(node));
    }
    tree.body = this.blocks(body, { skipTemplates: true });
  }

  slotTemplate(template) {
    const slot = {
      name: template.getAttribute('slot').trim(),
      attrs: attrList(template, ['slot', 'data-if', 'data-unless']),
      ...conditions(template),
    };
    slot.body = slot.name === 'head' ? this.headItems(template, { slotHead: true }) : this.blocks(template);
    return slot;
  }

  // HEAD
  // -----------------------------
  headItems(parent, { slotHead = false } = {}) {
    const items = [];
    for (const node of childrenOf(parent)) {
      if (node.nodeType === 3) {
        if (!slotHead && node.textContent.trim() === '${slot:head}') items.push({ slot: 'head' });
        continue;
      }
      if (node.nodeType !== 1 || node.hasAttribute('data-layout-info')) continue;
      items.push(this.headItem(node));
    }
    return items;
  }

  headItem(el) {
    const tag = tagOf(el);
    const item = { tag, attrs: attrList(el, ['data-if', 'data-unless']), ...conditions(el) };
    if (tag === 'title') item.text = el.textContent;
    else if (tag === 'script' || tag === 'style') item.text = this.raw(el);
    return item;
  }

  // BLOCKS
  // -----------------------------
  /**
   * The blocks inside a block container. Placeholders in text become
   * content and slot blocks; comments become comment blocks.
   */
  blocks(parent, { region = false, skipTemplates = false, skipMarker = false } = {}) {
    const out = [];
    let first = true;
    for (const node of childrenOf(parent)) {
      if (node.nodeType === 3) {
        for (const match of node.textContent.matchAll(PLACEHOLDER)) {
          const key = match[1].trim();
          const slot = key.match(SLOT_KEY);
          if (key === 'content') out.push({ type: 'content', attrs: [] });
          else if (slot) out.push({ type: 'slot', name: slot[1], attrs: [] });
        }
        if (node.textContent.trim()) first = false;
        continue;
      }
      if (node.nodeType === 8) {
        this.keptComments.add(node);
        if (!(skipMarker && first && MARKER_TEXT.test(node.data))) {
          out.push({ type: 'comment', attrs: [], text: node.data });
        }
        first = false;
        continue;
      }
      first = false;
      if (node.nodeType !== 1) continue;
      if (node.hasAttribute('data-layout-info') && tagOf(node) === 'script') continue;
      if (skipTemplates && tagOf(node) === 'template') continue;
      if (region && tagOf(node) === 'main') out.push(this.container(node));
      else out.push(this.block(node));
    }
    return out;
  }

  /** Common fields: attributes (block attributes excepted), conditions, repeat. */
  common(el, skip = []) {
    const out = { attrs: attrList(el, [...BLOCK_ATTRS, ...skip]), ...conditions(el) };
    if (el.hasAttribute('data-repeat')) out.repeat = parseRepeat(el.getAttribute('data-repeat'));
    return out;
  }

  block(el) {
    const name = tagOf(el);
    if (name.includes('-')) {
      if (LAYOUT_ELEMENTS.includes(name)) return this.container(el);
      return { type: 'component', tag: name, ...this.common(el), html: this.raw(el) };
    }
    if (isIncludeElement(el)) {
      return { type: 'include', path: el.getAttribute('data-include'), ...this.common(el, ['data-include']) };
    }
    if (MENU_ELEMENTS.includes(name)) return this.menu(el);
    if (TEXT_ELEMENTS.includes(name)) {
      return { type: 'text', tag: name, ...this.common(el), inline: this.inline(el, true) };
    }
    if (name === 'img') return { type: 'image', tag: 'img', ...this.common(el) };
    if (name === 'picture') return { type: 'image', tag: 'picture', ...this.common(el), html: this.raw(el) };
    // figure, sectioning, header/footer, div[data-layout]
    return this.container(el);
  }

  container(el) {
    return { type: 'container', tag: tagOf(el), ...this.common(el), body: this.blocks(el) };
  }

  menu(el) {
    const items = [];
    for (const node of childrenOf(el)) {
      if (node.nodeType === 1) items.push(this.item(node));
    }
    return { type: 'menu', tag: tagOf(el), ...this.common(el), items };
  }

  /** An `li`: text-level content, or blocks, never both. */
  item(li) {
    const item = this.common(li);
    let text = false;
    let blocks = false;
    for (const node of childrenOf(li)) {
      if (node.nodeType === 3 && node.textContent.trim()) text = true;
      else if (node.nodeType === 1 && INLINE_ELEMENTS.includes(tagOf(node))) text = true;
      else if (node.nodeType === 1) blocks = true;
    }
    if (text && blocks) {
      this.refuse(li, 'an <li> that mixes text and blocks can\'t be edited here (wrap the text in a <p>, or move the blocks out)');
      item.inline = [];
    } else if (blocks) {
      item.body = this.blocks(li);
    } else {
      item.inline = this.inline(li, true);
    }
    return item;
  }

  // INLINE
  // -----------------------------
  inline(el, top = false) {
    const runs = [];
    for (const node of childrenOf(el)) {
      if (node.nodeType === 3) runs.push(...textRuns(node.textContent));
      else if (node.nodeType !== 1) continue; // comments: reported by the sweep
      else if (INLINE_ELEMENTS.includes(tagOf(node))) {
        const tag = tagOf(node);
        if (tag === 'br' || tag === 'img') runs.push({ tag, attrs: attrList(node) });
        else runs.push({ tag, attrs: attrList(node), inline: this.inline(node) });
      } else {
        this.rawElements.add(node);
        this.refuse(node, `a component (<${tagOf(node)}>) inside text can't be edited here; make it its own block`);
      }
    }
    return tidyRuns(runs, { trim: top });
  }

  // COMMENTS
  // -----------------------------
  /** Refuse any comment the tree didn't keep (outside raw-kept elements). */
  sweepComments() {
    const visit = (parent, owner) => {
      const holder = parent.nodeType === 1 ? childrenOf(parent) : Array.from(parent.childNodes);
      for (const node of holder) {
        if (node.nodeType === 8 && !this.keptComments.has(node)) {
          this.refuse(owner, `a comment here can't be kept by the layout editor (<!--${node.data.slice(0, 30)}-->); move it between blocks or remove it`);
        } else if (node.nodeType === 1 && !this.rawElements.has(node)) {
          visit(node, node);
        }
      }
    };
    visit(this.document, this.document.documentElement);
  }
}

/**
 * Parse a format-1 layout or include fragment into a layout tree.
 * @param {string} html - The layout's source
 * @param {Object} [opts]
 * @property {boolean} [opts.fragment=false] - Parse the source as an include fragment
 * @property {string[]} [opts.fields=[]] - Extra known field names (see checkLayout)
 * @property {string[]} [opts.lists=[]] - Extra list-source roots (see checkLayout)
 * @returns {{ ok: boolean, tree: Object|null, problems: Array<{ line: number, message: string }> }}
 *   `tree` only when the layout passes checkLayout and the tree can hold all of it
 */
export function parseLayout(html, { fragment = false, fields = [], lists = [] } = {}) {
  const check = checkLayout(html, { fragment, fields, lists });
  if (!check.ok) return { ok: false, tree: null, problems: check.problems };

  const builder = new TreeBuilder(html, parseLayoutSource(html, { fragment }));
  const tree = builder.build();
  if (builder.problems.length) {
    return { ok: false, tree: null, problems: builder.problems.sort((a, b) => a.line - b.line) };
  }
  return { ok: true, tree, problems: [] };
}
