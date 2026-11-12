/**
 * @file check.js
 * @description The format-1 layout checker. Says whether a layout (or an
 * include fragment) is correct, why not (with line numbers), and what it
 * offers: its slots, fields and parent.
 */

import { parseLayoutSource, childrenOf } from './parse.js';
import {
  FORMAT, PAGE_LAYOUTS, DOCUMENT_FIELDS, HEAD_ELEMENTS, HEAD_SLOT_ELEMENTS,
  TEXT_ELEMENTS, INLINE_ELEMENTS, CONTAINER_ELEMENTS, LAYOUT_WRAPPERS, MENU_ELEMENTS,
  LAYOUT_ELEMENTS, BODY_REGIONS, ELEMENT_ATTRS, isGlobalAttr,
} from './vocabulary.js';

// `${…}` placeholders, including `${{…}}` so expressions are caught
const PLACEHOLDER = /\$\{([^}]*)\}/g;
const PLAIN_KEY = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/;
const SLOT_KEY = /^slot:([\w-]+)$/;
// "source | pipe:arg as item[, index]" (same grammar as repeat-collection)
const REPEAT = /^(.+?)\s+as\s+(\w+)(?:\s*,\s*(\w+))?$/;
const PIPE = /^(limit|offset)\s*:\s*\d+$/;
const PAGE_LAYOUT_FIELD = '${pageLayout}';

const tagOf = (el) => el.tagName.toLowerCase();
const isBlank = (node) => node.nodeType === 8 || (node.nodeType === 3 && !node.textContent.trim());

/**
 * Best-effort scan for slots and fields, used for every layout (plain or
 * not) so callers can offer regions for any layout.
 * @param {string} html
 * @returns {{ slots: string[], fields: string[] }}
 */
