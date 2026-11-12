/**
 * @file vocabulary.js
 * @description The fixed vocabulary of format-1 layouts: the format
 * number, the VB page layouts, the document fields, and the element and
 * attribute sets of the block table.
 */

/** The layout format this Cook reads and checks. */
export const FORMAT = 1;

/** Values VB accepts for `data-page-layout` on `<body>`. */
export const PAGE_LAYOUTS = [
  '', 'stack', 'sidebar-left', 'sidebar-right', 'holy-grail',
  'app-shell', 'dashboard', 'article', 'landing',
];

/** Front-matter keys a document may carry, plus derived fields. */
export const DOCUMENT_FIELDS = [
  'title', 'description', 'date', 'published', 'updated', 'author', 'tags',
  'image', 'imageAlt', 'theme', 'themeScope', 'layout', 'slug', 'vp_id',
  'url', 'pageLayout',
];

/** Elements allowed in a base layout's `<head>`. */
export const HEAD_ELEMENTS = ['meta', 'link', 'title', 'script', 'style', 'base'];

/** Elements allowed in a child's `<template slot="head">`. */
export const HEAD_SLOT_ELEMENTS = ['meta', 'link', 'script', 'style'];

/** Text blocks: static text, fields and inline elements. */
export const TEXT_ELEMENTS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'small', 'figcaption', 'blockquote'];

/** Inline elements allowed inside text blocks. */
export const INLINE_ELEMENTS = ['a', 'strong', 'em', 'span', 'time', 'br', 'img', 'abbr', 'code'];

/** Sectioning elements: containers without needing `data-layout`. */
export const SECTIONING = ['article', 'aside', 'nav', 'section'];

/** Containers that never need `data-layout`: sectioning plus header and footer. */
export const CONTAINER_ELEMENTS = [...SECTIONING, 'header', 'footer'];

/** Elements that may wrap other blocks when they carry `data-layout`. */
export const LAYOUT_WRAPPERS = ['div', ...CONTAINER_ELEMENTS];

/** Menu elements: their children are `li`. */
export const MENU_ELEMENTS = ['ul', 'ol', 'menu'];

/** Image blocks. */
export const IMAGE_ELEMENTS = ['img', 'picture', 'figure'];

/** VB layout custom elements: containers that hold blocks. */
export const LAYOUT_ELEMENTS = [
  'layout-stack', 'layout-grid', 'layout-cluster', 'layout-sidebar',
  'layout-center', 'layout-cover', 'layout-columns', 'layout-switcher',
  'layout-reel', 'layout-imposter', 'layout-card', 'layout-text',
  'layout-canvas', 'layout-badge',
];

/** Body children of a base layout (besides includes). */
export const BODY_REGIONS = ['header', 'nav', 'main', 'aside', 'footer'];

/**
 * Attributes any block may carry. `aria-*` and `data-*` are allowed by
 * prefix (see `isGlobalAttr`).
 */
export const GLOBAL_ATTRS = ['id', 'class', 'role', 'lang', 'dir', 'title', 'hidden'];

/** Extra attributes per element, beyond GLOBAL_ATTRS. */
export const ELEMENT_ATTRS = {
  a: ['href', 'rel', 'target', 'hreflang', 'download', 'type'],
  img: ['src', 'alt', 'width', 'height', 'loading', 'decoding', 'srcset', 'sizes', 'fetchpriority'],
  source: ['src', 'srcset', 'sizes', 'media', 'type', 'width', 'height'],
  time: ['datetime'],
  blockquote: ['cite'],
  ol: ['start', 'reversed', 'type'],
  li: ['value'],
  template: ['slot'],
};

/**
 * Is `name` an attribute any block may carry?
 * @param {string} name - lower-case attribute name
 * @returns {boolean}
 */
export function isGlobalAttr(name) {
  return GLOBAL_ATTRS.includes(name) || name.startsWith('aria-') || name.startsWith('data-');
}
