/**
 * @file conditionals.js
 * @description `data-if="key"` / `data-unless="key"` sections.
 *
 * A tag-matching string transform, never a DOM re-serialize: bytes outside
 * an affected element never change, and HTML with no marker comes back as
 * the same string. For a key the lookup knows, the element is removed
 * (`data-if` and not set, or `data-unless` and set) or the attribute is
 * stripped (with its preceding whitespace). An unknown key is left in place
 * for a later pass.
 *
 * Evaluation happens in three places:
 * - layout time (`layoutConditionals`, via render.js): page fields, slots
 *   and site data;
 * - each `data-repeat` item (repeat-collection.js): `alias.x` keys;
 * - the late pass (`lateConditionals`, conditional-sections.js): whatever
 *   is left, from site data and front matter, missing meaning not set.
 *
 * Keys whose first segment is the alias of an enclosing `data-repeat`
 * (`… as post`, `… as item, index`) are never looked up here: they belong
 * to the repeat, which resolves them per item.
 */

import { getNested } from '../interpolate/interpolate.js';

const MARKER = /data-(?:if|unless)/i;
const CONDITIONAL_ATTR = /^data-(if|unless)$/i;
const REPEAT_ATTR = /^data-repeat$/i;
const REPEAT_ALIASES = /\sas\s+(\w+)(?:\s*,\s*(\w+))?\s*$/;

const VOID = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'keygen',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);
// Elements whose content is text, not markup
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title']);

const isSpace = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f';
const isLetter = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');

/**
 * Whether a value counts as set: false for undefined, null, '', false, []
 * and whitespace-only strings; true otherwise.
 * @param {*} value
 * @returns {boolean}
 */