function scanSource(html) {
  const source = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');

  const aliases = new Set();
  for (const [, , expr] of source.matchAll(/data-repeat\s*=\s*(["'])(.*?)\1/g)) {
    const match = expr.trim().match(REPEAT);
    if (match) [match[2], match[3]].filter(Boolean).forEach(a => aliases.add(a));
  }

  const slots = new Set();
  const fields = new Set();
  for (const [, raw] of source.matchAll(PLACEHOLDER)) {
    const key = raw.trim();
    const slot = key.match(SLOT_KEY);
    if (slot) {
      if (slot[1] !== 'head') slots.add(slot[1]);
    } else if (key !== 'content' && PLAIN_KEY.test(key) && !aliases.has(key.split('.')[0])) {
      fields.add(key);
    }
  }
  return { slots: [...slots], fields: [...fields] };
}

class Checker {
  constructor(html, parsed, { fields, lists }) {
    this.html = html;
    this.repeatRead = new WeakSet();
    this.parsed = parsed;
    this.document = parsed.document;
    this.kind = parsed.kind;
    this.known = new Set([...DOCUMENT_FIELDS, ...fields]);
    this.listRoots = new Set(lists);
    this.problems = [];
    this.slotUses = new Map();
    this.contents = [];
    this.declaredSlots = null;
    this.lineStarts = [0];
    for (let i = 0; i < html.length; i++) if (html.charCodeAt(i) === 10) this.lineStarts.push(i + 1);
  }

  // REPORTING
  // -----------------------------
  problem(el, message) {
    this.problems.push({ line: this.parsed.lineOf(el), message });
  }

  /** Report at the first occurrence of `needle` at or after el's line. */
  problemAt(el, needle, message) {
    const elLine = this.parsed.lineOf(el);
    const index = this.html.indexOf(needle, this.lineStarts[elLine - 1] ?? 0);
    let line = elLine;
    if (index !== -1) {
      line = this.lineStarts.findLastIndex(start => start <= index) + 1;
    }
    this.problems.push({ line, message });
  }

  // ENTRY
  // -----------------------------
  run() {
    const script = this.checkInfo();
    if (this.kind === 'base') this.checkBase(script);
    else if (this.kind === 'child') this.checkChild(script);
    else this.checkFragment();
    this.checkContent();
    this.checkSlotDeclarations(script);
    this.problems.sort((a, b) => a.line - b.line);
  }

  // INFO BLOCK
  // -----------------------------
  checkInfo() {
    const scripts = Array.from(this.document.querySelectorAll('script[data-layout-info]'));
    const [script, ...extra] = scripts;
    for (const other of extra) this.problem(other, 'a layout has only one info block');
    if (!script) return null;

    const { info, infoError } = this.parsed;
    if (script.getAttribute('type') !== 'application/json') {
      this.problem(script, 'the info block needs type="application/json"');
    }
    if (infoError) {
      this.problem(script, `the info block isn't valid JSON (${infoError})`);
      return script;
    }
    if (!info || typeof info !== 'object' || Array.isArray(info)) {
      this.problem(script, 'the info block must be a JSON object');
      return script;
    }
    if (info.format !== FORMAT) {
      this.problem(script, `the info block says format ${JSON.stringify(info.format)}; this Cook reads format ${FORMAT}`);
      return script;
    }
    const slots = info.slots ?? {};
    if (!slots || typeof slots !== 'object' || Array.isArray(slots)) {
      this.problem(script, 'the info block\'s "slots" must be an object');
      return script;
    }
    this.declaredSlots = new Set(Object.keys(slots));
    return script;
  }

  checkSlotDeclarations(script) {
    if (!this.declaredSlots) return;
    for (const [name, el] of this.slotUses) {
      if (!this.declaredSlots.has(name)) {
        this.problemAt(el, `\${slot:${name}}`, `slot "${name}" is used but not declared in the info block's "slots"`);
      }
    }
    for (const name of this.declaredSlots) {
      if (!this.slotUses.has(name)) {
        this.problem(script, `slot "${name}" is declared in the info block but the layout never uses \${slot:${name}}`);
      }
    }
  }

  checkContent() {
    if (this.kind === 'fragment') return;
    const where = this.kind === 'base' ? 'inside <main>' : 'in the child <body>';
    if (this.contents.length === 0) {
      this.problem(this.document.body, `the layout has no \${content} (it needs exactly one, ${where})`);
    }
    for (const { el } of this.contents.slice(1)) {
      this.problemAt(el, '${content}', '${content} appears more than once (a layout has exactly one)');
    }
  }

  // BASE
  // -----------------------------
  checkBase(script) {
    const { head, body } = this.document;
    if (script && script.parentNode !== head) {
      this.problem(script, 'in a base layout the info block goes in <head>');
    }
    this.checkAnyAttrs(this.document.documentElement, this.rootCtx());
    if (head) this.checkHead(head);

    const ctx = this.rootCtx();
    this.checkPageLayout(body, true);
    this.checkAnyAttrs(body, ctx, ['data-page-layout']);

    const counts = { main: 0, nav: 0 };
    for (const node of childrenOf(body)) {
      if (node.nodeType !== 1) {
        this.blockText(node, body, ctx);
        continue;
      }
      const name = tagOf(node);
      if (node === script) continue;
      if (this.isInclude(node)) {
        this.include(node, ctx);
      } else if (BODY_REGIONS.includes(name)) {
        if (name in counts) counts[name]++;
        this.container(node, { ...ctx, inMain: name === 'main' }, { repeat: false });
      } else {
        this.problem(node, `<${name}> can't be a direct child of <body> (use header, nav, main, aside, footer or an include)`);
      }
    }
    if (counts.main !== 1) {
      this.problem(body, `a base layout needs exactly one <main> in <body> (found ${counts.main})`);
    }
    if (counts.nav > 2) {
      this.problem(body, `a base layout has at most two <nav> in <body> (found ${counts.nav})`);
    }
  }

  checkHead(head) {
    const ctx = this.rootCtx();
    let slotText = null;
    for (const node of childrenOf(head)) {
      if (node.nodeType === 8) continue;
      if (node.nodeType === 3) {
        const text = node.textContent.trim();
        if (!text) continue;
        if (text === '${slot:head}' && !slotText) {
          slotText = node;
          this.useSlot('head', head);
        } else {
          this.problemAt(head, text, `text isn't allowed in <head> ("${text.slice(0, 40)}")`);
        }
        continue;
      }
      const name = tagOf(node);
      if (slotText) {
        this.problem(node, '${slot:head} must be the last thing in <head>');
        slotText = false;
      }
      if (!HEAD_ELEMENTS.includes(name)) {
        this.problem(node, `<${name}> isn't allowed in <head> (use meta, link, title, script, style or base)`);
        continue;
      }
      this.checkAnyAttrs(node, ctx);
      if (name === 'title') this.fieldText(node.textContent, node, ctx);
    }
  }

  checkPageLayout(body, allowField) {
    if (!body.hasAttribute('data-page-layout')) return;
    const value = body.getAttribute('data-page-layout').trim();
    if (PAGE_LAYOUTS.includes(value) || (allowField && value === PAGE_LAYOUT_FIELD)) return;
    const choices = PAGE_LAYOUTS.filter(Boolean).join(', ');
    this.problem(body, `data-page-layout="${value}" isn't a VB page layout (use ${choices}${allowField ? ' or ${pageLayout}' : ''})`);
  }

  // CHILD
  // -----------------------------
  checkChild(script) {
    const { body, documentElement } = this.document;
    if (tagOf(documentElement) === 'html') {
      this.checkAnyAttrs(documentElement, this.rootCtx());
      const head = this.document.head;
      for (const node of head ? childrenOf(head) : []) {
        if (node.nodeType === 1) {
          this.problem(node, 'a child layout has no <head>; fill the head slot with <template slot="head">');
        }
      }
    }
    const firstElement = childrenOf(body).find(n => n.nodeType === 1);
    if (script && script !== firstElement) {
      this.problem(script, 'in a child layout the info block is the first thing in <body>');
    }

    const ctx = this.rootCtx();
    this.checkPageLayout(body, true);
    this.checkAnyAttrs(body, ctx, ['data-page-layout']);

    for (const node of childrenOf(body)) {
      if (node === script) continue;
      if (node.nodeType === 1 && tagOf(node) === 'template') this.slotTemplate(node, ctx);
      else if (node.nodeType === 1) this.block(node, ctx);
      else this.blockText(node, body, ctx);
    }
  }

  slotTemplate(template, ctx) {
    const name = (template.getAttribute('slot') || '').trim();
    this.checkAttrs(template, ctx);
    if (!name) {
      this.problem(template, '<template> in a child layout needs a slot name (<template slot="name">)');
      return;
    }
    if (name !== 'head') {
      this.walkBlocks(template, { ...ctx, inSlotTemplate: true });
      return;
    }
    for (const node of childrenOf(template)) {
      if (isBlank(node)) continue;
      if (node.nodeType === 3) {
        this.problemAt(template, node.textContent.trim(), 'text isn\'t allowed in the head slot');
      } else if (!HEAD_SLOT_ELEMENTS.includes(tagOf(node))) {
        this.problem(node, `<${tagOf(node)}> isn't allowed in the head slot (use meta, link, script or style)`);
      } else {
        this.checkAnyAttrs(node, ctx);
      }
    }
  }

  // FRAGMENT
  // -----------------------------
  checkFragment() {
    const { body } = this.document;
    const ctx = this.rootCtx();
    let wrappers = 0;
    for (const node of childrenOf(body)) {
      if (node.nodeType !== 1) {
        this.blockText(node, body, ctx);
        continue;
      }
      const name = tagOf(node);
      if (['header', 'nav', 'footer'].includes(name)) {
        wrappers++;
        if (wrappers === 2) {
          this.problem(node, 'a fragment has at most one header, nav or footer wrapper');
        }
        this.container(node, ctx, { repeat: false });
      } else {
        this.block(node, ctx);
      }
    }
  }

  // BLOCKS
  // -----------------------------
  rootCtx() {
    return { aliases: new Set(), inMain: false, inSlotTemplate: false };
  }

  walkBlocks(parent, ctx) {
    for (const node of childrenOf(parent)) {
      if (node.nodeType === 1) this.block(node, ctx);
      else this.blockText(node, parent, ctx);
    }
  }

  block(el, ctx) {
    const name = tagOf(el);

    // data-repeat clones whatever element it sits on, so any block may carry it
    // (containers, menus and layout elements read it themselves).
    if (el.hasAttribute('data-repeat') && !name.includes('-') && !MENU_ELEMENTS.includes(name)
        && !CONTAINER_ELEMENTS.includes(name) && !(LAYOUT_WRAPPERS.includes(name) && el.hasAttribute('data-layout'))) {
      ctx = this.repeatScope(el, ctx);
      this.repeatRead.add(el);
    }

    if (name.includes('-')) {
      if (LAYOUT_ELEMENTS.includes(name)) {
        const inner = this.repeatScope(el, ctx);
        this.checkAnyAttrs(el, inner, ['data-repeat']);
        this.walkBlocks(el, inner);
      } else {
        this.component(el, ctx);
      }
      return;
    }

    if (this.isInclude(el)) return this.include(el, ctx);
    if (MENU_ELEMENTS.includes(name)) return this.menu(el, ctx);
    if (TEXT_ELEMENTS.includes(name)) return this.textBlock(el, ctx);
    if (name === 'img') return this.checkAttrs(el, ctx);
    if (name === 'picture') return this.picture(el, ctx);
    if (name === 'figure') return this.figure(el, ctx);
    if (CONTAINER_ELEMENTS.includes(name) || (LAYOUT_WRAPPERS.includes(name) && el.hasAttribute('data-layout'))) {
      return this.container(el, ctx, { repeat: true });
    }

    this.checkHandlers(el);
    if (name === 'template') {
      this.problem(el, '<template> is only allowed as <template slot="name"> at the top of a child layout\'s <body>');
    } else if (LAYOUT_WRAPPERS.includes(name)) {
      this.problem(el, `<${name}> isn't a layout block (add data-layout, or use a layout element)`);
    } else {
      this.problem(el, `<${name}> isn't a layout block`);
    }
  }

  container(el, ctx, { repeat }) {
    const inner = repeat ? this.repeatScope(el, ctx) : ctx;
    this.checkAttrs(el, inner, repeat ? ['data-repeat'] : []);
    this.walkBlocks(el, inner);
  }

  component(el, ctx) {
    // Opaque: attributes are checked for handlers and fields, the inside is not
    this.checkAnyAttrs(el, ctx);
  }

  isInclude(el) {
    return tagOf(el) === 'div' && el.hasAttribute('data-include');
  }

  include(el, ctx) {
    this.checkAttrs(el, ctx);
    if (!childrenOf(el).every(isBlank)) {
      this.problem(el, 'an include <div data-include> must be empty');
    }
  }

  menu(el, ctx) {
    const inner = this.repeatScope(el, ctx);
    this.checkAttrs(el, inner, ['data-repeat']);
    for (const node of childrenOf(el)) {
      if (isBlank(node)) continue;
      if (node.nodeType === 3) {
        this.problemAt(el, node.textContent.trim(), `<${tagOf(el)}> holds only <li> items`);
      } else if (tagOf(node) !== 'li') {
        this.checkHandlers(node);
        this.problem(node, `<${tagOf(node)}> can't be inside <${tagOf(el)}> (a menu holds only <li> items)`);
      } else {
        const item = this.repeatScope(node, inner);
        this.repeatRead.add(node);
        this.checkAttrs(node, item);
        this.mixed(node, item);
      }
    }
  }

  /** An `li`: text-level content or blocks. */
  mixed(el, ctx) {
    for (const node of childrenOf(el)) {
      if (node.nodeType === 3) this.fieldText(node.textContent, el, ctx);
      else if (node.nodeType !== 1) continue;
      else if (INLINE_ELEMENTS.includes(tagOf(node))) this.inline(node, ctx);
      else this.block(node, ctx);
    }
  }

  textBlock(el, ctx) {
    this.checkAttrs(el, ctx);
    this.walkInline(el, ctx);
  }

  walkInline(el, ctx) {
    for (const node of childrenOf(el)) {
      if (node.nodeType === 3) this.fieldText(node.textContent, el, ctx);
      else if (node.nodeType !== 1) continue;
      else if (INLINE_ELEMENTS.includes(tagOf(node))) this.inline(node, ctx);
      else if (tagOf(node).includes('-')) this.component(node, ctx);
      else {
        this.checkHandlers(node);
        this.problem(node, `<${tagOf(node)}> can't be inside <${tagOf(el)}> (only text and ${INLINE_ELEMENTS.join(', ')})`);
      }
    }
  }

  inline(el, ctx) {
    this.checkAttrs(el, ctx);
    this.walkInline(el, ctx);
  }

  picture(el, ctx) {
    this.checkAttrs(el, ctx);
    for (const node of childrenOf(el)) {
      if (isBlank(node)) continue;
      if (node.nodeType === 1 && ['source', 'img'].includes(tagOf(node))) this.checkAttrs(node, ctx);
      else if (node.nodeType === 1) this.problem(node, `<${tagOf(node)}> can't be inside <picture> (only source and img)`);
      else this.problemAt(el, node.textContent.trim(), '<picture> holds only source and img');
    }
  }

  figure(el, ctx) {
    this.checkAttrs(el, ctx);
    for (const node of childrenOf(el)) {
      if (isBlank(node)) continue;
      const name = node.nodeType === 1 ? tagOf(node) : null;
      if (name === 'img' || name === 'picture' || name === 'figcaption') this.block(node, ctx);
      else if (name) this.problem(node, `<${name}> can't be inside <figure> (only img, picture and figcaption)`);
      else this.problemAt(el, node.textContent.trim(), '<figure> holds only img, picture and figcaption');
    }
  }

  // TEXT AND PLACEHOLDERS
  // -----------------------------
  /**
   * Text directly inside a block container: only `${content}` and a lone
   * `${slot:x}` may appear there.
   */
  blockText(node, parent, ctx) {
    if (isBlank(node)) return;
    const text = node.textContent;
    let rest = text;
    for (const match of text.matchAll(PLACEHOLDER)) {
      const key = match[1].trim();
      const slot = key.match(SLOT_KEY);
      if (key === 'content') {
        this.useContent(parent, ctx);
        rest = rest.replace(match[0], '');
      } else if (slot) {
        this.useSlot(slot[1], parent);
        const alone = text.trim() === match[0]
          && childrenOf(parent).every(n => n === node || n.nodeType === 8 || (n.nodeType === 3 && !n.textContent.trim()));
        if (!alone) this.problemAt(parent, match[0], `${match[0]} must be alone inside its element`);
        rest = rest.replace(match[0], '');
      }
    }
    rest = rest.trim();
    if (rest) {
      const shown = rest.length > 40 ? `${rest.slice(0, 40)}…` : rest;
      this.problemAt(parent, rest.split(/\s/)[0], `text "${shown}" must be inside a text element (p, h1–h6, …)`);
    }
  }

  /** Text where fields are allowed (text blocks, inline elements, title, attributes). */
  fieldText(text, el, ctx, { attr = null } = {}) {
    for (const match of text.matchAll(PLACEHOLDER)) {
      const raw = match[1];
      const key = raw.trim();
      const where = attr ? ` in ${attr}=` : '';
      if (raw.startsWith('{')) {
        this.problemAt(el, match[0], `${match[0]}}${where} isn't allowed in a layout (use a plain field like \${title})`);
      } else if (key === 'content' || SLOT_KEY.test(key)) {
        if (key === 'content') this.useContent(el, ctx);
        else this.useSlot(key.match(SLOT_KEY)[1], el);
        this.problemAt(el, match[0], `${match[0]}${where} can't be inside text or an attribute; put it directly in a block`);
      } else if (!PLAIN_KEY.test(key)) {
        this.problemAt(el, match[0], `${match[0]}${where} isn't a plain field (layouts can't use expressions)`);
      } else {
        this.checkField(key, el, ctx, match[0]);
      }
    }
  }

  checkField(key, el, ctx, needle = key) {
    const root = key.split('.')[0];
    if (ctx.aliases.has(root) || this.known.has(root)) return;
    this.problemAt(el, needle, `unknown field "${key}"`);
  }

  useContent(el, ctx) {
    this.contents.push({ el });
    if (this.kind === 'base' && !ctx.inMain) {
      this.problemAt(el, '${content}', '${content} must be inside <main>');
    }
    if (this.kind === 'child' && ctx.inSlotTemplate) {
      this.problemAt(el, '${content}', '${content} can\'t be inside a slot template');
    }
  }

  useSlot(name, el) {
    if (!this.slotUses.has(name)) this.slotUses.set(name, el);
  }

  // ATTRIBUTES
  // -----------------------------
  checkHandlers(el) {
    for (const { name } of Array.from(el.attributes)) {
      if (/^on/i.test(name)) {
        this.problem(el, `<${tagOf(el)}> has an inline event handler (${name}); layouts can't carry script in attributes`);
      }
    }
  }

  /** Check attributes against the block vocabulary. */
  checkAttrs(el, ctx, handled = []) {
    this.attrs(el, ctx, handled, false);
  }

  /** Check attributes allowing any name (head items, components, layout elements, html/body). */
  checkAnyAttrs(el, ctx, handled = []) {
    this.attrs(el, ctx, handled, true);
  }

  attrs(el, ctx, handled, anyName) {
    const name = tagOf(el);
    const extra = ELEMENT_ATTRS[name] || [];
    for (const { name: attr, value } of Array.from(el.attributes)) {
      const lower = attr.toLowerCase();
      if (/^on/.test(lower)) {
        this.problem(el, `<${name}> has an inline event handler (${attr}); layouts can't carry script in attributes`);
        continue;
      }
      if (handled.includes(lower)) continue;
      if (lower === 'data-repeat' && this.repeatRead.has(el)) continue;
      if (lower === 'data-repeat') {
        this.problem(el, `<${name}> can't repeat (data-repeat goes on a container or a ul/ol/menu)`);
        continue;
      }
      if (lower === 'data-if' || lower === 'data-unless') {
        this.condition(el, lower, value, ctx);
        continue;
      }
      if (!anyName && !isGlobalAttr(lower) && !extra.includes(lower)) {
        this.problem(el, `<${name}> can't carry the attribute "${attr}"`);
        continue;
      }
      if (lower === 'data-layout-info') continue;
      this.fieldText(value, el, ctx, { attr });
    }
  }

  condition(el, attr, value, ctx) {
    const key = value.trim();
    const slot = key.match(SLOT_KEY);
    if (slot) {
      if (this.declaredSlots && !this.declaredSlots.has(slot[1])) {
        this.problem(el, `${attr}="${key}" names a slot the info block doesn't declare`);
      }
    } else if (PLAIN_KEY.test(key)) {
      this.checkField(key, el, ctx, `"${value}"`);
    } else {
      this.problem(el, `${attr}="${value}" must name one field, slot:name or item.field`);
    }
  }

  /**
   * Read an element's data-repeat (if any) and return the scope inside it.
   */
  repeatScope(el, ctx) {
    if (!el.hasAttribute('data-repeat')) return ctx;
    const expr = el.getAttribute('data-repeat').trim();
    const match = expr.match(REPEAT);
    if (!match) {
      this.problem(el, `data-repeat="${expr}" must read "source as item" (optionally "| limit:N", "| offset:N", ", index")`);
      return ctx;
    }
    const [source, ...pipes] = match[1].split('|').map(p => p.trim());
    for (const pipe of pipes) {
      if (!PIPE.test(pipe)) this.problem(el, `data-repeat pipe "${pipe}" isn't known (use limit:N or offset:N)`);
    }
    if (!this.isListSource(source, ctx)) {
      this.problem(el, `data-repeat source "${source}" isn't a list (use collections.<name>, programs, programAreas.<area> or a data array)`);
    }
    const aliases = new Set(ctx.aliases);
    aliases.add(match[2]);
    if (match[3]) aliases.add(match[3]);
    return { ...ctx, aliases };
  }

  isListSource(source, ctx) {
    if (!PLAIN_KEY.test(source)) return false;
    const parts = source.split('.');
    const [root] = parts;
    if (ctx.aliases.has(root)) return true;
    if (root === 'collections' || root === 'programAreas') return parts.length === 2;
    if (root === 'programs') return parts.length === 1;
    return this.listRoots.has(root);
  }
}

/**
 * Check a layout or include fragment against format 1.
 * @param {string} html - The layout's source
 * @param {Object} [opts]
 * @property {string[]} [opts.fields=[]] - Extra known field names (site and declared fields)
 * @property {string[]} [opts.lists=[]] - Extra list-source roots (top-level data arrays)
 * @property {boolean} [opts.fragment=false] - Check the source as an include fragment
 * @returns {{ ok: boolean, kind: 'base'|'child'|'fragment'|'plain', info: Object|null,
 *   parent: string|null, slots: string[], fields: string[], problems: Array<{ line: number, message: string }> }}
 */
export function checkLayout(html, { fields = [], lists = [], fragment = false } = {}) {
  const parsed = parseLayoutSource(html, { fragment });
  const scan = scanSource(html);
  const hasInfo = Boolean(parsed.document.querySelector('script[data-layout-info]'));

  if (parsed.kind !== 'fragment' && !hasInfo) {
    return {
      ok: false, kind: 'plain', info: null, parent: parsed.parent,
      slots: scan.slots, fields: scan.fields, problems: [],
    };
  }

  const checker = new Checker(html, parsed, { fields, lists });
  checker.run();
  return {
    ok: checker.problems.length === 0,
    kind: parsed.kind,
    info: parsed.info,
    parent: parsed.parent,
    slots: scan.slots,
    fields: scan.fields,
    problems: checker.problems,
  };
}
