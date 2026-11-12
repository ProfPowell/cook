/**
 * @file serialize.js
 * @description Write a layout tree (see tree.js) as canonical format-1 HTML:
 * two-space indent, one block per line, the info block first as pretty
 * JSON, double-quoted attributes in a fixed order (data-template,
 * data-page-layout, the rest as the tree has them, then data-repeat,
 * data-if, data-unless), text blocks on one line. Component inner HTML,
 * comments, picture sources and inline script and style text are written
 * exactly as the tree holds them.
 */

const INDENT = '  ';

const escapeAttr = (value) => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const escapeText = (text) => text
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/ /g, '&nbsp;');

/** ` name="value"` for each pair. */
const attrString = (pairs) => pairs.map(([name, value]) => ` ${name}="${escapeAttr(value)}"`).join('');

/** A data-repeat value from its parts. */
function repeatValue({ source, pipes = [], alias, index }) {
  return `${[source, ...pipes].join(' | ')} as ${alias}${index ? `, ${index}` : ''}`;
}

/**
 * The attributes of a block or item, in canonical order.
 * @param {Object} node - has `attrs` and optional `repeat`, `if`, `unless`
 * @param {Array<[string, string]>} [lead] - attributes that go first
 */
function blockAttrs(node, lead = []) {
  const pairs = [...lead, ...(node.attrs || [])];
  if (node.repeat) pairs.push(['data-repeat', repeatValue(node.repeat)]);
  if (node.if !== undefined) pairs.push(['data-if', node.if]);
  if (node.unless !== undefined) pairs.push(['data-unless', node.unless]);
  return attrString(pairs);
}

/** The info block's lines, JSON indented with the script. */
function infoLines(info, indent) {
  const json = JSON.stringify(info, null, 2).replace(/</g, '\\u003c');
  return [
    `${indent}<script type="application/json" data-layout-info>`,
    ...json.split('\n').map(line => indent + line),
    `${indent}</script>`,
  ];
}

// INLINE
// -----------------------------
function inlineHtml(runs = []) {
  return runs.map((run) => {
    if ('field' in run) return `\${${run.field}}`;
    if ('text' in run) return escapeText(run.text);
    const open = `<${run.tag}${attrString(run.attrs || [])}>`;
    if (run.tag === 'br' || run.tag === 'img') return open;
    return `${open}${inlineHtml(run.inline)}</${run.tag}>`;
  }).join('');
}

// HEAD
// -----------------------------
function headLine(item, indent) {
  if (item.slot) return `${indent}\${slot:${item.slot}}`;
  const open = `<${item.tag}${blockAttrs(item)}>`;
  if (item.tag === 'title') return `${indent}${open}${escapeText(item.text ?? '').replace(/&gt;/g, '>')}</title>`;
  if (item.tag === 'script' || item.tag === 'style') return `${indent}${open}${item.text ?? ''}</${item.tag}>`;
  return indent + open;
}

// BLOCKS
// -----------------------------
/** Open tag, children one level in, close tag; or one line when empty. */
function wrap(open, close, children, indent) {
  if (children.length === 0) return [`${indent}${open}${close}`];
  return [`${indent}${open}`, ...children, `${indent}${close}`];
}

function blockLines(block, indent) {
  const inner = indent + INDENT;
  switch (block.type) {
    case 'content':
      return [`${indent}\${content}`];
    case 'slot':
      return [`${indent}\${slot:${block.name}}`];
    case 'comment':
      return [`${indent}<!--${block.text}-->`];
    case 'text':
      return [`${indent}<${block.tag}${blockAttrs(block)}>${inlineHtml(block.inline)}</${block.tag}>`];
    case 'image':
      if (block.tag === 'picture') return [`${indent}<picture${blockAttrs(block)}>${block.html ?? ''}</picture>`];
      return [`${indent}<img${blockAttrs(block)}>`];
    case 'container':
      return wrap(`<${block.tag}${blockAttrs(block)}>`, `</${block.tag}>`, blocksLines(block.body, inner), indent);
    case 'menu':
      return wrap(`<${block.tag}${blockAttrs(block)}>`, `</${block.tag}>`,
        (block.items || []).flatMap(item => itemLines(item, inner)), indent);
    case 'include':
      return [`${indent}<div${blockAttrs(block, [['data-include', block.path]])}></div>`];
    case 'component':
      return [`${indent}<${block.tag}${blockAttrs(block)}>${block.html ?? ''}</${block.tag}>`];
    default:
      throw new Error(`serializeLayout: unknown block type "${block.type}"`);
  }
}

function itemLines(item, indent) {
  const open = `<li${blockAttrs(item)}>`;
  if (item.body) return wrap(open, '</li>', blocksLines(item.body, indent + INDENT), indent);
  return [`${indent}${open}${inlineHtml(item.inline)}</li>`];
}

const blocksLines = (blocks = [], indent) => blocks.flatMap(block => blockLines(block, indent));

function slotLines(slot, indent) {
  const open = `<template${blockAttrs(slot, [['slot', slot.name]])}>`;
  const children = slot.name === 'head'
    ? (slot.body || []).map(item => headLine(item, indent + INDENT))
    : blocksLines(slot.body, indent + INDENT);
  return wrap(open, '</template>', children, indent);
}

/**
 * Write a layout tree as canonical format-1 HTML.
 * @param {Object} tree - A tree from parseLayout (or edited from one)
 * @returns {string}
 */
export function serializeLayout(tree) {
  const lines = [];
  if (tree.kind === 'base') {
    lines.push('<!doctype html>', `<html${attrString(tree.htmlAttrs || [])}>`, '<head>');
    if (tree.info) lines.push(...infoLines(tree.info, INDENT));
    lines.push(...(tree.head || []).map(item => headLine(item, INDENT)), '</head>');
    const body = [];
    if (tree.pageLayout !== null && tree.pageLayout !== undefined) body.push(['data-page-layout', tree.pageLayout]);
    lines.push(`<body${attrString(body)}>`, ...blocksLines(tree.body, INDENT), '</body>', '</html>');
  } else if (tree.kind === 'child') {
    // Variables are raw strings, as render.js reads them: only `"` is escaped
    const vars = (tree.vars || []).map(([name, value]) =>
      ` data-${name.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`)}="${String(value).replace(/"/g, '&quot;')}"`).join('');
    const pageLayout = tree.pageLayout !== null && tree.pageLayout !== undefined
      ? ` data-page-layout="${String(tree.pageLayout).replace(/"/g, '&quot;')}"` : '';
    lines.push(`<body data-template="${escapeAttr(tree.parent ?? '')}"${pageLayout}${vars}>`);
    if (tree.info) lines.push(...infoLines(tree.info, INDENT));
    lines.push(...blocksLines(tree.body, INDENT));
    for (const slot of tree.slots || []) lines.push(...slotLines(slot, INDENT));
    lines.push('</body>');
  } else {
    lines.push('<!-- layout-fragment -->', ...blocksLines(tree.body, ''));
  }
  return `${lines.join('\n')}\n`;
}