export function isSet(value) {
  if (value === undefined || value === null || value === false) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/**
 * Read the tag that starts at `i` (which holds `<`).
 * @param {string} html
 * @param {number} i
 * @returns {null|{ type: 'start'|'end'|'other', name?: string, end: number,
 *   selfClosing?: boolean, attrs?: Array<{ name: string, value: string|null, start: number, end: number }> }}
 *   null when the `<` is plain text. Attribute `start` includes the
 *   whitespace before the attribute.
 */
function readTag(html, i) {
  const len = html.length;
  const next = html[i + 1];

  // Comment
  if (html.startsWith('<!--', i)) {
    const close = html.indexOf('-->', i + 4);
    return { type: 'other', end: close === -1 ? len : close + 3 };
  }
  // Doctype, CDATA, processing instruction
  if (next === '!' || next === '?') {
    const close = html.indexOf('>', i + 2);
    return { type: 'other', end: close === -1 ? len : close + 1 };
  }
  // End tag
  if (next === '/') {
    if (!isLetter(html[i + 2] || '')) return null;
    let p = i + 2;
    while (p < len && !isSpace(html[p]) && html[p] !== '/' && html[p] !== '>') p++;
    const name = html.slice(i + 2, p).toLowerCase();
    const close = html.indexOf('>', p);
    return { type: 'end', name, end: close === -1 ? len : close + 1 };
  }
  // Start tag
  if (!isLetter(next || '')) return null;
  let p = i + 1;
  while (p < len && !isSpace(html[p]) && html[p] !== '/' && html[p] !== '>') p++;
  const name = html.slice(i + 1, p).toLowerCase();

  const attrs = [];
  let selfClosing = false;
  let end = len;
  while (p < len) {
    const start = p;
    while (p < len && isSpace(html[p])) p++;
    if (p >= len) break;
    const c = html[p];
    if (c === '>') { end = p + 1; break; }
    if (c === '/') {
      if (html[p + 1] === '>') { selfClosing = true; end = p + 2; break; }
      p++;
      continue;
    }
    // Attribute name
    const nameStart = p;
    p++; // at least one character (covers a stray `=` or quote)
    while (p < len && !isSpace(html[p]) && html[p] !== '/' && html[p] !== '>' && html[p] !== '=') p++;
    const attrName = html.slice(nameStart, p);
    // Optional value
    let value = null;
    let q = p;
    while (q < len && isSpace(html[q])) q++;
    if (html[q] === '=') {
      q++;
      while (q < len && isSpace(html[q])) q++;
      const quote = html[q];
      if (quote === '"' || quote === "'") {
        const close = html.indexOf(quote, q + 1);
        const valueEnd = close === -1 ? len : close;
        value = html.slice(q + 1, valueEnd);
        p = close === -1 ? len : close + 1;
      } else {
        const valueStart = q;
        while (q < len && !isSpace(html[q]) && html[q] !== '>') q++;
        value = html.slice(valueStart, q);
        p = q;
      }
    }
    attrs.push({ name: attrName, value, start, end: p });
  }

  return { type: 'start', name, attrs, selfClosing, end };
}

/**
 * Index just past the close tag of a raw-text element whose start tag
 * ends at `from` (end of input when it never closes).
 */
function rawTextEnd(html, name, from) {
  const pattern = new RegExp(`</${name}(?=[\\s/>])`, 'gi');
  pattern.lastIndex = from;
  const m = pattern.exec(html);
  if (!m) return html.length;
  const close = html.indexOf('>', m.index);
  return close === -1 ? html.length : close + 1;
}

// Start tags that close an open <p>
const CLOSES_P = new Set([
  'address', 'article', 'aside', 'blockquote', 'details', 'div', 'dl',
  'fieldset', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3',
  'h4', 'h5', 'h6', 'header', 'hgroup', 'hr', 'main', 'menu', 'nav', 'ol',
  'p', 'pre', 'section', 'table', 'ul',
]);
// Elements with an optional end tag, and the start tags that end them
const IMPLIED_END = {
  li: new Set(['li']),
  dt: new Set(['dt', 'dd']),
  dd: new Set(['dt', 'dd']),
  option: new Set(['option', 'optgroup']),
  optgroup: new Set(['optgroup']),
  tr: new Set(['tr', 'tbody', 'thead', 'tfoot']),
  td: new Set(['td', 'th', 'tr', 'tbody', 'thead', 'tfoot']),
  th: new Set(['td', 'th', 'tr', 'tbody', 'thead', 'tfoot']),
  thead: new Set(['tbody', 'tfoot']),
  tbody: new Set(['tbody', 'tfoot']),
};

/** Whether a `<startName>` start tag ends an open `open` element. */
function closesImplicitly(open, startName) {
  if (open === 'p') return CLOSES_P.has(startName);
  return !!IMPLIED_END[open] && IMPLIED_END[open].has(startName);
}

/**
 * Index just past the element whose start tag was read at `tag`.
 * Void and self-closing elements end with their tag. Nested elements of
 * the same name are counted. HTML's optional end tags are modelled: a
 * `p` ends at a start tag that closes a p, an `li` at the next `li`, a
 * `dt`/`dd` at the next dt/dd, an `option` at option/optgroup, a `tr` at
 * tr, a `td`/`th` at td/th/tr. Any element ends where a close tag for
 * something not open inside it appears (its parent closing), or at the
 * end of input, so removal never runs past the enclosing element.
 */
function elementEnd(html, tag) {
  if (VOID.has(tag.name) || tag.selfClosing) return tag.end;
  if (RAW_TEXT.has(tag.name)) return rawTextEnd(html, tag.name, tag.end);

  const stack = [tag.name];
  let j = tag.end;
  while (true) {
    const k = html.indexOf('<', j);
    if (k === -1) return html.length;
    const t = readTag(html, k);
    if (!t) { j = k + 1; continue; }
    if (t.type === 'start') {
      // Optional end tags: this start tag may close open elements
      while (stack.length && closesImplicitly(stack[stack.length - 1], t.name)) stack.pop();
      if (!stack.length) return k;
      if (RAW_TEXT.has(t.name) && !t.selfClosing) j = rawTextEnd(html, t.name, t.end);
      else {
        if (!VOID.has(t.name) && !t.selfClosing) stack.push(t.name);
        j = t.end;
      }
    } else if (t.type === 'end') {
      const at = stack.lastIndexOf(t.name);
      if (at === -1) return k; // a parent closing: the element ended implicitly
      stack.length = at;
      if (!stack.length) return t.end;
      j = t.end;
    } else {
      j = t.end;
    }
  }
}

/**
 * Apply `data-if` / `data-unless` to HTML.
 * @param {string} html - A fragment or a full document
 * @param {(key: string) => { known: boolean, value?: any }} lookup
 * @returns {string} `html` itself when it has no marker
 */
export function applyConditionals(html, lookup) {
  if (typeof html !== 'string' || !MARKER.test(html)) return html;

  let out = '';
  let copied = 0;
  let i = 0;
  // Enclosing data-repeat elements: { end, aliases }
  const repeats = [];
  const aliased = (key) => {
    const first = key.split('.')[0];
    return repeats.some((r) => r.aliases.includes(first));
  };

  while ((i = html.indexOf('<', i)) !== -1) {
    const tag = readTag(html, i);
    if (!tag) { i++; continue; }
    if (tag.type !== 'start') { i = tag.end; continue; }

    while (repeats.length && repeats[repeats.length - 1].end <= i) repeats.pop();

    // A data-repeat's aliases cover the element itself and everything in it
    let pushedRepeat = false;
    const repeat = tag.attrs.find((a) => REPEAT_ATTR.test(a.name));
    const aliasMatch = repeat && repeat.value && repeat.value.match(REPEAT_ALIASES);
    if (aliasMatch) {
      repeats.push({ end: elementEnd(html, tag), aliases: [aliasMatch[1], aliasMatch[2]].filter(Boolean) });
      pushedRepeat = true;
    }

    let remove = false;
    const strip = [];
    for (const attr of tag.attrs) {
      const kind = attr.name.match(CONDITIONAL_ATTR);
      if (!kind) continue;
      const key = (attr.value || '').trim();
      if (!key || aliased(key)) continue;
      const result = lookup(key);
      if (!result || !result.known) continue;
      const set = isSet(result.value);
      const keep = kind[1].toLowerCase() === 'if' ? set : !set;
      if (keep) strip.push(attr);
      else remove = true;
    }

    if (remove) {
      const end = elementEnd(html, tag);
      out += html.slice(copied, i);
      copied = end;
      i = end;
      if (pushedRepeat) repeats.pop();
      continue;
    }

    if (strip.length) {
      let rebuilt = '';
      let from = i;
      for (const attr of strip) {
        rebuilt += html.slice(from, attr.start);
        from = attr.end;
      }
      rebuilt += html.slice(from, tag.end);
      out += html.slice(copied, i) + rebuilt;
      copied = tag.end;
    }

    // Raw text is not markup: skip to its close tag
    i = RAW_TEXT.has(tag.name) && !tag.selfClosing ? rawTextEnd(html, tag.name, tag.end) : tag.end;
  }

  if (copied === 0) return html;
  return out + html.slice(copied);
}

/**
 * The value of a key in an object: `slot:*` keys are flat, others may be
 * dotted paths.
 */
function valueOf(obj, key) {
  if (!obj) return undefined;
  if (Object.hasOwn(obj, key)) return obj[key];
  return getNested(obj, key);
}

const hasRoot = (obj, key) => !!obj && typeof obj === 'object' && Object.hasOwn(obj, key.split('.')[0]);

/**
 * Layout-time conditionals (the `conditionals` hook of renderLayout).
 * Known: `slot:*` keys (set = non-blank), keys in page data, keys in site
 * data. Anything else is left for the late pass.
 * @param {string} html
 * @param {Object} pageData
 * @param {Object} data
 * @returns {string}
 */
export function layoutConditionals(html, pageData = {}, data = {}) {
  const lookup = (key) => {
    if (key.startsWith('slot:')) return { known: true, value: pageData ? pageData[key] : undefined };
    if (hasRoot(pageData, key)) return { known: true, value: valueOf(pageData, key) };
    if (hasRoot(data, key)) return { known: true, value: valueOf(data, key) };
    return { known: false };
  };
  const result = applyConditionals(html, lookup);

  // A whole child-layout slot template: render.js unwraps it, so its own
  // data-if/data-unless never reaches a later pass. Decide it now, a key
  // still unknown counting as not set.
  if (typeof result !== 'string') return result;
  const lead = result.match(/^\s*/)[0].length;
  const tag = result[lead] === '<' ? readTag(result, lead) : null;
  if (tag && tag.type === 'start' && tag.name === 'template'
    && tag.attrs.some((a) => /^slot$/i.test(a.name))
    && tag.attrs.some((a) => CONDITIONAL_ATTR.test(a.name))) {
    const openTag = result.slice(lead, tag.end);
    const decided = applyConditionals(`${openTag}</template>`, (key) => {
      const r = lookup(key);
      return r.known ? r : { known: true, value: undefined };
    });
    // Removed: only this template element goes, what follows stays
    if (!decided) return result.slice(0, lead) + result.slice(elementEnd(result, tag));
    return result.slice(0, lead) + decided.slice(0, -'</template>'.length) + result.slice(tag.end);
  }
  return result;
}

/**
 * Late-pass conditionals: every key is known; a missing one is not set.
 * @param {string} html
 * @param {Object} values - `{ ...data, ...frontMatter }`
 * @returns {string}
 */
export function lateConditionals(html, values = {}) {
  return applyConditionals(html, (key) => ({ known: true, value: valueOf(values, key) }));
}
